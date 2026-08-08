import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isLessThanOrEqualTo, isValidPositiveNumber } from '@/core/numeric';
import {
  applyPoolSlippage,
  calculateInitialLpEstimate,
  calculateLimitingLpEstimate,
  getAutoSlippage,
  getPoolDisplayAssets,
  getPoolDisplayPair,
} from '../pool';

// 21,000,000 BTC expressed in satoshis — an upper bound on any on-chain quantity.
const SAT_MAX = 2_100_000_000_000_000n;
const sat = fc.bigInt({ min: 0n, max: SAT_MAX });
const satPositive = fc.bigInt({ min: 1n, max: SAT_MAX });
const assetName = fc.string({ minLength: 1, maxLength: 16 });
// Slippage percent the UI can produce: 0%..200% with sub-percent precision.
const slippagePct = fc.double({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true });

// The exact predicate both pool forms gate submission on before slippage can
// reach compose/signing. applyPoolSlippage must be SAFE for everything it accepts.
const slippageReachesSigning = (s: string) =>
  isValidPositiveNumber(s, { allowZero: true, maxDecimals: 2 }) && isLessThanOrEqualTo(s, 50);

describe('Pool Math Fuzz Tests', () => {
  describe('getPoolDisplayAssets / Pair', () => {
    // No longer sorted — display order is the base/quote rule, not the protocol's alphabetical
    // storage order. What must still hold is that a pool reads identically whichever way round its
    // two assets arrive, or the same pool would render one way from the market and another from a
    // balance.
    it('is independent of argument order', () => {
      fc.assert(fc.property(assetName, assetName, (a, b) => {
        expect(getPoolDisplayAssets(a, b)).toEqual(getPoolDisplayAssets(b, a));
        expect(getPoolDisplayPair(a, b)).toBe(getPoolDisplayPair(b, a));
      }), { numRuns: 500 });
    });

    it('shows both assets and invents neither', () => {
      fc.assert(fc.property(assetName, assetName, (a, b) => {
        expect([...getPoolDisplayAssets(a, b)].sort()).toEqual([a, b].sort());
      }), { numRuns: 500 });
    });
  });

  describe('getAutoSlippage', () => {
    it('stays within the 0.5%..5% band for any impact, and is always submittable', () => {
      fc.assert(fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (impact) => {
          const slippage = getAutoSlippage(impact);
          expect(Number(slippage)).toBeGreaterThanOrEqual(0.5);
          expect(Number(slippage)).toBeLessThanOrEqual(5);
          // Auto must never produce a value the form would then reject.
          expect(slippageReachesSigning(slippage)).toBe(true);
        }
      ), { numRuns: 500 });
    });

    it('never tolerates less than the impact the quote already reported', () => {
      fc.assert(fc.property(
        fc.double({ min: 0.5, max: 5, noNaN: true, noDefaultInfinity: true }),
        (impact) => {
          // Inside the band, rounding up a tenth must not land under the impact itself, or Auto
          // would quote a tolerance the trade is already known to breach.
          expect(Number(getAutoSlippage(impact))).toBeGreaterThanOrEqual(impact);
        }
      ), { numRuns: 500 });
    });
  });

  describe('applyPoolSlippage', () => {
    it('keeps the result within [0, value] (never worse-than-quoted) for s >= 0', () => {
      fc.assert(fc.property(sat, slippagePct, (value, s) => {
        const out = BigInt(applyPoolSlippage(value.toString(), s.toString()));
        expect(out >= 0n).toBe(true);
        expect(out <= value).toBe(true);
      }), { numRuns: 500 });
    });

    it('is the identity on an already-integer quantity at 0% slippage', () => {
      fc.assert(fc.property(sat, (value) => {
        expect(applyPoolSlippage(value.toString(), '0')).toBe(value.toString());
      }), { numRuns: 300 });
    });

    it('is monotonic: higher slippage yields a smaller-or-equal result', () => {
      fc.assert(fc.property(satPositive, slippagePct, slippagePct, (value, s1, s2) => {
        const lo = Math.min(s1, s2);
        const hi = Math.max(s1, s2);
        const outLo = BigInt(applyPoolSlippage(value.toString(), lo.toString()));
        const outHi = BigInt(applyPoolSlippage(value.toString(), hi.toString()));
        expect(outHi <= outLo).toBe(true);
      }), { numRuns: 300 });
    });

    it('floors the result to zero at >= 100% slippage', () => {
      fc.assert(fc.property(sat, fc.double({ min: 100, max: 500, noNaN: true, noDefaultInfinity: true }), (value, s) => {
        expect(applyPoolSlippage(value.toString(), s.toString())).toBe('0');
      }), { numRuns: 200 });
    });

    it('degrades null/undefined quote values to "0" rather than throwing', () => {
      fc.assert(fc.property(fc.constantFrom(null, undefined), fc.constantFrom('0', '1', '50'), (value, s) => {
        expect(applyPoolSlippage(value, s)).toBe('0');
      }), { numRuns: 50 });
    });
  });

  describe('calculateInitialLpEstimate', () => {
    it('is the exact integer floor of sqrt(a*b) and is symmetric', () => {
      fc.assert(fc.property(sat, sat, (a, b) => {
        const est = calculateInitialLpEstimate(a.toString(), b.toString());
        const prod = a * b;
        if (prod <= 0n) {
          expect(est).toBe('0');
          return;
        }
        const r = BigInt(est);
        // r == isqrt(prod): r^2 <= prod < (r+1)^2
        expect(r * r <= prod).toBe(true);
        expect((r + 1n) * (r + 1n) > prod).toBe(true);
        expect(calculateInitialLpEstimate(b.toString(), a.toString())).toBe(est);
      }), { numRuns: 500 });
    });
  });

  describe('calculateLimitingLpEstimate', () => {
    it('scales minted by provided/required (floored) and never exceeds it', () => {
      fc.assert(fc.property(satPositive, satPositive, satPositive, (minted, required, provided) => {
        const est = BigInt(
          calculateLimitingLpEstimate(minted.toString(), required.toString(), provided.toString())
        );
        if (provided >= required) {
          expect(est).toBe(minted);
        } else {
          expect(est).toBe((minted * provided) / required); // exact integer floor division
          expect(est <= minted).toBe(true);
        }
        expect(est >= 0n).toBe(true);
      }), { numRuns: 500 });
    });
  });

  describe('Adversarial robustness', () => {
    // Hostile slippage strings: negatives, scientific notation, whitespace,
    // percent signs, formula-injection, NaN/Infinity, empty, and junk.
    const hostileSlippage = fc.oneof(
      fc.double({ min: -500, max: 5000, noNaN: false }).map(String),
      fc.constantFrom('-5', '=5', '+5', '@5', '5%', ' 5 ', '1e3', '', 'abc', 'NaN', 'Infinity', '0.001', '50.01'),
      fc.string()
    );

    it('applyPoolSlippage never throws and always returns a non-negative integer string', () => {
      fc.assert(fc.property(sat, hostileSlippage, (value, s) => {
        const out = applyPoolSlippage(value.toString(), s);
        expect(/^\d+$/.test(out)).toBe(true);
        expect(BigInt(out) >= 0n).toBe(true);
      }), { numRuns: 500 });
    });

    it('any slippage that can reach signing stays within [0, value] (no inflation)', () => {
      fc.assert(fc.property(sat, hostileSlippage, (value, s) => {
        fc.pre(slippageReachesSigning(s));
        const out = BigInt(applyPoolSlippage(value.toString(), s));
        expect(out >= 0n && out <= value).toBe(true);
      }), { numRuns: 500 });
    });
  });
});
