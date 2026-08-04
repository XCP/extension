/**
 * The fee-rate bound for transactions the wallet did not build.
 *
 * The compose path recomputes a fee from independently resolved input values and rejects an absurd
 * one. A transaction handed over by a connected site skipped all of that: its fee was only compared
 * against an absolute 0.1 BTC ceiling, so a fee just under that ceiling passed unremarked however
 * small the transaction was — roughly 1,500x a sane rate on an ordinary send.
 */

import { describe, expect, it } from 'vitest';
import { exceedsSaneFeeRate, HIGH_FEE_RATE_WARNING } from '../feeVerification';

describe('exceedsSaneFeeRate', () => {
  it('flags a fee that slips under the absolute ceiling but drains a small transaction', () => {
    // 0.089 BTC on a ~200 vbyte send: below the 0.1 BTC ceiling, ~44,500 sat/vB.
    expect(exceedsSaneFeeRate(8_900_000, 200)).toBe(true);
  });

  it('accepts an ordinary fee', () => {
    expect(exceedsSaneFeeRate(2_000, 200)).toBe(false); // 10 sat/vB
  });

  it('accepts a fee that is expensive but plausible', () => {
    // A fee bump or a time-sensitive CPFP can be well above a normal day's rate without being a
    // mistake, and this only warns — so the threshold has to clear ordinary urgency.
    expect(exceedsSaneFeeRate(20_000, 200)).toBe(false); // 100 sat/vB
  });

  it('warns on a rate no ordinary transaction reaches', () => {
    // 1,000 sat/vB is roughly a hundred times a busy-day rate. It used to pass unremarked, because
    // the threshold sat at 5,000 — far enough above reality that the warning almost never fired.
    expect(exceedsSaneFeeRate(200_000, 200)).toBe(true);
  });

  it('sits exactly at the bound without firing', () => {
    expect(exceedsSaneFeeRate(HIGH_FEE_RATE_WARNING * 200, 200)).toBe(false);
    expect(exceedsSaneFeeRate(HIGH_FEE_RATE_WARNING * 200 + 200, 200)).toBe(true);
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
