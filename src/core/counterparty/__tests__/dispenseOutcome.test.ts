/**
 * Pins core's dispense payout arithmetic, and the refusal to price an oracle dispenser.
 *
 * Both cases here were live divergences in the compose review screen, which worked the payout out
 * inline: it never applied the `give_remaining` cap and it ran oracle dispensers through the
 * fixed-rate formula. Neither could be caught by anything, because nothing compared the result to
 * `messages/dispense.py`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describePayout, resolveDispensersAt } from '@/core/counterparty/dispenseOutcome';
import { oracleDispenserWarning, oracleDispenseWarning } from '@/core/counterparty/oraclePolicy';

vi.mock('@/core/counterparty/api', () => ({
  fetchAddressDispensers: vi.fn(),
}));

const { fetchAddressDispensers } = await import('@/core/counterparty/api');
const mocked = vi.mocked(fetchAddressDispensers);

const dispenser = (overrides: Record<string, unknown> = {}) => ({
  tx_hash: 'a'.repeat(64),
  source: 'bc1qsource',
  asset: 'PEPECASH',
  status: 0,
  satoshirate: 10_000,
  give_quantity: 100_000_000,
  give_quantity_normalized: '1.00000000',
  give_remaining: 1_000_000_000,
  give_remaining_normalized: '10.00000000',
  ...overrides,
});

const respond = (dispensers: unknown[]) =>
  mocked.mockResolvedValue({ result: dispensers } as never);

describe('what a dispense pays out', () => {
  // Block body, not a concise one: `() => mocked.mockReset()` returns the mock, and vitest treats
  // a value returned from a hook as a teardown callback — so it calls the mock after every test,
  // which surfaces a throwing implementation as an unhandled rejection.
  beforeEach(() => {
    mocked.mockReset();
  });

  it('pays lots × give_quantity for the satoshis sent', async () => {
    // must_give = floor(50000 / 10000) = 5 lots of 1 PEPECASH.
    respond([dispenser()]);

    const payouts = await resolveDispensersAt('bc1qdispenser', 50_000);

    expect(payouts).toHaveLength(1);
    expect(payouts[0]!.quantity).toBe('5');
    expect(payouts[0]!.partiallyFilled).toBe(false);
  });

  it('caps the payout at what the dispenser has left', async () => {
    // core: actually_given = min(must_give, floor(give_remaining / give_quantity)) * give_quantity.
    // Paying for 5 lots against a dispenser holding 2 returns 2, not 5. Omitting this cap quoted a
    // nearly-empty dispenser at its full rate.
    respond([dispenser({ give_remaining: 200_000_000, give_remaining_normalized: '2.00000000' })]);

    const payouts = await resolveDispensersAt('bc1qdispenser', 50_000);

    expect(payouts[0]!.quantity).toBe('2');
    expect(payouts[0]!.partiallyFilled).toBe(true);
    expect(describePayout(payouts[0]!)).toContain('all the dispenser has left');
  });

  it('returns every open dispenser at the address, in asset order', async () => {
    // get_dispensers(..., order_by="asset") — one payment triggers all of them, so a single
    // dispense can return several different assets.
    respond([
      dispenser({ asset: 'ZZZCOIN' }),
      dispenser({ asset: 'AAACOIN' }),
    ]);

    const payouts = await resolveDispensersAt('bc1qdispenser', 50_000);

    expect(payouts.map((p) => p.asset)).toEqual(['AAACOIN', 'ZZZCOIN']);
  });

  it('includes status 11 and excludes closed dispensers', async () => {
    // status_in=[0, 11] in core; anything else does not dispense.
    respond([
      dispenser({ asset: 'OPENEMPTY', status: 11 }),
      dispenser({ asset: 'CLOSED', status: 10 }),
    ]);

    const payouts = await resolveDispensersAt('bc1qdispenser', 50_000);

    expect(payouts.map((p) => p.asset)).toEqual(['OPENEMPTY']);
  });

  it('does not quote a price for an oracle dispenser', async () => {
    // Its rate comes from the feed's latest broadcast at confirmation time, so the fixed-rate
    // formula would state a number that is not what the payer receives.
    respond([dispenser({ oracle_address: 'bc1qoracle' })]);

    const payouts = await resolveDispensersAt('bc1qdispenser', 50_000);

    expect(payouts[0]!.oraclePriced).toBe(true);
    expect(payouts[0]!.quantity).toBeUndefined();
  });

  it('says nothing when the lookup fails', async () => {
    // mockImplementation, not mockRejectedValue: the latter builds the rejected promise eagerly
    // and vitest reports it before the caller's catch can attach.
    mocked.mockImplementation(async () => {
      throw new Error('offline');
    });
    await expect(resolveDispensersAt('bc1qdispenser', 50_000)).resolves.toEqual([]);
  });
});

describe('the oracle dispenser policy', () => {
  it('blocks a dispense that would trigger an oracle dispenser', () => {
    const warning = oracleDispenseWarning(['PEPECASH']);
    expect(warning?.severity).toBe('block');
    expect(warning?.message).toContain('PEPECASH');
  });

  it('blocks opening a dispenser priced from a feed', () => {
    expect(oracleDispenserWarning('bc1qoracle')?.severity).toBe('block');
  });

  it('leaves fixed-rate dispensers alone', () => {
    expect(oracleDispenseWarning([])).toBeNull();
    expect(oracleDispenserWarning(undefined)).toBeNull();
    expect(oracleDispenserWarning('')).toBeNull();
  });
});
