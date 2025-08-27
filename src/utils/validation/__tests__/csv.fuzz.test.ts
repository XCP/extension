/**
 * Fuzz tests for CSV parsing and validation
 * Tests for injection attacks, malformed data, and edge cases
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  parseCSVLine,
  isHeaderRow,
  validateBitcoinAddress,
  validateQuantity,
  detectCSVInjection,
  parseCSV,
  sanitizeCSVValue
} from '../csv';

describe('CSV Parser Fuzz Tests', () => {
  describe('parseCSVLine', () => {
    it('should handle arbitrary strings without crashing', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (line) => {
            expect(() => {
              parseCSVLine(line);
            }).not.toThrow();
            
            const result = parseCSVLine(line);
            expect(Array.isArray(result)).toBe(true);
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should correctly parse quoted values with commas', () => {
      const testCases = [
        { input: '"a,b",c,d', expected: ['a,b', 'c', 'd'] },
        { input: 'a,"b,c",d', expected: ['a', 'b,c', 'd'] },
        { input: '"a","b","c"', expected: ['a', 'b', 'c'] },
        { input: '"",,""', expected: ['', '', ''] },
        { input: '"a""b",c', expected: ['a"b', 'c'] }, // Escaped quote
      ];

      testCases.forEach(({ input, expected }) => {
        expect(parseCSVLine(input)).toEqual(expected);
      });
    });

    it('should handle edge cases', () => {
      expect(parseCSVLine('')).toEqual([]);
      expect(parseCSVLine(',')).toEqual(['', '']);
      expect(parseCSVLine(',,,')).toEqual(['', '', '', '']);
      expect(parseCSVLine('"')).toEqual(['']); // Unclosed quote
      expect(parseCSVLine('a,b,')).toEqual(['a', 'b', '']);
    });

    it('should handle various quote patterns', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string()),
          (values) => {
            // Create CSV with quoted values
            const csv = values.map(v => `"${v.replace(/"/g, '""')}"`).join(',');
            const parsed = parseCSVLine(csv);
            
            // Should preserve values (except for quote escaping)
            expect(parsed.length).toBe(values.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('detectCSVInjection', () => {
    it('should detect formula injection attempts', () => {
      const injectionPayloads = [
        '=1+1',
        '=SUM(A1:A10)',
        '@SUM(A1:A10)',
        '+1+1',
        '-1+1',
        '=cmd|"/c calc"',
        '=HYPERLINK("http://evil.com")',
        '@IMPORT',
        '${7*7}',
        '=1+1+cmd|" /C calc"!A0'
      ];

      injectionPayloads.forEach(payload => {
        expect(detectCSVInjection(payload)).toBe(true);
      });
    });

    it('should not flag legitimate values', () => {
      const legitimateValues = [
        '1234',
        'TEST',
        'Hello World',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '100.50',
        'Asset name with spaces',
        '#hashtag',
        '!important'
      ];

      legitimateValues.forEach(value => {
        expect(detectCSVInjection(value)).toBe(false);
      });
    });

    it('should handle arbitrary strings safely', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            expect(() => {
              detectCSVInjection(input);
            }).not.toThrow();
            
            const result = detectCSVInjection(input);
            expect(typeof result).toBe('boolean');
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  describe('validateBitcoinAddress', () => {
    it('should validate known address formats', () => {
      const validAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // P2PKH
        '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', // P2SH
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', // P2WPKH
        'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297', // P2TR
      ];

      validAddresses.forEach(address => {
        expect(validateBitcoinAddress(address)).toBe(true);
      });
    });

    it('should reject invalid addresses', () => {
      const invalidAddresses = [
        '',
        'invalid',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1', // Ethereum
        '1234567890',
        'bc1zzz', // Invalid bech32
        'LM2WMpR1Rp6j3Sa59cMXMs1SPzj9eXpGc1', // Litecoin
      ];

      invalidAddresses.forEach(address => {
        expect(validateBitcoinAddress(address)).toBe(false);
      });
    });

    it('should not crash on arbitrary input', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            expect(() => {
              validateBitcoinAddress(input);
            }).not.toThrow();
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  describe('validateQuantity', () => {
    it('should validate numeric quantities', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0.000001, max: 1000000, noNaN: true }),
          (num) => {
            const str = num.toString();
            const result = validateQuantity(str);
            
            if (num > 0) {
              expect(result.valid).toBe(true);
              expect(result.value).toBeCloseTo(num);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject injection attempts in quantities', () => {
      const injectionQuantities = [
        '=1+1',
        '@SUM(1,2)',
        '+100',
        '-100',
        '${100}',
        '100; DROP TABLE;'
      ];

      injectionQuantities.forEach(qty => {
        const result = validateQuantity(qty);
        expect(result.valid).toBe(false);
      });
    });

    it('should handle edge cases', () => {
      expect(validateQuantity('').valid).toBe(false);
      expect(validateQuantity('0').valid).toBe(false);
      expect(validateQuantity('-1').valid).toBe(false);
      expect(validateQuantity('abc').valid).toBe(false);
      expect(validateQuantity('Infinity').valid).toBe(false);
      expect(validateQuantity('NaN').valid).toBe(false);
      expect(validateQuantity(Number.MAX_SAFE_INTEGER.toString()).valid).toBe(true);
      expect(validateQuantity((Number.MAX_SAFE_INTEGER + 1).toString()).valid).toBe(false);
    });
  });

  describe('parseCSV - Full parser', () => {
    it('should parse valid CSV data', () => {
      const csv = `address,asset,quantity,memo
1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,XCP,100,Test memo
3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy,PEPECASH,50.5,Another memo`;

      const result = parseCSV(csv);
      expect(result.success).toBe(true);
      expect(result.rows).toHaveLength(2);
      expect(result.rows![0].asset).toBe('XCP');
      expect(result.rows![0].quantityNum).toBe(100);
    });

    it('should handle various line endings', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('\n', '\r\n', '\r'),
          (lineEnding) => {
            const csv = [
              'address,asset,quantity',
              '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,XCP,100',
              '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy,TEST,50'
            ].join(lineEnding);

            const result = parseCSV(csv);
            expect(result.success).toBe(true);
            expect(result.rows).toHaveLength(2);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should detect and reject injection attempts', () => {
      const maliciousCSV = `address,asset,quantity
1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,XCP,=1+1`;

      const result = parseCSV(maliciousCSV);
      expect(result.success).toBe(false);
      expect(result.error).toContain('injection');
    });

    it('should enforce row limits', () => {
      const manyRows = Array(101)
        .fill('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa,XCP,100')
        .join('\n');

      const result = parseCSV(manyRows, { maxRows: 100 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many rows');
    });

    it('should handle malformed CSV gracefully', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (csv) => {
            expect(() => {
              parseCSV(csv);
            }).not.toThrow();
            
            const result = parseCSV(csv);
            expect(result).toHaveProperty('success');
            expect(typeof result.success).toBe('boolean');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty and whitespace', () => {
      expect(parseCSV('').success).toBe(false);
      expect(parseCSV('   ').success).toBe(false);
      expect(parseCSV('\n\n\n').success).toBe(false);
      expect(parseCSV(',,,,').success).toBe(false);
    });
  });

  describe('sanitizeCSVValue', () => {
    it('should remove injection characters', () => {
      expect(sanitizeCSVValue('=1+1')).toBe('1+1');
      expect(sanitizeCSVValue('@SUM')).toBe('SUM');
      expect(sanitizeCSVValue('+100')).toBe('100');
      expect(sanitizeCSVValue('-100')).toBe('100');
      expect(sanitizeCSVValue('====test')).toBe('test');
    });

    it('should remove control characters', () => {
      expect(sanitizeCSVValue('test\x00value')).toBe('testvalue');
      expect(sanitizeCSVValue('test\nvalue')).toBe('testvalue');
      expect(sanitizeCSVValue('test\rvalue')).toBe('testvalue');
      expect(sanitizeCSVValue('test\tvalue')).toBe('testvalue');
    });

    it('should handle arbitrary input safely', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            expect(() => {
              sanitizeCSVValue(input);
            }).not.toThrow();
            
            const result = sanitizeCSVValue(input);
            expect(typeof result).toBe('string');
            // Should not start with injection characters
            if (result.length > 0) {
              expect('=@+-'.includes(result[0])).toBe(false);
            }
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  describe('Edge cases and performance', () => {
    it('should handle extremely long CSV lines', () => {
      const longLine = 'a'.repeat(10000) + ',' + 'b'.repeat(10000) + ',100';
      
      const start = Date.now();
      const result = parseCSVLine(longLine);
      const elapsed = Date.now() - start;
      
      expect(result).toHaveLength(3);
      expect(elapsed).toBeLessThan(100);
    });

    it('should handle CSV with many columns', () => {
      const manyColumns = Array(1000).fill('value').join(',');
      
      const result = parseCSVLine(manyColumns);
      expect(result).toHaveLength(1000);
    });

    it('should handle deeply nested quotes', () => {
      const nested = '"'.repeat(100) + 'value' + '"'.repeat(100);
      
      expect(() => {
        parseCSVLine(nested);
      }).not.toThrow();
    });

    it('should maintain consistency', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (csv) => {
            // Multiple parses should give same result
            const result1 = parseCSV(csv);
            const result2 = parseCSV(csv);
            
            expect(result1.success).toBe(result2.success);
            if (result1.error) {
              expect(result1.error).toBe(result2.error);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});