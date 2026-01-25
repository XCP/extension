/**
 * Fuzz tests for signature JSON validation
 * Tests for malformed input, boundary conditions, and security edge cases
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateSignatureJson,
  validateJsonText,
  parseAndValidateSignatureJson,
  SIGNATURE_JSON_LIMITS,
} from '../signatureJson';

describe('signatureJson fuzz tests', () => {
  describe('validateJsonText', () => {
    it('should handle arbitrary strings without crashing', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (text) => {
            expect(() => {
              validateJsonText(text);
            }).not.toThrow();

            const result = validateJsonText(text);
            expect(result).toHaveProperty('valid');
            expect(typeof result.valid).toBe('boolean');
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should handle unicode and special character strings safely', () => {
      // Test with various string types including unicode
      const specialStrings = [
        '测试文件',
        'файл',
        '🎉emoji🚀',
        'مستند',
        'line1\nline2',
        'tab\there',
        '\x00\x01\x02',
        '混合mixed內容',
      ];

      specialStrings.forEach(text => {
        expect(() => {
          validateJsonText(text);
        }).not.toThrow();
      });

      // Also run property-based tests with random strings
      fc.assert(
        fc.property(
          fc.string(),
          (text) => {
            expect(() => {
              validateJsonText(text);
            }).not.toThrow();
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  describe('validateSignatureJson', () => {
    it('should handle arbitrary objects without crashing', () => {
      fc.assert(
        fc.property(
          fc.anything(),
          (data) => {
            expect(() => {
              validateSignatureJson(data);
            }).not.toThrow();

            const result = validateSignatureJson(data);
            expect(result).toHaveProperty('valid');
            expect(typeof result.valid).toBe('boolean');
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should handle deeply nested objects', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          (depth) => {
            // Create deeply nested object
            let nested: any = { value: 'deep' };
            for (let i = 0; i < depth; i++) {
              nested = { nested };
            }

            const data = {
              address: nested,
              message: 'test',
              signature: 'test',
            };

            expect(() => {
              validateSignatureJson(data);
            }).not.toThrow();

            const result = validateSignatureJson(data);
            expect(result.valid).toBe(false); // Should reject nested address
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle arrays of various types in fields', () => {
      fc.assert(
        fc.property(
          fc.array(fc.anything(), { minLength: 0, maxLength: 10 }),
          (arr) => {
            const data = {
              address: arr,
              message: 'test',
              signature: 'test',
            };

            expect(() => {
              validateSignatureJson(data);
            }).not.toThrow();

            const result = validateSignatureJson(data);
            expect(result.valid).toBe(false); // Arrays should fail
          }
        ),
        { numRuns: 200 }
      );
    });

    it('should handle objects with many random extra fields', () => {
      fc.assert(
        fc.property(
          fc.dictionary(fc.string(), fc.anything()),
          (extraFields) => {
            const data = {
              address: 'test',
              message: 'test',
              signature: 'test',
              ...extraFields,
            };

            expect(() => {
              validateSignatureJson(data);
            }).not.toThrow();

            const result = validateSignatureJson(data);
            // If extra fields exist (beyond our allowed ones), should fail
            const hasExtraFields = Object.keys(extraFields).some(
              k => !['address', 'message', 'signature', 'timestamp'].includes(k)
            );
            if (hasExtraFields) {
              expect(result.valid).toBe(false);
            }
          }
        ),
        { numRuns: 500 }
      );
    });

    it('should handle strings of varying lengths in all fields', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: SIGNATURE_JSON_LIMITS.MAX_MESSAGE_LENGTH + 100 }),
          fc.string({ minLength: 0, maxLength: SIGNATURE_JSON_LIMITS.MAX_ADDRESS_LENGTH + 100 }),
          fc.string({ minLength: 0, maxLength: SIGNATURE_JSON_LIMITS.MAX_SIGNATURE_LENGTH + 100 }),
          (message, address, signature) => {
            const data = { address, message, signature };

            expect(() => {
              validateSignatureJson(data);
            }).not.toThrow();

            const result = validateSignatureJson(data);
            expect(result).toHaveProperty('valid');

            // If all fields are valid strings within limits, should pass
            // If any field is empty or over limit, should fail
            if (
              address.trim().length > 0 &&
              address.length <= SIGNATURE_JSON_LIMITS.MAX_ADDRESS_LENGTH &&
              message.trim().length > 0 &&
              message.length <= SIGNATURE_JSON_LIMITS.MAX_MESSAGE_LENGTH &&
              signature.trim().length > 0 &&
              signature.length <= SIGNATURE_JSON_LIMITS.MAX_SIGNATURE_LENGTH
            ) {
              expect(result.valid).toBe(true);
            }
          }
        ),
        { numRuns: 500 }
      );
    });

    it('should handle null and undefined values in fields', () => {
      const nullValues = [null, undefined];

      nullValues.forEach(nullVal => {
        const testCases = [
          { address: nullVal, message: 'test', signature: 'test' },
          { address: 'test', message: nullVal, signature: 'test' },
          { address: 'test', message: 'test', signature: nullVal },
          { address: nullVal, message: nullVal, signature: nullVal },
        ];

        testCases.forEach(data => {
          expect(() => {
            validateSignatureJson(data);
          }).not.toThrow();

          const result = validateSignatureJson(data);
          expect(result.valid).toBe(false);
        });
      });
    });

    it('should handle special number values', () => {
      const specialNumbers = [NaN, Infinity, -Infinity, 0, -0, Number.MAX_VALUE, Number.MIN_VALUE];

      specialNumbers.forEach(num => {
        const data = {
          address: num,
          message: 'test',
          signature: 'test',
        };

        expect(() => {
          validateSignatureJson(data);
        }).not.toThrow();

        const result = validateSignatureJson(data);
        expect(result.valid).toBe(false); // Numbers should fail
      });
    });

    it('should handle boolean values', () => {
      const data = {
        address: true,
        message: false,
        signature: 'test',
      };

      expect(() => {
        validateSignatureJson(data);
      }).not.toThrow();

      const result = validateSignatureJson(data);
      expect(result.valid).toBe(false);
    });

    it('should handle Symbol and BigInt values', () => {
      const data = {
        address: 'test',
        message: 'test',
        signature: 'test',
        extra: Symbol('test'),
      };

      // Symbol won't be enumerated by Object.keys
      expect(() => {
        validateSignatureJson(data);
      }).not.toThrow();

      const bigIntData = {
        address: BigInt(123),
        message: 'test',
        signature: 'test',
      };

      expect(() => {
        validateSignatureJson(bigIntData);
      }).not.toThrow();

      const result = validateSignatureJson(bigIntData);
      expect(result.valid).toBe(false);
    });
  });

  describe('parseAndValidateSignatureJson', () => {
    it('should handle arbitrary JSON-like strings', () => {
      fc.assert(
        fc.property(
          fc.json(),
          (jsonString) => {
            expect(() => {
              parseAndValidateSignatureJson(jsonString);
            }).not.toThrow();

            const result = parseAndValidateSignatureJson(jsonString);
            expect(result).toHaveProperty('valid');
            expect(typeof result.valid).toBe('boolean');
          }
        ),
        { numRuns: 500 }
      );
    });

    it('should handle malformed JSON gracefully', () => {
      const malformedJsons = [
        '{',
        '{"address":}',
        '{"address": "test"',
        '[1,2,3',
        'undefined',
        'NaN',
        '{"a": undefined}',
        '{"a": NaN}',
        '{a: "b"}', // Unquoted key
        "{'a': 'b'}", // Single quotes
        '{"a": \'b\'}', // Mixed quotes
        '{"a": "b",}', // Trailing comma
      ];

      malformedJsons.forEach(json => {
        expect(() => {
          parseAndValidateSignatureJson(json);
        }).not.toThrow();

        const result = parseAndValidateSignatureJson(json);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('should handle valid JSON with invalid structure', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.string(),
            fc.array(fc.anything()),
            fc.constant(null)
          ),
          (value) => {
            const jsonString = JSON.stringify(value);

            expect(() => {
              parseAndValidateSignatureJson(jsonString);
            }).not.toThrow();

            const result = parseAndValidateSignatureJson(jsonString);
            expect(result.valid).toBe(false); // These are not valid signature objects
          }
        ),
        { numRuns: 200 }
      );
    });

    it('should handle JSON with unicode escape sequences', () => {
      const unicodeJsons = [
        '{"address": "\\u0041\\u0042\\u0043", "message": "test", "signature": "sig"}',
        '{"address": "test", "message": "\\u4e2d\\u6587", "signature": "sig"}',
        '{"address": "\\uD83D\\uDE00", "message": "test", "signature": "sig"}', // Emoji
      ];

      unicodeJsons.forEach(json => {
        expect(() => {
          parseAndValidateSignatureJson(json);
        }).not.toThrow();

        const result = parseAndValidateSignatureJson(json);
        // These should be valid as they decode to valid strings
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('security edge cases', () => {
    it('should handle JSON with __proto__ in various forms', () => {
      const protoJsons = [
        '{"__proto__": {"isAdmin": true}, "address": "a", "message": "m", "signature": "s"}',
        '{"constructor": {"prototype": {}}, "address": "a", "message": "m", "signature": "s"}',
        '{"prototype": {}, "address": "a", "message": "m", "signature": "s"}',
      ];

      protoJsons.forEach(json => {
        expect(() => {
          parseAndValidateSignatureJson(json);
        }).not.toThrow();

        const result = parseAndValidateSignatureJson(json);
        // Should reject due to unexpected fields
        // Note: __proto__ may or may not appear depending on JSON.parse behavior
        if (!result.valid) {
          expect(result.error).toContain('Unexpected');
        }
      });
    });

    it('should handle extremely long field values', () => {
      // Generate string just over limit
      const overLimit = {
        address: 'a'.repeat(SIGNATURE_JSON_LIMITS.MAX_ADDRESS_LENGTH + 1),
        message: 'test',
        signature: 'test',
      };

      const result = validateSignatureJson(overLimit);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds');
    });

    it('should handle file size limit', () => {
      // String just over file size limit
      const hugeJson = JSON.stringify({
        address: 'test',
        message: 'x'.repeat(SIGNATURE_JSON_LIMITS.MAX_FILE_SIZE),
        signature: 'test',
      });

      const result = parseAndValidateSignatureJson(hugeJson);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('should handle strings with null bytes', () => {
      const nullByteStrings = [
        'test\x00string',
        '\x00',
        'before\x00after',
        '\x00\x00\x00',
      ];

      nullByteStrings.forEach(str => {
        const data = {
          address: str,
          message: 'test',
          signature: 'test',
        };

        expect(() => {
          validateSignatureJson(data);
        }).not.toThrow();

        // We don't specifically block null bytes, but the function shouldn't crash
        const result = validateSignatureJson(data);
        expect(result).toHaveProperty('valid');
      });
    });

    it('should handle strings with newlines and special whitespace', () => {
      // Strings with content plus whitespace should pass
      const validWhitespaceStrings = [
        'line1\nline2',
        'line1\r\nline2',
        'tab\there',
        'unicode\u2028line\u2029paragraph',
      ];

      validWhitespaceStrings.forEach(str => {
        const data = {
          address: 'test',
          message: str,
          signature: 'test',
        };

        expect(() => {
          validateSignatureJson(data);
        }).not.toThrow();

        const result = validateSignatureJson(data);
        // These should pass - message has non-whitespace content
        expect(result.valid).toBe(true);
      });

      // Strings that are only whitespace should fail (they trim to empty)
      const whitespaceOnlyStrings = [
        '\t\n\r ',
        '   ',
        '\n\n\n',
      ];

      whitespaceOnlyStrings.forEach(str => {
        const data = {
          address: 'test',
          message: str,
          signature: 'test',
        };

        const result = validateSignatureJson(data);
        // Should fail - message is effectively empty after trim
        expect(result.valid).toBe(false);
        expect(result.error).toContain('empty');
      });
    });
  });

  describe('performance', () => {
    it('should validate quickly even with edge case inputs', () => {
      const start = Date.now();

      // Run many validations
      for (let i = 0; i < 1000; i++) {
        validateSignatureJson({
          address: 'a'.repeat(SIGNATURE_JSON_LIMITS.MAX_ADDRESS_LENGTH),
          message: 'm'.repeat(SIGNATURE_JSON_LIMITS.MAX_MESSAGE_LENGTH),
          signature: 's'.repeat(SIGNATURE_JSON_LIMITS.MAX_SIGNATURE_LENGTH),
          timestamp: 't'.repeat(SIGNATURE_JSON_LIMITS.MAX_TIMESTAMP_LENGTH),
        });
      }

      const elapsed = Date.now() - start;
      // Should complete 1000 validations in under 1 second
      expect(elapsed).toBeLessThan(1000);
    });

    it('should reject oversized input quickly', () => {
      const hugeString = 'x'.repeat(SIGNATURE_JSON_LIMITS.MAX_FILE_SIZE + 1000);

      const start = Date.now();
      const result = validateJsonText(hugeString);
      const elapsed = Date.now() - start;

      expect(result.valid).toBe(false);
      expect(elapsed).toBeLessThan(10); // Should be nearly instant
    });
  });
});
