/**
 * The fee-rate bound for transactions the wallet did not build.
 *
 * The compose path recomputes a fee from independently resolved input values and rejects an absurd
 * one. A transaction handed over by a connected site skipped all of that: its fee was only compared
 * against an absolute 0.1 BTC ceiling, so a fee just under that ceiling passed unremarked however
 * small the transaction was — roughly 1,500x a sane rate on an ordinary send.
 */

import { describe, it, expect } from 'vitest';
import { exceedsSaneFeeRate, MAX_SANE_FEE_RATE } from '../feeVerification';

describe('exceedsSaneFeeRate', () => {
  it('flags a fee that slips under the absolute ceiling but drains a small transaction', () => {
    // 0.089 BTC on a ~200 vbyte send: below the 0.1 BTC ceiling, ~44,500 sat/vB.
    expect(exceedsSaneFeeRate(8_900_000, 200)).toBe(true);
  });

  it('accepts an ordinary fee', () => {
    expect(exceedsSaneFeeRate(2_000, 200)).toBe(false); // 10 sat/vB
  });

  it('accepts a fee that is expensive but not absurd', () => {
    // Well above normal, still far below the bound — congestion must not block signing.
    expect(exceedsSaneFeeRate(200_000, 200)).toBe(false); // 1,000 sat/vB
  });

  it('sits exactly at the bound without firing', () => {
    expect(exceedsSaneFeeRate(MAX_SANE_FEE_RATE * 200, 200)).toBe(false);
    expect(exceedsSaneFeeRate(MAX_SANE_FEE_RATE * 200 + 200, 200)).toBe(true);
  });

  it('says nothing when the fee or size is unknown', () => {
    // An unresolvable fee is not evidence of an absurd one; other checks cover that case.
    expect(exceedsSaneFeeRate(null, 200)).toBe(false);
    expect(exceedsSaneFeeRate(undefined, 200)).toBe(false);
    expect(exceedsSaneFeeRate(8_900_000, undefined)).toBe(false);
    expect(exceedsSaneFeeRate(8_900_000, 0)).toBe(false);
  });

  it('ignores a zero or negative fee', () => {
    // An unfunded PSBT reports no fee; it is not a drain.
    expect(exceedsSaneFeeRate(0, 200)).toBe(false);
    expect(exceedsSaneFeeRate(-5_000, 200)).toBe(false);
  });
});
