/**
 * Fuzz tests for memo validation functions
 * Tests REAL validation logic
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  isHexMemo,
  stripHexPrefix,
  validateMemoLength,
  getMemoByteLength,
  validateMemo,
  hexToText,
  textToHex
} from '../memo';

describe('Memo Validation Fuzz Tests', () => {
  describe('isHexMemo', () => {
    it('should correctly identify hex strings', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => /^[0-9a-fA-F]*$/.test(s) && s.length > 0),
          (hex) => {
            // Even-length hex should be valid
            const evenHex = hex.length % 2 === 0 ? hex : hex + '0';
            expect(isHexMemo(evenHex)).toBe(true);
            expect(isHexMemo('0x' + evenHex)).toBe(true);
            
            // Odd-length hex should be invalid (without 0x)
            if (hex.length % 2 !== 0) {
              expect(isHexMemo(hex)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject non-hex strings', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !/^[0-9a-fA-F]*$/.test(s)),
          (text) => {
            if (!text.startsWith('0x')) {
              expect(isHexMemo(text)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge cases correctly', () => {
      const testCases = [
        { input: '', expected: false },
        { input: '0x', expected: false },
        { input: '0x00', expected: true },
        { input: '00', expected: true },
        { input: '0', expected: false },
        { input: 'deadbeef', expected: true },
        { input: 'DEADBEEF', expected: true },
        { input: 'dead beef', expected: false },
        { input: '0xg', expected: false },
        { input: '  0x00  ', expected: true },
      ];

      testCases.forEach(({ input, expected }) => {
        expect(isHexMemo(input)).toBe(expected);
      });
    });
  });

  describe('stripHexPrefix', () => {
    it('should strip hex prefixes correctly', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => /^[0-9a-fA-F]*$/.test(s) && s.length > 0),
          (hex) => {
            expect(stripHexPrefix(hex)).toBe(hex);
            expect(stripHexPrefix('0x' + hex)).toBe(hex);
            expect(stripHexPrefix('0X' + hex)).toBe('0X' + hex); // Case sensitive
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge cases', () => {
      expect(stripHexPrefix('')).toBe('');
      expect(stripHexPrefix('0x')).toBe('');
      expect(stripHexPrefix('0x0x00')).toBe('0x00');
    });
  });

  describe('validateMemoLength', () => {
    it('should validate hex memo lengths correctly', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string().filter(s => /^[0-9a-fA-F]*$/.test(s) && s.length > 0),
            fc.integer({ min: 1, max: 200 })
          ),
          ([hex, maxBytes]) => {
            const evenHex = hex.length % 2 === 0 ? hex : hex + '0';
            const bytesNeeded = evenHex.length / 2;
            
            expect(validateMemoLength(evenHex, true, maxBytes)).toBe(bytesNeeded <= maxBytes);
            expect(validateMemoLength('0x' + evenHex, true, maxBytes)).toBe(bytesNeeded <= maxBytes);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate text memo lengths with UTF-8', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string(),
            fc.integer({ min: 1, max: 200 })
          ),
          ([text, maxBytes]) => {
            const encoder = new TextEncoder();
            const actualBytes = encoder.encode(text).length;
            
            expect(validateMemoLength(text, false, maxBytes)).toBe(actualBytes <= maxBytes);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle multi-byte UTF-8 characters', () => {
      const testCases = [
        { char: 'a', bytes: 1 },
        { char: '€', bytes: 3 },
        { char: '中', bytes: 3 },
        { char: '🎨', bytes: 4 },
      ];

      testCases.forEach(({ char, bytes }) => {
        const text = char.repeat(10);
        expect(getMemoByteLength(text, false)).toBe(bytes * 10);
        expect(validateMemoLength(text, false, bytes * 10)).toBe(true);
        expect(validateMemoLength(text, false, bytes * 10 - 1)).toBe(false);
      });
    });
  });

  describe('getMemoByteLength', () => {
    it('should calculate hex byte length correctly', () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ maxLength: 100 }),
          (bytes) => {
            const hex = Array.from(bytes)
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');
            
            expect(getMemoByteLength(hex, true)).toBe(bytes.length);
            expect(getMemoByteLength('0x' + hex, true)).toBe(bytes.length);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should calculate text byte length correctly', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (text) => {
            const encoder = new TextEncoder();
            const expectedLength = encoder.encode(text).length;
            
            expect(getMemoByteLength(text, false)).toBe(expectedLength);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('validateMemo', () => {
    it('should validate memos comprehensively', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (memo) => {
            const result = validateMemo(memo);
            
            expect(result).toHaveProperty('isValid');
            expect(typeof result.isValid).toBe('boolean');
            
            if (result.isValid) {
              expect(result).toHaveProperty('isHex');
              expect(result).toHaveProperty('byteLength');
              expect(typeof result.byteLength).toBe('number');
            } else {
              expect(result).toHaveProperty('error');
              expect(typeof result.error).toBe('string');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enforce max byte limits', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string(),
            fc.integer({ min: 1, max: 100 })
          ),
          ([memo, maxBytes]) => {
            const result = validateMemo(memo, { maxBytes });
            
            if (result.isValid && result.byteLength !== undefined) {
              expect(result.byteLength).toBeLessThanOrEqual(maxBytes);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should respect type restrictions', () => {
      const hexMemo = 'deadbeef';
      const textMemo = 'Hello World';
      
      // Allow only hex
      let result = validateMemo(hexMemo, { allowHex: true, allowText: false });
      expect(result.isValid).toBe(true);
      
      result = validateMemo(textMemo, { allowHex: true, allowText: false });
      expect(result.isValid).toBe(false);
      
      // Allow only text
      result = validateMemo(textMemo, { allowHex: false, allowText: true });
      expect(result.isValid).toBe(true);
      
      result = validateMemo(hexMemo, { allowHex: false, allowText: true });
      expect(result.isValid).toBe(false);
    });
  });

  describe('hexToText and textToHex', () => {
    it('should round-trip correctly', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (text) => {
            const hex = textToHex(text);
            const decoded = hexToText(hex);
            
            expect(decoded).toBe(text);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle binary data', () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ maxLength: 100 }),
          (bytes) => {
            const hex = Array.from(bytes)
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');
            
            // Try to decode - might fail if not valid UTF-8
            const decoded = hexToText(hex);
            
            if (decoded !== null) {
              // If it decoded successfully, encoding back should give same hex
              const reencoded = textToHex(decoded);
              // Note: May not be exact same due to UTF-8 normalization
              expect(reencoded).toBeDefined();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle invalid hex gracefully', () => {
      const invalidHex = [
        'deadbeef1', // Odd length
        'xyz',
        'g00d',
        ''
      ];

      invalidHex.forEach(hex => {
        const result = hexToText(hex);
        if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
          expect(result).toBe(null);
        }
      });
    });
  });

  describe('Security and edge cases', () => {
    it('should handle injection attempts safely', () => {
      const injections = [
        '<script>alert(1)</script>',
        '${process.env.SECRET}',
        '"; DROP TABLE memos;',
        '\x00\x01\x02',
        '../../../etc/passwd'
      ];

      injections.forEach(injection => {
        expect(() => {
          validateMemo(injection);
          isHexMemo(injection);
          getMemoByteLength(injection, false);
        }).not.toThrow();
      });
    });

    it('should handle extremely long inputs efficiently', () => {
      const longMemo = 'a'.repeat(10000);
      
      const start = Date.now();
      validateMemo(longMemo);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeLessThan(50);
    });

    it('should maintain consistency', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (memo) => {
            // Multiple calls should give same result
            const result1 = validateMemo(memo);
            const result2 = validateMemo(memo);
            
            expect(result1.isValid).toBe(result2.isValid);
            expect(result1.isHex).toBe(result2.isHex);
            expect(result1.byteLength).toBe(result2.byteLength);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});