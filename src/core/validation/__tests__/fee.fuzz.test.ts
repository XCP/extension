/**
 * Fuzz tests for fee validation functions
 * Tests fee rate validation, calculation, and related functions with random inputs
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatFee } from '@/core/format';
import { MAX_FEE_RATE, validateFeeRate } from '@/core/validation/fee';

describe('Fee Validation Fuzz Tests', () => {
  describe('validateFeeRate', () => {
    it('should handle arbitrary inputs without crashing', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.string(), fc.float(), fc.integer()),
          (input) => {
            expect(() => {
              validateFeeRate(input);
            }).not.toThrow();
            
            const result = validateFeeRate(input);
            expect(result).toHaveProperty('isValid');
            expect(typeof result.isValid).toBe('boolean');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject negative fee rates', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(-10000), max: Math.fround(-0.01), noNaN: true }),
          (feeRate) => {
            const result = validateFeeRate(feeRate);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('negative');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject zero fee rate', () => {
      const result = validateFeeRate(0);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('zero');
    });

    // Fee rates arrive as typed decimals with at most 8 places, not raw binary floats.
    const typedRate = (minHundredths: number, maxHundredths: number) =>
      fc.integer({ min: minHundredths, max: maxHundredths }).map(n => (n / 100).toFixed(2));

    it('should enforce min and max limits', () => {
      fc.assert(
        fc.property(
          typedRate(1, 10_000_000).map(Number),
          (feeRate) => {
            const result = validateFeeRate(feeRate, {
              minRate: 10,
              maxRate: 100
            });
            
            if (feeRate < 10) {
              expect(result.isValid).toBe(false);
              expect(result.error).toContain('too low');
            } else if (feeRate > 100) {
              expect(result.isValid).toBe(false);
              expect(result.error).toContain('too high');
            } else {
              expect(result.isValid).toBe(true);
              expect(result.satsPerVByte).toBe(feeRate);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should add warning for high fees', () => {
      fc.assert(
        fc.property(
          typedRate(10_100, MAX_FEE_RATE * 100).map(Number),
          (feeRate) => {
            const result = validateFeeRate(feeRate, { warnHighFee: true });
            
            if (feeRate > 100 && feeRate <= MAX_FEE_RATE) {
              expect(result.isValid).toBe(true);
              expect(result.warning).toContain('high fee');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should refuse more than 8 decimals as a format error, never a silent rounding', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 9, max: 16 }),
          (whole, places) => {
            const result = validateFeeRate(`${whole}.${'0'.repeat(places - 1)}1`);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('up to 8 decimals');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge cases', () => {
      const edgeCases = [
        'Infinity',
        '-Infinity', 
        'NaN',
        '',
        '   ',
        null,
        undefined
      ];

      edgeCases.forEach(value => {
        const result = validateFeeRate(value as any);
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('formatFee', () => {
    it('should format fees correctly for display', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000000 }), // up to 1 BTC in sats
          (satoshis) => {
            const formatted = formatFee(satoshis);
            expect(typeof formatted).toBe('string');
            
            if (satoshis < 1000) {
              expect(formatted).toContain('sats');
              expect(formatted).not.toContain('.');
            } else if (satoshis < 100000) {
              expect(formatted).toContain('k sats');
            } else {
              expect(formatted).toContain('BTC');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge values correctly', () => {
      expect(formatFee(0)).toBe('0 sats');
      expect(formatFee(999)).toBe('999 sats');
      expect(formatFee(1000)).toBe('1.0k sats');
      expect(formatFee(99999)).toBe('100.0k sats'); // Rounds up
      expect(formatFee(100000)).toBe('0.001000 BTC');
      expect(formatFee(100000000)).toBe('1.000000 BTC');
    });
  });

  describe('Security and injection tests', () => {
    it('should handle injection attempts safely', () => {
      const injections = [
        '<script>alert(1)</script>',
        '${process.env.SECRET}',
        '../../etc/passwd',
        'DROP TABLE fees',
        '\x00\x01\x02',
        '{{template}}',
        'javascript:alert(1)'
      ];

      injections.forEach(injection => {
        expect(() => {
          validateFeeRate(injection);
        }).not.toThrow();
        
        const feeResult = validateFeeRate(injection);
        expect(feeResult.isValid).toBe(false);
      });
    });

    it('should handle extremely large inputs without performance issues', () => {
      const hugeString = '9'.repeat(10000);
      
      const start = Date.now();
      validateFeeRate(hugeString);
      const elapsed = Date.now() - start;
      
      // Should complete quickly even with huge input
      expect(elapsed).toBeLessThan(100);
    });
  });

});
