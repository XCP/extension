import { describe, it, expect } from 'vitest';
import { checkTransactionFee } from '../feeVerification';

// A real composed order: 1 input, an OP_RETURN output (0 sats) and a change
// output of 0x60bf = 24767 sats. Input value chosen so the miner fee is modest.
const RAW_TX = '020000000133997605bfe854fd8bdd784b47bd3b423488e64cc5fb5820e0f8d134670b0b670100000000ffffffff020000000000000000356a3380ada95da1b59fdc5a4ed690798435687c8f9060f0318d3f63009c00fe09da18780b4b57f245152a77e0b5ed88b3511ad1c5cfbf600000000000001976a9145c333992ab554e7573df3d2a412df750a60d1f5b88ac00000000';
const OUTPUT_TOTAL = 24767; // 0 (OP_RETURN) + 24767 (change)

describe('checkTransactionFee', () => {
  it('accepts a normal fee', () => {
    // input = outputs + 2000 sat fee
    const result = checkTransactionFee({
      rawTransaction: RAW_TX,
      inputsValues: [OUTPUT_TOTAL + 2000],
      declaredFee: 2000,
      userFeeRate: 10,
    });
    expect(result.ok).toBe(true);
    expect(result.computedFee).toBe(2000);
  });

  it('rejects a drain-to-fee transaction (implied rate absurd)', () => {
    // Whole 1 BTC input, tiny outputs -> the rest is fee
    const result = checkTransactionFee({
      rawTransaction: RAW_TX,
      inputsValues: [100_000_000],
      declaredFee: 100_000_000 - OUTPUT_TOTAL,
      userFeeRate: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/abnormally high|far exceeds/i);
  });

  it('rejects a fee far above the user-selected rate', () => {
    // ~150k sat fee on a ~185 vbyte tx is ~800 sat/vB — under the absolute cap
    // but ~80x the user's 10 sat/vB selection.
    const result = checkTransactionFee({
      rawTransaction: RAW_TX,
      inputsValues: [OUTPUT_TOTAL + 150_000],
      declaredFee: 150_000,
      userFeeRate: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceeds your selected rate/i);
  });

  it('rejects outputs exceeding inputs', () => {
    const result = checkTransactionFee({
      rawTransaction: RAW_TX,
      inputsValues: [OUTPUT_TOTAL - 1],
      declaredFee: 0,
      userFeeRate: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceed inputs/i);
  });

  it('falls back to the declared fee when input values are unavailable', () => {
    const result = checkTransactionFee({
      rawTransaction: RAW_TX,
      inputsValues: undefined,
      declaredFee: 2000,
      userFeeRate: 10,
    });
    expect(result.ok).toBe(true);
    expect(result.computedFee).toBeUndefined();
  });

  it('bounds an absurd declared fee even without a user rate', () => {
    const result = checkTransactionFee({
      rawTransaction: RAW_TX,
      inputsValues: undefined,
      declaredFee: 5_000_000,
      userFeeRate: null,
    });
    expect(result.ok).toBe(false);
  });

  it('allows a modest fee when no user rate is set', () => {
    const result = checkTransactionFee({
      rawTransaction: RAW_TX,
      inputsValues: [OUTPUT_TOTAL + 3000],
      declaredFee: 3000,
      userFeeRate: null,
    });
    expect(result.ok).toBe(true);
  });
});
