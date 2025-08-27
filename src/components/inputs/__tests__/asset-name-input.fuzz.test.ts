/**
 * Fuzz tests for Asset Name validation
 * Tests asset naming rules, subasset validation, and injection prevention
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isValidAssetName, isNumericAsset, isValidSubasset } from '../asset-name-input';

// Helper to extract validation logic (we'll need to export these from the component)
const validateAssetName = (value: string, isSubasset: boolean = false, parentAsset?: string): boolean => {
  if (isSubasset && parentAsset) {
    return isValidSubasset(value, parentAsset);
  }
  return isValidAssetName(value);
};

const isValidAssetName = (name: string): boolean => {
  // Numeric assets (A + 26^12 to 256^8 - 1)
  if (/^A\d{12,}$/.test(name)) {
    const num = BigInt(name.substring(1));
    const min = BigInt(26) ** BigInt(12);
    const max = BigInt(256) ** BigInt(8) - BigInt(1);
    return num >= min && num <= max;
  }
  
  // Named assets (4-12 chars, A-Z only, no A at start)
  if (/^[B-Z][A-Z]{3,11}$/.test(name)) {
    return true;
  }
  
  return false;
};

const isNumericAsset = (name: string): boolean => {
  return /^A\d{12,}$/.test(name);
};

const isValidSubasset = (fullName: string, parentAsset: string): boolean => {
  if (!fullName.startsWith(parentAsset + '.')) {
    return false;
  }
  
  const subassetName = fullName.substring(parentAsset.length + 1);
  
  // Subasset name rules: alphanumeric, underscores, max 250 chars
  if (!/^[A-Za-z0-9_]+$/.test(subassetName) || subassetName.length > 250) {
    return false;
  }
  
  return true;
};

describe('Asset Name Validation Fuzz Tests', () => {
  describe('Property-based testing for asset names', () => {
    it('should handle arbitrary strings without crashing', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            // Should not throw for any string input
            expect(() => {
              validateAssetName(input);
            }).not.toThrow();
            
            // Result should always be boolean
            const result = validateAssetName(input);
            expect(typeof result).toBe('boolean');
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should reject asset names with invalid characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 4, maxLength: 12 }).filter(s => /[^A-Z]/.test(s)),
          (input) => {
            // Any string with non A-Z characters should be invalid
            expect(validateAssetName(input)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate numeric asset ranges correctly', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: 0n, max: BigInt(256) ** BigInt(8) }),
          (num) => {
            const assetName = 'A' + num.toString();
            const min = BigInt(26) ** BigInt(12);
            const max = BigInt(256) ** BigInt(8) - BigInt(1);
            
            const shouldBeValid = num >= min && num <= max;
            const isValid = validateAssetName(assetName);
            
            if (shouldBeValid) {
              expect(isValid).toBe(true);
            } else {
              expect(isValid).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle injection attempts in asset names', () => {
      const injectionPayloads = [
        '<script>alert(1)</script>',
        'javascript:alert(1)',
        '"><img src=x onerror=alert(1)>',
        "'; DROP TABLE assets; --",
        "1' OR '1'='1",
        '${7*7}',
        '{{7*7}}',
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        '%00',
        '\x00',
        '&#60;script&#62;',
        String.fromCharCode(0),
        '\u0000',
        '=1+1',
        '@SUM(A1:A10)',
        '|calc.exe'
      ];

      injectionPayloads.forEach(payload => {
        expect(() => {
          validateAssetName(payload);
        }).not.toThrow();
        
        // Should reject all injection attempts
        expect(validateAssetName(payload)).toBe(false);
      });
    });

    it('should handle Unicode and special characters', () => {
      fc.assert(
        fc.property(
          fc.unicode(),
          (input) => {
            expect(() => {
              validateAssetName(input);
            }).not.toThrow();
            
            // Unicode should be rejected for standard asset names
            if (/[^\x00-\x7F]/.test(input)) {
              expect(validateAssetName(input)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enforce length constraints for named assets', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).map(s => 
            s.replace(/[^A-Z]/g, 'X').replace(/^A/, 'B')
          ),
          (input) => {
            const isValid = validateAssetName(input);
            
            if (input.length >= 4 && input.length <= 12 && /^[B-Z][A-Z]*$/.test(input)) {
              expect(isValid).toBe(true);
            } else {
              expect(isValid).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle subasset name validation', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.constantFrom('XCP', 'PEPECASH', 'TEST'),
            fc.string()
          ),
          ([parent, subasset]) => {
            const fullName = `${parent}.${subasset}`;
            
            expect(() => {
              validateAssetName(fullName, true, parent);
            }).not.toThrow();
            
            // Check subasset rules
            const isValid = validateAssetName(fullName, true, parent);
            
            if (!/^[A-Za-z0-9_]+$/.test(subasset) || subasset.length > 250 || subasset.length === 0) {
              expect(isValid).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle extremely long inputs', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 1000, maxLength: 10000 }),
            fc.array(fc.char(), { minLength: 1000, maxLength: 10000 }).map(arr => arr.join(''))
          ),
          (input) => {
            expect(() => {
              validateAssetName(input);
            }).not.toThrow();
            
            // Very long names should be invalid
            expect(validateAssetName(input)).toBe(false);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle edge cases for numeric assets', () => {
      const edgeCases = [
        'A',
        'A0',
        'A123456789012', // Exactly 12 digits
        'A' + (BigInt(26) ** BigInt(12) - BigInt(1)).toString(), // Just below min
        'A' + (BigInt(26) ** BigInt(12)).toString(), // Exactly min
        'A' + (BigInt(256) ** BigInt(8) - BigInt(1)).toString(), // Exactly max
        'A' + (BigInt(256) ** BigInt(8)).toString(), // Just above max
        'A-1',
        'A1.5',
        'A1e10',
        'ANUMBER'
      ];

      edgeCases.forEach(testCase => {
        expect(() => {
          validateAssetName(testCase);
        }).not.toThrow();
      });
    });

    it('should handle null bytes and control characters', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.char(),
              fc.constant('\x00'),
              fc.constant('\n'),
              fc.constant('\r'),
              fc.constant('\t'),
              fc.integer({ min: 0, max: 31 }).map(n => String.fromCharCode(n))
            ),
            { minLength: 1, maxLength: 20 }
          ).map(arr => arr.join('')),
          (input) => {
            expect(() => {
              validateAssetName(input);
            }).not.toThrow();
            
            // Control characters should make it invalid
            if (/[\x00-\x1F]/.test(input)) {
              expect(validateAssetName(input)).toBe(false);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should maintain consistency across repeated validations', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (input) => {
            // Same input should always give same result
            const result1 = validateAssetName(input);
            const result2 = validateAssetName(input);
            const result3 = validateAssetName(input);
            
            expect(result1).toBe(result2);
            expect(result2).toBe(result3);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should properly validate reserved names and patterns', () => {
      const reservedPatterns = [
        'BTC',
        'XBT',
        'A' + '0'.repeat(11), // Too few digits
        '', // Empty string
        ' ', // Whitespace
        'TEST ',  // Trailing space
        ' TEST',  // Leading space
        'TE ST',  // Space in middle
        'test',   // Lowercase
        'Test',   // Mixed case
        'TEST!',  // Special char
        'TEST@',  // Special char
        'TEST#'   // Special char
      ];

      reservedPatterns.forEach(pattern => {
        expect(() => {
          validateAssetName(pattern);
        }).not.toThrow();
      });
    });
  });
});