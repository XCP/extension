/**
 * Fuzz tests for fee validation functions
 * Tests fee rate validation, calculation, and related functions with random inputs
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import BigNumber from 'bignumber.js';
import {
  validateFeeRate,
  calculateTransactionFee,
  validateFeeWithBalance,
  estimateFeeRate,
  validateCPFPFee,
  isReasonableFeeRate,
  MIN_FEE_RATE,
  MAX_FEE_RATE,
  DEFAULT_FEE_RATE,
  TYPICAL_INPUT_SIZE,
  TYPICAL_OUTPUT_SIZE
} from '@/utils/validation/fee';
import { formatFee } from '@/utils/format';

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
        { numRuns: 1000 }
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

    it('should enforce min and max limits', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true }),
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
        { numRuns: 1000 }
      );
    });

    it('should add warning for high fees', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 101, max: MAX_FEE_RATE, noNaN: true }),
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

  describe('calculateTransactionFee', () => {
    it('should calculate fees correctly for various transaction sizes', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 1, max: 100 }), // inputs
            fc.integer({ min: 1, max: 100 }), // outputs
            fc.float({ min: 1, max: 1000, noNaN: true }) // fee rate
          ),
          ([inputs, outputs, feeRate]) => {
            const result = calculateTransactionFee(inputs, outputs, feeRate);
            
            expect(result.fee).toBeGreaterThan(0);
            expect(result.feeRate).toBe(feeRate);
            expect(result.estimatedSize).toBeGreaterThan(0);
            
            // Verify calculation
            const expectedSize = (inputs * TYPICAL_INPUT_SIZE) + 
                               (outputs * TYPICAL_OUTPUT_SIZE) + 10;
            expect(result.estimatedSize).toBe(expectedSize);
            expect(result.fee).toBe(Math.ceil(expectedSize * feeRate));
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should add warning for very high fees', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 10, max: 50 }),
            fc.integer({ min: 10, max: 50 }),
            fc.float({ min: 100, max: 1000, noNaN: true })
          ),
          ([inputs, outputs, feeRate]) => {
            const result = calculateTransactionFee(inputs, outputs, feeRate);
            
            if (result.fee > 100000) {
              expect(result.warning).toContain('exceeds 0.001 BTC');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle custom input/output sizes', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 1, max: 10 }),
            fc.integer({ min: 1, max: 10 }),
            fc.float({ min: 1, max: 100, noNaN: true }),
            fc.integer({ min: 50, max: 500 }), // custom input size
            fc.integer({ min: 20, max: 100 })  // custom output size
          ),
          ([inputs, outputs, feeRate, inputSize, outputSize]) => {
            const result = calculateTransactionFee(inputs, outputs, feeRate, {
              inputSize,
              outputSize,
              overhead: 20
            });
            
            const expectedSize = (inputs * inputSize) + (outputs * outputSize) + 20;
            expect(result.estimatedSize).toBe(expectedSize);
            expect(result.fee).toBe(Math.ceil(expectedSize * feeRate));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('validateFeeWithBalance', () => {
    it('should validate balance sufficiency including fees', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.float({ min: 0, max: 1000000, noNaN: true }),
            fc.float({ min: 0, max: 10000, noNaN: true }),
            fc.float({ min: 0, max: 1000000, noNaN: true })
          ),
          ([amount, fee, balance]) => {
            const result = validateFeeWithBalance(amount, fee, balance);
            
            const totalRequired = new BigNumber(amount).plus(fee);
            const balanceBN = new BigNumber(balance);
            
            if (totalRequired.isGreaterThan(balanceBN)) {
              expect(result.isValid).toBe(false);
              expect(result.error).toContain('Insufficient');
              expect(result.totalRequired).toBe(totalRequired.toString());
            } else {
              expect(result.isValid).toBe(true);
              expect(result.totalRequired).toBe(totalRequired.toString());
            }
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should handle invalid inputs gracefully', () => {
      const invalidCases = [
        { amount: 'NaN', fee: 100, balance: 1000 },
        { amount: 100, fee: 'NaN', balance: 1000 },
        { amount: 100, fee: 100, balance: 'NaN' },
        { amount: Infinity, fee: 100, balance: 1000 },
        { amount: 100, fee: Infinity, balance: 1000 }
      ];

      invalidCases.forEach(({ amount, fee, balance }) => {
        const result = validateFeeWithBalance(amount as any, fee as any, balance as any);
        expect(result.isValid).toBe(false);
        // Error could be "Invalid" or "Insufficient" for Infinity
        expect(result.error).toMatch(/Invalid|Insufficient/);
      });
    });
  });

  describe('estimateFeeRate', () => {
    it('should return appropriate rates for each priority', () => {
      const priorities: ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high'];
      
      priorities.forEach(priority => {
        const rate = estimateFeeRate(priority);
        expect(rate).toBeGreaterThan(0);
        
        if (priority === 'low') {
          expect(rate).toBeLessThanOrEqual(DEFAULT_FEE_RATE);
        } else if (priority === 'high') {
          expect(rate).toBeGreaterThanOrEqual(DEFAULT_FEE_RATE);
        }
      });
    });

    it('should use provided rates when available', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.float({ min: 1, max: 100, noNaN: true }),
            fc.float({ min: 1, max: 100, noNaN: true }),
            fc.float({ min: 1, max: 100, noNaN: true })
          ),
          ([low, medium, high]) => {
            const rates = { low, medium, high };
            
            expect(estimateFeeRate('low', rates)).toBe(low);
            expect(estimateFeeRate('medium', rates)).toBe(medium);
            expect(estimateFeeRate('high', rates)).toBe(high);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('validateCPFPFee', () => {
    it('should calculate CPFP requirements correctly', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.float({ min: 1, max: 100, noNaN: true }), // target rate
            fc.float({ min: Math.fround(0.1), max: Math.fround(10), noNaN: true }), // parent rate
            fc.integer({ min: 100, max: 1000 }), // child size
            fc.integer({ min: 100, max: 1000 })  // parent size
          ),
          ([childFeeRate, parentFeeRate, childSize, parentSize]) => {
            const result = validateCPFPFee(childFeeRate, parentFeeRate, childSize, parentSize);
            
            if (parentFeeRate >= childFeeRate) {
              // Parent already has sufficient fee
              expect(result.isValid).toBe(false);
              expect(result.error).toContain('sufficient fee');
            } else {
              const combinedSize = childSize + parentSize;
              const parentFee = parentFeeRate * parentSize;
              const requiredTotalFee = childFeeRate * combinedSize;
              const requiredChildFee = requiredTotalFee - parentFee;
              const effectiveRate = requiredChildFee / childSize;
              
              if (effectiveRate > MAX_FEE_RATE) {
                expect(result.isValid).toBe(false);
                expect(result.error).toContain('too high');
              } else {
                expect(result.isValid).toBe(true);
                expect(result.effectiveRate).toBeCloseTo(effectiveRate, 5);
              }
            }
          }
        ),
        { numRuns: 500 }
      );
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
        { numRuns: 1000 }
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

  describe('isReasonableFeeRate', () => {
    it('should identify reasonable fee rates', () => {
      fc.assert(
        fc.property(
          fc.float({ min: MIN_FEE_RATE, max: 100, noNaN: true }),
          (feeRate) => {
            const result = isReasonableFeeRate(feeRate);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject unreasonable fee rates', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.float({ min: -1000, max: 0, noNaN: true }),
            fc.float({ min: 101, max: 10000, noNaN: true })
          ),
          (feeRate) => {
            const result = isReasonableFeeRate(feeRate);
            
            if (feeRate < MIN_FEE_RATE || feeRate > 100) {
              expect(result).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should consider network rate when provided', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.float({ min: 1, max: 1000, noNaN: true }),
            fc.float({ min: 1, max: 100, noNaN: true })
          ),
          ([feeRate, networkRate]) => {
            const result = isReasonableFeeRate(feeRate, networkRate);
            
            if (feeRate < MIN_FEE_RATE || feeRate > networkRate * 10) {
              expect(result).toBe(false);
            } else {
              expect(result).toBe(true);
            }
          }
        ),
        { numRuns: 500 }
      );
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
          validateFeeWithBalance(injection, injection, injection);
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

  describe('Cross-validation consistency', () => {
    it('should maintain consistency between validation and calculation', () => {
      fc.assert(
        fc.property(
          fc.float({ min: MIN_FEE_RATE, max: MAX_FEE_RATE, noNaN: true }),
          (feeRate) => {
            // If fee rate is valid, it should work in calculations
            const validation = validateFeeRate(feeRate);
            
            if (validation.isValid) {
              const calcResult = calculateTransactionFee(1, 1, feeRate);
              expect(calcResult.fee).toBeGreaterThan(0);
              expect(calcResult.feeRate).toBe(feeRate);
            }
          }
        ),
        { numRuns: 1000 }
      );
    });
  });
});