import { describe, expect, it, vi } from 'vitest';
import { checkTransactionFee, type InputValueResolver } from '../feeVerification';

// A real composed order: 1 input, an OP_RETURN output (0 sats) and a change
// output of 0x60bf = 24767 sats.
const RAW_TX = '020000000133997605bfe854fd8bdd784b47bd3b423488e64cc5fb5820e0f8d134670b0b670100000000ffffffff020000000000000000356a3380ada95da1b59fdc5a4ed690798435687c8f9060f0318d3f63009c00fe09da18780b4b57f245152a77e0b5ed88b3511ad1c5cfbf600000000000001976a9145c333992ab554e7573df3d2a412df750a60d1f5b88ac00000000';
const OUTPUT_TOTAL = 24767; // 0 (OP_RETURN) + 24767 (change)

/** A resolver that answers with a fixed value for whichever inputs it is asked about. */
function resolverReturning(value: number): InputValueResolver {
  const resolver: InputValueResolver = async (inputs) =>
    new Map(inputs.map(({ txid, vout }) => [`${txid}:${vout}`, value]));
  return vi.fn(resolver);
}

/** A resolver standing in for an explorer lookup that answers nothing. */
const failingResolver: InputValueResolver = vi.fn(async () => new Map());

describe('checkTransactionFee', () => {
  it('accepts a normal fee', async () => {
    const result = await checkTransactionFee({
      rawTransaction: RAW_TX,
      userFeeRate: 10,
    }, resolverReturning(OUTPUT_TOTAL + 2000));

    expect(result.ok).toBe(true);
    expect(result.computedFee).toBe(2000);
  });

  it('rejects a drain-to-fee transaction (implied rate absurd)', async () => {
    // Whole 1 BTC input, tiny outputs -> the rest is fee
    const result = await checkTransactionFee({
      rawTransaction: RAW_TX,
      userFeeRate: 10,
    }, resolverReturning(100_000_000));

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/abnormally high|far exceeds/i);
  });

  it('coerces a string user rate (the form value) and still bounds the fee', () => {
    // Regression: the composer passes sat_per_vbyte as a form string. A numeric
    // typeof guard would silently disable this bound.
    return expect(checkTransactionFee({
      rawTransaction: RAW_TX,
      userFeeRate: '10',
    }, resolverReturning(OUTPUT_TOTAL + 150_000))).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/exceeds your selected rate/i),
    });
  });

  it('rejects a fee far above the user-selected rate', async () => {
    // ~150k sat fee on a ~185 vbyte tx is ~800 sat/vB — under the absolute cap
    // but ~80x the user's 10 sat/vB selection.
    const result = await checkTransactionFee({
      rawTransaction: RAW_TX,
      userFeeRate: 10,
    }, resolverReturning(OUTPUT_TOTAL + 150_000));

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceeds your selected rate/i);
  });

  it('rejects outputs exceeding inputs', async () => {
    const result = await checkTransactionFee({
      rawTransaction: RAW_TX,
      userFeeRate: 10,
    }, resolverReturning(OUTPUT_TOTAL - 1));

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceed inputs/i);
  });

  it('allows a modest fee when no user rate is set', async () => {
    const result = await checkTransactionFee({
      rawTransaction: RAW_TX,
      userFeeRate: null,
    }, resolverReturning(OUTPUT_TOTAL + 3000));

    expect(result.ok).toBe(true);
  });
});

describe('input values are never taken from the compose response', () => {
  it('resolves every input independently, whatever the response claimed', async () => {
    // The check used to accept the response's own input values for SegWit wallets, on the BIP-143
    // argument that a signature commits to the amount. Trezor shipped that reasoning and it was
    // broken in 2020 by replaying signatures across confirmation rounds, so the assumption is gone:
    // the resolver is the only source of input values, and it is always consulted.
    const resolve = resolverReturning(100_000_000);
    const result = await checkTransactionFee({
      rawTransaction: RAW_TX,
      userFeeRate: 10,
    }, resolve);

    expect(resolve).toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/abnormally high|far exceeds/i);
  });

  it('refuses the transaction when the values cannot be established', async () => {
    const result = await checkTransactionFee({
      rawTransaction: RAW_TX,
      userFeeRate: 10,
    }, failingResolver);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/could not establish/i);
  });

  it('refuses when the resolver throws', async () => {
    const result = await checkTransactionFee({
      rawTransaction: RAW_TX,
      userFeeRate: 10,
    }, async () => { throw new Error('network down'); });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/could not establish/i);
  });

  it('refuses a partial answer rather than summing what it got', async () => {
    // A resolver that answers for no outpoint at all cannot bound the fee; neither can one that
    // answers for some. Both are treated as unresolved.
    const partial: InputValueResolver = async () => new Map([['unrelated:0', 50_000]]);

    const result = await checkTransactionFee({
      rawTransaction: RAW_TX,
      userFeeRate: 10,
    }, partial);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/could not establish/i);
  });
});
