/**
 * Fuzz tests for amount validation functions
 * Tests amount and quantity validation with random inputs
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import BigNumber from 'bignumber.js';
import {
  validateAmount,
  validateQuantity,
  isValidNumber,
  validateBalance,
  btcToSatoshis,
  isDustAmount,
  DUST_LIMIT,
  MAX_SATOSHIS,
  SATOSHIS_PER_BTC
} from '@/utils/validation/amount';
import { fromSatoshis } from '@/utils/numeric';

describe('Amount Validation Fuzz Tests', () => {
  describe('validateAmount', () => {
    it('should handle arbitrary string inputs without crashing', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            expect(() => {
              validateAmount(input);
            }).not.toThrow();
            
            const result = validateAmount(input);
            expect(result).toHaveProperty('isValid');
            expect(typeof result.isValid).toBe('boolean');
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should reject negative amounts', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(-1000000), max: Math.fround(-0.0001), noNaN: true }),
          (amount) => {
            const result = validateAmount(amount);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('negative');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle zero based on allowZero option', () => {
      fc.assert(
        fc.property(
          fc.constant(0),
          (amount) => {
            const resultNoZero = validateAmount(amount, { allowZero: false });
            expect(resultNoZero.isValid).toBe(false);
            
            const resultWithZero = validateAmount(amount, { allowZero: true });
            expect(resultWithZero.isValid).toBe(true);
          }
        )
      );
    });

    it('should enforce dust limit when configured', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 545 }), // Below dust limit in satoshis
          (satoshis) => {
            const btcAmount = (satoshis / 100000000).toFixed(8);
            const result = validateAmount(btcAmount, { allowDust: false });
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('dust');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect decimal precision limits', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.float({ min: Math.fround(0.1), max: Math.fround(1000) }),
            fc.integer({ min: 9, max: 20 })
          ),
          ([baseAmount, decimals]) => {
            // Create a number with too many decimals
            const amount = baseAmount.toFixed(decimals);
            const result = validateAmount(amount, { decimals: 8 });
            
            // Check actual decimal places in the result
            const actualDecimals = amount.includes('.') ? 
              amount.split('.')[1].replace(/0+$/, '').length : 0;
            
            if (actualDecimals > 8) {
              expect(result.isValid).toBe(false);
              expect(result.error).toContain('decimal');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge case numbers', () => {
      const edgeCases = [
        'Infinity',
        '-Infinity',
        'NaN',
        '',
        '   ',
        null,
        undefined,
        '1e308',
        '1e-308'
      ];

      edgeCases.forEach(value => {
        const result = validateAmount(value as any);
        expect(result.isValid).toBe(false);
      });

      // Also test that scientific notation is rejected
      expect(validateAmount('1e10').isValid).toBe(false);
      expect(validateAmount('1.5e-8').isValid).toBe(false);
    });
  });

  describe('validateQuantity', () => {
    it('should handle arbitrary inputs without crashing', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.string(), fc.float(), fc.integer()),
          (input) => {
            expect(() => {
              validateQuantity(input);
            }).not.toThrow();
            
            const result = validateQuantity(input);
            expect(result).toHaveProperty('isValid');
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should enforce divisibility rules', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.1), max: Math.fround(100.9), noNaN: true }),
          (amount) => {
            // Non-integer amounts should fail for non-divisible assets
            const result = validateQuantity(amount, { divisible: false });
            
            if (!Number.isInteger(amount)) {
              expect(result.isValid).toBe(false);
              expect(result.error).toContain('not divisible');
            } else {
              expect(result.isValid).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate against max supply', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 0n, max: BigInt('9223372036854775807') * 2n }),
          (quantity) => {
            const maxSupply = '9223372036854775807'; // Max int64
            const result = validateQuantity(quantity.toString(), { maxSupply });
            
            if (quantity > BigInt(maxSupply)) {
              expect(result.isValid).toBe(false);
              expect(result.error).toContain('exceeds maximum');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject scientific notation', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.float({ min: Math.fround(1), max: Math.fround(9.99), noNaN: true }),
            fc.integer({ min: -10, max: 10 })
          ),
          ([mantissa, exponent]) => {
            const scientific = `${mantissa}e${exponent}`;
            const result = validateQuantity(scientific);
            
            // Should reject scientific notation
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('Invalid quantity format');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('isValidNumber', () => {
    it('should correctly identify valid number strings', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer().map(n => n.toString()),
            fc.integer({ min: 0, max: 100000000 }).map(n => (n / 100000000).toFixed(8))
          ),
          (numStr) => {
            // Only test non-scientific notation numbers
            if (!numStr.includes('e') && !numStr.includes('E')) {
              const result = isValidNumber(numStr);
              expect(result).toBe(true);
            }
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should reject non-numeric strings', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => isNaN(Number(s)) || s.trim() === ''),
          (str) => {
            const result = isValidNumber(str);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('validateBalance', () => {
    it('should validate balance sufficiency correctly', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
            fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true }),
            fc.float({ min: Math.fround(0), max: Math.fround(1000), noNaN: true })
          ),
          ([amount, balance, fee]) => {
            const result = validateBalance(amount, balance, {
              includesFee: true,
              feeAmount: fee
            });
            
            // Use BigNumber for precise comparison
            const totalRequired = new BigNumber(amount).plus(fee);
            const balanceBN = new BigNumber(balance);
            
            if (totalRequired.isGreaterThan(balanceBN)) {
              expect(result.isValid).toBe(false);
              expect(result.error).toContain('Insufficient');
            } else {
              expect(result.isValid).toBe(true);
            }
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should handle edge cases in balance validation', () => {
      const edgeCases = [
        { amount: 'NaN', balance: 100, expected: false },
        { amount: 100, balance: 'NaN', expected: false },
        { amount: Infinity, balance: 100, expected: false },
        { amount: 100, balance: Infinity, expected: true },
        { amount: -1, balance: 100, expected: true } // Negative amount is less than balance
      ];

      edgeCases.forEach(({ amount, balance, expected }) => {
        const result = validateBalance(amount as any, balance as any);
        expect(result.isValid).toBe(expected);
      });
    });
  });

  describe('fromSatoshis with removeTrailingZeros', () => {
    it('should format satoshis to BTC correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: MAX_SATOSHIS }),
          (satoshis) => {
            const btc = fromSatoshis(satoshis, { removeTrailingZeros: true });
            expect(typeof btc).toBe('string');
            
            // Verify conversion is correct
            const expectedBtc = new BigNumber(satoshis).dividedBy(SATOSHIS_PER_BTC);
            const actualBtc = new BigNumber(btc);
            
            // Allow for formatting differences (trailing zeros removed)
            expect(actualBtc.toNumber()).toBeCloseTo(expectedBtc.toNumber(), 8);
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should handle edge values correctly', () => {
      expect(fromSatoshis(0, { removeTrailingZeros: true })).toBe('0');
      expect(fromSatoshis(1, { removeTrailingZeros: true })).toBe('0.00000001');
      expect(fromSatoshis(SATOSHIS_PER_BTC, { removeTrailingZeros: true })).toBe('1');
      expect(fromSatoshis(MAX_SATOSHIS, { removeTrailingZeros: true })).toBe('21000000');
    });
  });

  describe('btcToSatoshis', () => {
    it('should convert BTC to satoshis correctly', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0), max: Math.fround(21000000), noNaN: true }),
          (btc) => {
            const satoshis = btcToSatoshis(btc);
            expect(typeof satoshis).toBe('number');
            expect(Number.isInteger(satoshis)).toBe(true);
            expect(satoshis).toBeGreaterThanOrEqual(0);
            
            // Verify conversion
            const expectedSatoshis = Math.floor(btc * SATOSHIS_PER_BTC);
            expect(satoshis).toBe(expectedSatoshis);
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should round down fractional satoshis', () => {
      const btc = '0.000000001'; // 0.1 satoshi
      const satoshis = btcToSatoshis(btc);
      expect(satoshis).toBe(0); // Should round down
    });
  });

  describe('isDustAmount', () => {
    it('should identify dust amounts correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: DUST_LIMIT * 2 }),
          (satoshis) => {
            const result = isDustAmount(satoshis);
            
            if (satoshis < DUST_LIMIT && satoshis > 0) {
              expect(result).toBe(true);
            } else {
              expect(result).toBe(false);
            }
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should handle edge cases', () => {
      expect(isDustAmount(0)).toBe(false); // Zero is not dust
      expect(isDustAmount(DUST_LIMIT - 1)).toBe(true);
      expect(isDustAmount(DUST_LIMIT)).toBe(false);
      expect(isDustAmount(-100)).toBe(false); // Negative is not dust
    });
  });

  describe('Cross-validation consistency', () => {
    it('should maintain consistency between related functions', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: MAX_SATOSHIS }),
          (satoshis) => {
            // Convert to BTC and back
            const btc = fromSatoshis(satoshis, { removeTrailingZeros: true });
            const backToSatoshis = btcToSatoshis(btc);
            
            // Should be the same (accounting for precision)
            expect(Math.abs(backToSatoshis - satoshis)).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  describe('Security and injection tests', () => {
    it('should handle injection attempts safely', () => {
      const injections = [
        '<script>alert(1)</script>',
        '${process.env.SECRET}',
        '../../etc/passwd',
        'DROP TABLE amounts',
        '\x00\x01\x02',
        '{{template}}',
        'javascript:alert(1)'
      ];

      injections.forEach(injection => {
        expect(() => {
          validateAmount(injection);
          validateQuantity(injection);
          isValidNumber(injection);
        }).not.toThrow();
        
        const amountResult = validateAmount(injection);
        const quantityResult = validateQuantity(injection);
        const numberResult = isValidNumber(injection);
        
        expect(amountResult.isValid).toBe(false);
        expect(quantityResult.isValid).toBe(false);
        expect(numberResult).toBe(false);
      });
    });

    it('should handle extremely large inputs without performance issues', () => {
      const hugeString = '9'.repeat(10000);
      
      const start = Date.now();
      validateAmount(hugeString);
      validateQuantity(hugeString);
      const elapsed = Date.now() - start;
      
      // Should complete quickly even with huge input
      expect(elapsed).toBeLessThan(100);
    });
  });
});