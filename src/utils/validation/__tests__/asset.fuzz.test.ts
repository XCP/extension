/**
 * Fuzz tests for asset validation functions
 * Tests REAL validation logic with no mocks
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateAssetName,
  validateParentAsset,
  validateSubasset,
  isNumericAsset,
  isNamedAsset
} from '../asset';

describe('Asset Validation Fuzz Tests', () => {
  describe('validateParentAsset', () => {
    it('should handle arbitrary strings without crashing', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            expect(() => {
              validateParentAsset(input);
            }).not.toThrow();
            
            const result = validateParentAsset(input);
            expect(result).toHaveProperty('isValid');
            expect(typeof result.isValid).toBe('boolean');
            
            if (!result.isValid) {
              expect(result).toHaveProperty('error');
              expect(typeof result.error).toBe('string');
            }
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should reject reserved asset names', () => {
      const reserved = ['BTC', 'XCP'];
      reserved.forEach(name => {
        const result = validateParentAsset(name);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('reserved');
      });
    });

    it('should validate numeric assets correctly', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 0n, max: BigInt(2) ** BigInt(64) }),
          (num) => {
            const assetName = 'A' + num.toString();
            const result = validateParentAsset(assetName);
            
            const min = BigInt(26) ** BigInt(12);
            const max = BigInt(256) ** BigInt(8) - BigInt(1);
            const shouldBeValid = num >= min && num <= max;
            
            expect(result.isValid).toBe(shouldBeValid);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate named assets correctly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (input) => {
            // Convert to uppercase to test
            const upperInput = input.toUpperCase();
            const result = validateParentAsset(upperInput);
            
            // Check if it matches named asset pattern
            const isValidNamed = /^[B-Z][A-Z]{3,11}$/.test(upperInput);
            
            if (isValidNamed) {
              expect(result.isValid).toBe(true);
            } else if (upperInput === 'BTC' || upperInput === 'XCP') {
              expect(result.isValid).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle injection attempts safely', () => {
      const injections = [
        '<script>alert(1)</script>',
        'javascript:alert(1)',
        '../../etc/passwd',
        'DROP TABLE assets',
        '\x00\x01\x02',
        '${process.env.SECRET}',
        '{{template}}'
      ];

      injections.forEach(injection => {
        expect(() => {
          const result = validateParentAsset(injection);
          expect(result.isValid).toBe(false);
        }).not.toThrow();
      });
    });

    it('should handle Unicode and special characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (input) => {
            expect(() => {
              const result = validateParentAsset(input);
              // Unicode characters should make it invalid
              if (/[^\x00-\x7F]/.test(input)) {
                expect(result.isValid).toBe(false);
              }
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('validateSubasset', () => {
    it('should handle arbitrary parent.child combinations', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string(),
            fc.string()
          ),
          ([parent, child]) => {
            const fullName = `${parent}.${child}`;
            
            expect(() => {
              validateSubasset(fullName);
            }).not.toThrow();
            
            const result = validateSubasset(fullName);
            expect(result).toHaveProperty('isValid');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate parent asset in subassets', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.constantFrom('TEST', 'VALID', 'BURN'),
            fc.string({ minLength: 1, maxLength: 50 })
          ),
          ([parent, child]) => {
            const fullName = `${parent}.${child}`;
            const result = validateSubasset(fullName);
            
            // Parent must be valid
            const parentResult = validateParentAsset(parent);
            
            if (!parentResult.isValid) {
              expect(result.isValid).toBe(false);
            }
            
            // Child must match pattern
            if (!/^[a-zA-Z0-9.\-_@!]+$/.test(child)) {
              expect(result.isValid).toBe(false);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should enforce child name constraints', () => {
      const validParent = 'TEST';
      
      // Test various child patterns
      const testCases = [
        { child: 'valid', shouldBeValid: true },
        { child: 'VALID123', shouldBeValid: true },
        { child: 'with_underscore', shouldBeValid: true },
        { child: 'with-dash', shouldBeValid: true },
        { child: 'with.dot', shouldBeValid: true },
        { child: 'with@at', shouldBeValid: true },
        { child: 'with!exclaim', shouldBeValid: true },
        { child: 'with space', shouldBeValid: false },
        { child: 'with#hash', shouldBeValid: false },
        { child: '', shouldBeValid: false },
        { child: 'a'.repeat(251), shouldBeValid: false }
      ];

      testCases.forEach(({ child, shouldBeValid }) => {
        const result = validateSubasset(`${validParent}.${child}`);
        expect(result.isValid).toBe(shouldBeValid);
      });
    });

    it('should reject invalid formats', () => {
      const invalidFormats = [
        'NODOT',
        'TOO.MANY.DOTS',
        '.STARTDOT',
        'ENDDOT.',
        'MIDDLE..DOT',
        ''
      ];

      invalidFormats.forEach(format => {
        const result = validateSubasset(format);
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('validateAssetName integration', () => {
    it('should switch validation based on isSubasset flag', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string(),
            fc.boolean()
          ),
          ([name, isSubasset]) => {
            const result = validateAssetName(name, isSubasset);
            
            expect(result).toHaveProperty('isValid');
            expect(typeof result.isValid).toBe('boolean');
            
            // Verify it calls the right validator
            if (isSubasset && name.includes('.')) {
              const directResult = validateSubasset(name);
              expect(result.isValid).toBe(directResult.isValid);
            } else if (!isSubasset && !name.includes('.')) {
              const directResult = validateParentAsset(name);
              expect(result.isValid).toBe(directResult.isValid);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('isNumericAsset', () => {
    it('should correctly identify numeric assets', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 0n, max: BigInt(2) ** BigInt(64) }),
          (num) => {
            const assetName = 'A' + num.toString();
            const result = isNumericAsset(assetName);
            
            const min = BigInt(26) ** BigInt(12);
            const max = BigInt(256) ** BigInt(8) - BigInt(1);
            const shouldBeValid = num >= min && num <= max;
            
            expect(result).toBe(shouldBeValid);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should reject non-numeric patterns', () => {
      const nonNumeric = [
        'TEST',
        'A',
        'Anumber',
        'A12.34',
        'B123456789',
        ''
      ];

      nonNumeric.forEach(name => {
        expect(isNumericAsset(name)).toBe(false);
      });
    });
  });

  describe('isNamedAsset', () => {
    it('should correctly identify named assets', () => {
      const valid = ['TEST', 'BURN', 'PEPECASH', 'FLDC'];
      const invalid = ['A123', 'BTC', 'XCP', 'test', 'TOO_LONG_NAME', 'SHT'];

      valid.forEach(name => {
        expect(isNamedAsset(name)).toBe(true);
      });

      invalid.forEach(name => {
        expect(isNamedAsset(name)).toBe(false);
      });
    });

    it('should enforce length constraints', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          (length) => {
            const name = 'B' + 'A'.repeat(length - 1);
            const result = isNamedAsset(name);
            
            // Valid if 4-12 chars total
            const shouldBeValid = length >= 4 && length <= 12;
            expect(result).toBe(shouldBeValid);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Edge cases and consistency', () => {
    it('should handle empty and whitespace inputs', () => {
      const edgeCases = ['', ' ', '\t', '\n', '   '];
      
      edgeCases.forEach(input => {
        expect(validateParentAsset(input).isValid).toBe(false);
        expect(validateSubasset(input).isValid).toBe(false);
        expect(validateAssetName(input, false).isValid).toBe(false);
        expect(validateAssetName(input, true).isValid).toBe(false);
      });
    });

    it('should maintain consistency across repeated validations', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            // Same input should always give same result
            const result1 = validateParentAsset(input);
            const result2 = validateParentAsset(input);
            
            expect(result1.isValid).toBe(result2.isValid);
            if (result1.error) {
              expect(result1.error).toBe(result2.error);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle extremely long inputs without performance issues', () => {
      const longString = 'A'.repeat(10000);
      
      const start = Date.now();
      validateParentAsset(longString);
      validateSubasset(longString);
      const elapsed = Date.now() - start;
      
      // Should complete quickly even with long input
      expect(elapsed).toBeLessThan(100);
    });
  });
});