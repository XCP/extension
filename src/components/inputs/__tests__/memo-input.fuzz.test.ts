/**
 * Fuzz tests for Memo Input validation
 * Tests hex vs text detection, length validation, and encoding edge cases
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Helper functions for memo validation
const isHexMemo = (value: string): boolean => {
  const trimmed = value.trim();
  // Check if it starts with 0x or is all hex characters (case sensitive for 0x)
  if (trimmed.startsWith('0x')) {
    const hexContent = trimmed.slice(2);
    // Require at least one hex char after 0x
    return hexContent.length > 0 && /^[0-9a-fA-F]*$/.test(hexContent) && hexContent.length % 2 === 0;
  }
  // Pure hex (even length for valid byte encoding)
  return /^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0;
};

const stripHexPrefix = (hex: string): string => {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
};

const validateMemoLength = (memo: string, isHex: boolean, maxBytes: number = 80): boolean => {
  if (isHex) {
    const hexContent = stripHexPrefix(memo);
    return hexContent.length <= maxBytes * 2; // 2 hex chars per byte
  } else {
    // Text memo - check UTF-8 byte length
    const encoder = new TextEncoder();
    const bytes = encoder.encode(memo);
    return bytes.length <= maxBytes;
  }
};

describe('Memo Input Validation Fuzz Tests', () => {
  describe('Hex detection', () => {
    it('should correctly identify hex strings', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => /^[0-9a-fA-F]*$/.test(s) && s.length > 0),
          (hex) => {
            // Even-length hex strings should be detected as hex
            const evenHex = hex.length % 2 === 0 ? hex : hex + '0';
            expect(isHexMemo(evenHex)).toBe(true);
            expect(isHexMemo('0x' + evenHex)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify non-hex strings', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !/^[0-9a-fA-F]*$/.test(s) || s.length % 2 !== 0),
          (text) => {
            if (!text.startsWith('0x')) {
              expect(isHexMemo(text)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge cases in hex detection', () => {
      const edgeCases = [
        { input: '', expected: false },
        { input: '0x', expected: false }, // Empty hex after prefix
        { input: '0X', expected: false }, // Case sensitive
        { input: '0x0', expected: false }, // Odd length
        { input: '0x00', expected: true },
        { input: '00', expected: true },
        { input: '0', expected: false }, // Odd length
        { input: 'hello', expected: false },
        { input: 'deadbeef', expected: true },
        { input: 'DEADBEEF', expected: true },
        { input: 'deadbeef0', expected: false }, // Odd length
        { input: 'dead beef', expected: false }, // Space
        { input: '0xdead beef', expected: false },
        { input: '0xg', expected: false }, // Invalid hex char
        { input: 'zz', expected: false },
        { input: '  0x00  ', expected: true }, // With whitespace
        { input: '\n0x00\n', expected: true },
        { input: '0x' + 'a'.repeat(160), expected: true }, // Long hex
      ];

      edgeCases.forEach(({ input, expected }) => {
        expect(isHexMemo(input)).toBe(expected);
      });
    });
  });

  describe('Memo length validation', () => {
    it('should correctly validate hex memo lengths', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string().filter(s => /^[0-9a-fA-F]*$/.test(s) && s.length > 0),
            fc.nat(200)
          ),
          ([hex, maxBytes]) => {
            const evenHex = hex.length % 2 === 0 ? hex : hex + '0';
            const withPrefix = '0x' + evenHex;
            
            const bytesNeeded = evenHex.length / 2;
            const shouldBeValid = bytesNeeded <= maxBytes;
            
            expect(validateMemoLength(withPrefix, true, maxBytes)).toBe(shouldBeValid);
            expect(validateMemoLength(evenHex, true, maxBytes)).toBe(shouldBeValid);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly validate text memo lengths', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string(),
            fc.nat(200)
          ),
          ([text, maxBytes]) => {
            const encoder = new TextEncoder();
            const actualBytes = encoder.encode(text).length;
            const shouldBeValid = actualBytes <= maxBytes;
            
            expect(validateMemoLength(text, false, maxBytes)).toBe(shouldBeValid);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle UTF-8 multi-byte characters correctly', () => {
      const testCases = [
        { char: 'a', bytes: 1 },      // ASCII
        { char: '€', bytes: 3 },      // Euro sign
        { char: '中', bytes: 3 },     // Chinese
        { char: '🎨', bytes: 4 },     // Emoji
        { char: '\u0000', bytes: 1 }, // Null
        { char: '\n', bytes: 1 },     // Newline
      ];

      testCases.forEach(({ char, bytes }) => {
        const repeated = char.repeat(10);
        const encoder = new TextEncoder();
        const actualBytes = encoder.encode(repeated).length;
        
        expect(actualBytes).toBe(bytes * 10);
        expect(validateMemoLength(repeated, false, actualBytes)).toBe(true);
        expect(validateMemoLength(repeated, false, actualBytes - 1)).toBe(false);
      });
    });
  });

  describe('Hex prefix handling', () => {
    it('should correctly strip hex prefixes', () => {
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

    it('should handle malformed hex prefixes', () => {
      const cases = [
        { input: '0x0x00', expected: '0x00' },
        { input: '00x00', expected: '00x00' },
        { input: 'x00', expected: 'x00' },
        { input: '0', expected: '0' },
        { input: '', expected: '' },
        { input: '0xx', expected: 'x' },
      ];

      cases.forEach(({ input, expected }) => {
        expect(stripHexPrefix(input)).toBe(expected);
      });
    });
  });

  describe('Mixed content detection', () => {
    it('should handle ambiguous inputs correctly', () => {
      const ambiguousCases = [
        'cafe',    // Valid hex word
        'babe',    // Valid hex word
        'face',    // Valid hex word  
        'decade',  // Not valid hex (odd length)
        'cab',     // Odd length hex
        '12345',   // Odd length numbers
        'feed',    // Valid hex
      ];

      ambiguousCases.forEach(input => {
        const isHex = isHexMemo(input);
        // Should be hex only if even length and all valid hex chars
        const expectedHex = /^[0-9a-fA-F]+$/.test(input) && input.length % 2 === 0;
        expect(isHex).toBe(expectedHex);
      });
    });
  });

  describe('Injection and security', () => {
    it('should safely handle injection attempts', () => {
      const injectionAttempts = [
        '<script>alert(1)</script>',
        'javascript:alert(1)',
        '${process.env.SECRET}',
        '{{template}}',
        '%00%01%02',
        '../../../etc/passwd',
        'file:///etc/passwd',
        '"; DROP TABLE memos; --',
        '\x00\x01\x02',
        String.fromCharCode(0),
      ];

      injectionAttempts.forEach(attempt => {
        // Should process without executing
        expect(() => {
          isHexMemo(attempt);
          validateMemoLength(attempt, false, 80);
          stripHexPrefix(attempt);
        }).not.toThrow();
        
        // Should not be detected as valid hex
        expect(isHexMemo(attempt)).toBe(false);
      });
    });
  });

  describe('Encoding edge cases', () => {
    it('should handle various encodings correctly', () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ maxLength: 100 }),
          (bytes) => {
            // Convert bytes to hex
            const hex = Array.from(bytes)
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');
            
            // Empty hex string is not valid hex memo
            if (hex.length === 0) {
              expect(isHexMemo(hex)).toBe(false);
              expect(isHexMemo('0x' + hex)).toBe(false);
            } else {
              expect(isHexMemo(hex)).toBe(true);
              expect(isHexMemo('0x' + hex)).toBe(true);
            }
            
            // Verify length calculation (only test if we have data)
            if (bytes.length > 0) {
              expect(validateMemoLength(hex, true, bytes.length)).toBe(true);
              expect(validateMemoLength(hex, true, bytes.length - 1)).toBe(false);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle boundary conditions', () => {
      const boundaries = [
        0,     // Min byte
        79,    // Just under typical limit
        80,    // Typical memo limit
        81,    // Just over limit
        255,   // Max single byte
        256,   // Overflow single byte
        65535, // Max uint16
      ];

      boundaries.forEach(size => {
        const hex = 'a'.repeat(size * 2);
        const text = 'x'.repeat(size);
        
        // Hex validation
        expect(validateMemoLength(hex, true, size)).toBe(true);
        expect(validateMemoLength(hex, true, size - 1)).toBe(false);
        
        // Text validation (assuming ASCII)
        expect(validateMemoLength(text, false, size)).toBe(true);
        if (size > 0) {
          expect(validateMemoLength(text, false, size - 1)).toBe(false);
        }
      });
    });
  });

  describe('Performance with large inputs', () => {
    it('should handle large memos efficiently', () => {
      fc.assert(
        fc.property(
          fc.nat(10000),
          (size) => {
            const largeMemo = 'a'.repeat(size);
            const largeHex = 'ab'.repeat(size);
            
            // Should process without hanging
            const start = Date.now();
            
            isHexMemo(largeMemo);
            isHexMemo(largeHex);
            validateMemoLength(largeMemo, false, size);
            validateMemoLength(largeHex, true, size);
            
            const elapsed = Date.now() - start;
            
            // Should complete quickly (< 100ms)
            expect(elapsed).toBeLessThan(100);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Whitespace and formatting', () => {
    it('should handle whitespace correctly', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string(),
            fc.constantFrom(' ', '\t', '\n', '\r', '  ')
          ),
          ([content, whitespace]) => {
            const withWhitespace = whitespace + content + whitespace;
            
            // Hex detection should trim
            const trimmed = content.trim();
            if (isHexMemo(trimmed)) {
              expect(isHexMemo(withWhitespace)).toBe(true);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});