import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { BigNumber } from 'bignumber.js';
import {
  toBigNumber,
  isValidPositiveNumber,
  roundDownToMultiple,
  toSatoshis,
  fromSatoshis,
  subtractSatoshis,
  divideSatoshis,
  isLessThanSatoshis,
  isLessThanOrEqualToSatoshis,
  multiply,
  subtract,
  divide,
  roundUp,
  roundDown,
  isLessThanOrEqualToZero,
  toNumber,
} from '../numeric';

describe('Numeric Utilities Fuzz Tests', () => {
  describe('toBigNumber', () => {
    it('should handle random valid number strings', () => {
      fc.assert(fc.property(
        fc.oneof(
          fc.integer({ min: -1000000, max: 1000000 }),
          fc.float({ min: Math.fround(-1000000), max: Math.fround(1000000), noNaN: true, noDefaultInfinity: true }),
        ),
        (value) => {
          const str = value.toString();
          const result = toBigNumber(str);
          expect(result).toBeInstanceOf(BigNumber);
          expect(result.isNaN()).toBe(false);
        }
      ), { numRuns: 500 });
    });

    it('should handle malformed inputs safely', () => {
      fc.assert(fc.property(
        fc.oneof(
          fc.string().filter(s => {
            // After removing spaces and commas, check if it would be valid for BigNumber
            const cleaned = s.replace(/[,\s]/g, '');
            if (cleaned === '') return true; // Empty string should return 0
            
            // Try to parse with BigNumber to see if it would be valid
            try {
              const testNum = new BigNumber(cleaned);
              // If BigNumber can parse it and it's not NaN, then it's valid
              // So we should filter it out (return false)
              return testNum.isNaN();
            } catch {
              // If BigNumber throws, it's invalid (return true to include it)
              return true;
            }
          }),
          fc.constant(null),
          fc.constant(undefined),
          fc.constant(''),
        ),
        (invalidInput) => {
          const result = toBigNumber(invalidInput);
          expect(result).toBeInstanceOf(BigNumber);
          // Should fallback to default (0) for invalid inputs
          expect(result.toString()).toBe('0');
        }
      ), { numRuns: 200 });
    });

    it('should detect formula injection attempts', () => {
      const injectionInputs = ['=SUM(1,1)', '@NOW()', '+1+1', '-1-1'];
      
      injectionInputs.forEach(input => {
        const result = toBigNumber(input);
        expect(result.toString()).toBe('0'); // Should fallback to default
      });
    });

    it('should handle extremely large numbers', () => {
      fc.assert(fc.property(
        fc.integer({ min: 1, max: 100 }),
        (digitCount) => {
          const largeNumber = '9'.repeat(digitCount);
          const result = toBigNumber(largeNumber);
          expect(result).toBeInstanceOf(BigNumber);
          expect(result.isNaN()).toBe(false);
        }
      ), { numRuns: 100 });
    });

    it('should handle numbers with commas and spaces', () => {
      const numbersWithFormatting = [
        '1,000.50',
        '10 000.25',
        '1, 000, 000',
        ' 123.456 ',
      ];
      
      numbersWithFormatting.forEach(num => {
        const result = toBigNumber(num);
        expect(result).toBeInstanceOf(BigNumber);
        expect(result.isNaN()).toBe(false);
      });
    });

    it('should preserve precision for decimal numbers', () => {
      fc.assert(fc.property(
        fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true })
          .map(f => f.toFixed(8)), // 8 decimal places like Bitcoin
        (decimalStr) => {
          const result = toBigNumber(decimalStr);
          expect(result).toBeInstanceOf(BigNumber);
          expect(result.isNaN()).toBe(false);
          
          // Should preserve precision
          const backToString = result.toFixed(8);
          expect(parseFloat(backToString)).toBeCloseTo(parseFloat(decimalStr), 8);
        }
      ), { numRuns: 200 });
    });
  });

  describe('isValidPositiveNumber', () => {
    it('should correctly validate positive numbers', () => {
      fc.assert(fc.property(
        fc.float({ min: Math.fround(0.00000001), max: Math.fround(1000000), noNaN: true, noDefaultInfinity: true })
          .filter(n => n >= 0.00000001), // Filter out extremely small numbers that might cause issues
        (positiveNum) => {
          const str = positiveNum.toString();
          // Skip scientific notation in edge cases for this test
          if (str.includes('e-')) return true;
          
          // The function correctly validates decimal places (default max is 8)
          // We need to check how many decimal places the number string has
          const decimalPlaces = str.includes('.') ? str.split('.')[1].length : 0;
          const result = isValidPositiveNumber(str, { allowZero: false });
          
          if (decimalPlaces <= 8) {
            expect(result).toBe(true);
          } else {
            // Numbers with more than 8 decimal places should be rejected
            expect(result).toBe(false);
          }
        }
      ), { numRuns: 500 });
    });

    it('should reject negative numbers', () => {
      fc.assert(fc.property(
        fc.float({ min: Math.fround(-1000000), max: Math.fround(-0.00000001), noNaN: true, noDefaultInfinity: true }),
        (negativeNum) => {
          const str = negativeNum.toString();
          const result = isValidPositiveNumber(str, { allowZero: false });
          expect(result).toBe(false);
        }
      ), { numRuns: 200 });
    });

    it('should handle zero based on options', () => {
      const zeroStr = '0';
      expect(isValidPositiveNumber(zeroStr, { allowZero: true })).toBe(true);
      expect(isValidPositiveNumber(zeroStr, { allowZero: false })).toBe(false);
    });

    it('should validate decimal places constraint', () => {
      fc.assert(fc.property(
        fc.integer({ min: 0, max: 20 }), // maxDecimals
        fc.integer({ min: 0, max: 30 }), // actual decimal places
        (maxDecimals, actualDecimals) => {
          const numberStr = '1.' + '0'.repeat(actualDecimals);
          const result = isValidPositiveNumber(numberStr, { maxDecimals });
          
          if (actualDecimals <= maxDecimals) {
            expect(result).toBe(true);
          } else {
            expect(result).toBe(false);
          }
        }
      ), { numRuns: 200 });
    });

    it('should reject formula injection attempts', () => {
      const injectionAttempts = ['=1', '@1', '+1', '-1', '=SUM(1,1)'];
      
      injectionAttempts.forEach(attempt => {
        const result = isValidPositiveNumber(attempt);
        expect(result).toBe(false);
      });
    });

    it('should handle edge cases safely', () => {
      const edgeCases = ['', ' ', 'NaN', 'Infinity', '-Infinity', 'undefined', 'null', 'abc', 'true', 'false'];
      
      edgeCases.forEach(edgeCase => {
        const result = isValidPositiveNumber(edgeCase);
        expect(result).toBe(false);
      });
    });
  });

  describe('toSatoshis', () => {
    it('should convert Bitcoin amounts to satoshis correctly', () => {
      fc.assert(fc.property(
        fc.float({ min: 0, max: 21000000, noNaN: true, noDefaultInfinity: true }),
        (btcAmount) => {
          const satoshis = toSatoshis(btcAmount);
          const expectedSatoshis = Math.floor(btcAmount * 1e8);
          expect(parseInt(satoshis)).toBe(expectedSatoshis);
        }
      ), { numRuns: 500 });
    });

    it('should handle very small amounts', () => {
      const smallAmount = '0.00000001'; // 1 satoshi
      const result = toSatoshis(smallAmount);
      expect(result).toBe('1');
    });

    it('should handle large amounts without overflow', () => {
      const maxBTC = '21000000'; // Max Bitcoin supply
      const result = toSatoshis(maxBTC);
      expect(result).toBe('2100000000000000'); // 21M * 1e8
    });

    it('should round down fractional satoshis', () => {
      const fractionalBTC = '0.000000015'; // 1.5 satoshis
      const result = toSatoshis(fractionalBTC);
      expect(result).toBe('1'); // Should round down to 1 satoshi
    });

    // Test for potential precision issues
    it('should maintain precision for all decimal places', () => {
      fc.assert(fc.property(
        fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true })
          .map(f => f.toFixed(8)), // 8 decimal places
        (btcStr) => {
          const satoshis = toSatoshis(btcStr);
          const backToBTC = fromSatoshis(satoshis);
          const originalBTC = parseFloat(btcStr);
          const convertedBTC = parseFloat(backToBTC);
          
          // Should be within 1 satoshi (due to rounding down)
          expect(Math.abs(originalBTC - convertedBTC)).toBeLessThanOrEqual(0.00000001);
        }
      ), { numRuns: 300 });
    });
  });

  describe('fromSatoshis', () => {
    it('should convert satoshis to Bitcoin correctly', () => {
      fc.assert(fc.property(
        fc.integer({ min: 0, max: 2100000000000000 }), // Max satoshis
        (satoshis) => {
          const btc = fromSatoshis(satoshis);
          const expectedBTC = (satoshis / 1e8).toFixed(8);
          expect(btc).toBe(expectedBTC);
        }
      ), { numRuns: 500 });
    });

    it('should handle zero satoshis', () => {
      expect(fromSatoshis(0)).toBe('0.00000000');
    });

    it('should handle single satoshi', () => {
      expect(fromSatoshis(1)).toBe('0.00000001');
    });
  });

  describe('Math Operations', () => {
    it('should handle subtractSatoshis safely', () => {
      fc.assert(fc.property(
        fc.integer({ min: 1000, max: 1000000 }),
        fc.integer({ min: 1, max: 999 }),
        (minuend, subtrahend) => {
          const result = subtractSatoshis(minuend, subtrahend);
          const expected = minuend - subtrahend;
          expect(parseInt(result)).toBe(expected);
        }
      ), { numRuns: 200 });
    });

    it('should handle divideSatoshis with integer result', () => {
      fc.assert(fc.property(
        fc.integer({ min: 1000, max: 1000000 }),
        fc.integer({ min: 2, max: 100 }),
        (dividend, divisor) => {
          const result = divideSatoshis(dividend, divisor);
          const expected = Math.floor(dividend / divisor);
          expect(parseInt(result)).toBe(expected);
        }
      ), { numRuns: 200 });
    });

    it('should handle multiply operations', () => {
      fc.assert(fc.property(
        fc.float({ min: 1, max: 1000, noNaN: true }),
        fc.float({ min: 1, max: 1000, noNaN: true }),
        (a, b) => {
          const result = multiply(a, b);
          expect(result).toBeInstanceOf(BigNumber);
          expect(result.isNaN()).toBe(false);
        }
      ), { numRuns: 200 });
    });

    it('should handle divide by zero gracefully', () => {
      const result = divide(100, 0);
      expect(result.isFinite()).toBe(false); // Should be infinity
    });

    it('should compare satoshi amounts correctly', () => {
      fc.assert(fc.property(
        fc.integer({ min: 0, max: 1000000 }),
        fc.integer({ min: 0, max: 1000000 }),
        (a, b) => {
          const lessThan = isLessThanSatoshis(a, b);
          const lessThanOrEqual = isLessThanOrEqualToSatoshis(a, b);
          
          expect(lessThan).toBe(a < b);
          expect(lessThanOrEqual).toBe(a <= b);
        }
      ), { numRuns: 300 });
    });
  });

  describe('Rounding Operations', () => {
    it('should round down correctly', () => {
      fc.assert(fc.property(
        fc.float({ min: 0, max: 1000, noNaN: true }),
        (value) => {
          const result = roundDown(value);
          expect(result.isInteger()).toBe(true);
          expect(result.toNumber()).toBeLessThanOrEqual(value);
        }
      ), { numRuns: 200 });
    });

    it('should round up correctly', () => {
      fc.assert(fc.property(
        fc.float({ min: 0, max: 1000, noNaN: true }),
        (value) => {
          const result = roundUp(value);
          expect(result.isInteger()).toBe(true);
          expect(result.toNumber()).toBeGreaterThanOrEqual(value);
        }
      ), { numRuns: 200 });
    });

    it('should handle roundDownToMultiple', () => {
      fc.assert(fc.property(
        fc.integer({ min: 100, max: 10000 }),
        fc.integer({ min: 2, max: 100 }),
        (value, multiple) => {
          const bigValue = new BigNumber(value);
          const bigMultiple = new BigNumber(multiple);
          const result = roundDownToMultiple(bigValue, bigMultiple);
          
          // Result should be divisible by multiple
          expect(result.mod(bigMultiple).toNumber()).toBe(0);
          // Result should be <= original value
          expect(result.lte(bigValue)).toBe(true);
        }
      ), { numRuns: 200 });
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle extremely large numbers without crashing', () => {
      const extremelyLargeNumber = '9'.repeat(1000);
      expect(() => toBigNumber(extremelyLargeNumber)).not.toThrow();
    });

    it('should handle negative zero correctly', () => {
      const negativeZero = toBigNumber('-0');
      expect(negativeZero.toString()).toBe('0');
    });

    it('should detect zero or negative amounts', () => {
      fc.assert(fc.property(
        fc.oneof(
          fc.constant(0),
          fc.float({ min: -1000, max: 0, noNaN: true }),
        ),
        (value) => {
          const result = isLessThanOrEqualToZero(value);
          expect(result).toBe(true);
        }
      ), { numRuns: 100 });
    });

    it('should convert to number safely', () => {
      fc.assert(fc.property(
        fc.integer({ min: -1e10, max: 1e10 }),
        (value) => {
          const result = toNumber(value);
          expect(typeof result).toBe('number');
          expect(result).toBe(value);
        }
      ), { numRuns: 200 });
    });

    // Test for potential ReDoS in number parsing
    it('should handle complex number strings quickly', () => {
      const complexNumbers = [
        '1' + '.0'.repeat(1000),
        '0'.repeat(1000) + '1',
        '1' + '0'.repeat(1000),
      ];
      
      complexNumbers.forEach(num => {
        const start = Date.now();
        toBigNumber(num);
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(100); // Should complete quickly
      });
    });

    // Test for precision preservation in chained operations
    it('should maintain precision in chained operations', () => {
      fc.assert(fc.property(
        fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true }),
        (initialValue) => {
          // Chain several operations
          const result = subtract(
            multiply(
              divide(initialValue, 2),
              4
            ),
            initialValue
          );
          
          // Result should be close to initialValue (2 * initialValue - initialValue)
          const expected = initialValue;
          const actual = result.toNumber();
          expect(Math.abs(actual - expected)).toBeLessThan(0.000001);
        }
      ), { numRuns: 100 });
    });
  });
});