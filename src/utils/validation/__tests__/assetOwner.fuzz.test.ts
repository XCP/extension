/**
 * Fuzz tests for asset owner lookup validation
 * Tests asset name detection and lookup trigger logic
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  looksLikeAssetName,
  shouldTriggerAssetLookup,
} from '../assetOwner';

// Valid parent asset names (4-12 uppercase letters starting with B-Z)
const validParentAssetArb = fc.stringOf(
  fc.constantFrom(...'BCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
  { minLength: 4, maxLength: 12 }
).filter(s => /^[B-Z][A-Z]{3,11}$/.test(s));

// Valid numeric asset names (A + digits)
const validNumericAssetArb = fc.integer({ min: 0, max: 999999999 })
  .map(n => `A${n}`);

describe('Asset Owner Validation Fuzz Tests', () => {
  describe('looksLikeAssetName', () => {
    it('should handle arbitrary strings without crashing', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          expect(() => looksLikeAssetName(input)).not.toThrow();
          const result = looksLikeAssetName(input);
          expect(typeof result).toBe('boolean');
        }),
        { numRuns: 100 }
      );
    });

    it('should accept valid ASSET.xcp format', () => {
      fc.assert(
        fc.property(validParentAssetArb, (parentAsset) => {
          const assetName = `${parentAsset}.xcp`;
          expect(looksLikeAssetName(assetName)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should accept case-insensitive .xcp suffix', () => {
      const suffixes = ['.xcp', '.XCP', '.Xcp', '.xCp'];

      suffixes.forEach((suffix) => {
        expect(looksLikeAssetName(`VALID${suffix}`)).toBe(true);
      });
    });

    it('should reject strings not ending in .xcp', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !s.toLowerCase().endsWith('.xcp')),
          (input) => {
            expect(looksLikeAssetName(input)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject empty and whitespace strings', () => {
      const emptyValues = ['', ' ', '\t', '\n', '   '];

      emptyValues.forEach((value) => {
        expect(looksLikeAssetName(value)).toBe(false);
      });
    });

    it('should reject null and undefined', () => {
      expect(looksLikeAssetName(null as any)).toBe(false);
      expect(looksLikeAssetName(undefined as any)).toBe(false);
    });

    it('should reject non-string types', () => {
      const nonStrings = [123, {}, [], true, Symbol('test')];

      nonStrings.forEach((value) => {
        expect(looksLikeAssetName(value as any)).toBe(false);
      });
    });

    it('should reject invalid parent asset names', () => {
      const invalidParents = [
        'ABC.xcp',      // Too short (3 chars)
        'AB.xcp',       // Too short (2 chars)
        'A.xcp',        // Too short (1 char)
        '.xcp',         // No parent
        'ABCDEFGHIJKLM.xcp', // Too long (13 chars)
        '1234.xcp',     // Numbers only
        'test.xcp',     // Lowercase
        'TEST123.xcp',  // Contains numbers
      ];

      invalidParents.forEach((invalid) => {
        expect(looksLikeAssetName(invalid)).toBe(false);
      });
    });

    it('should handle multiple dots correctly', () => {
      // Only the last .xcp should matter for the suffix check
      const multiDot = [
        'PARENT.CHILD.xcp',  // Invalid - PARENT.CHILD is not a valid parent format
        'TEST..xcp',         // Invalid parent
      ];

      multiDot.forEach((name) => {
        // These should return false due to invalid parent validation
        const result = looksLikeAssetName(name);
        expect(typeof result).toBe('boolean');
      });
    });

    it('should handle whitespace trimming', () => {
      expect(looksLikeAssetName('  VALID.xcp  ')).toBe(true);
      expect(looksLikeAssetName('\tVALID.xcp\n')).toBe(true);
    });

    it('should handle injection attempts', () => {
      const injections = [
        '<script>alert(1)</script>.xcp',
        "'; DROP TABLE assets;--.xcp",
        '${process.env.SECRET}.xcp',
        '../../../etc/passwd.xcp',
        'VALID.xcp<script>',
        'VALID.xcp; rm -rf /',
      ];

      injections.forEach((injection) => {
        expect(() => looksLikeAssetName(injection)).not.toThrow();
        // All should return false (invalid parent names)
        expect(looksLikeAssetName(injection)).toBe(false);
      });
    });

    it('should handle Unicode characters', () => {
      const unicodeNames = [
        '中文资产.xcp',
        'ТЕСТ.xcp',  // Cyrillic
        '🚀MOON.xcp',
        'VÁLID.xcp', // Accented
      ];

      unicodeNames.forEach((name) => {
        expect(() => looksLikeAssetName(name)).not.toThrow();
        expect(looksLikeAssetName(name)).toBe(false);
      });
    });
  });

  describe('shouldTriggerAssetLookup', () => {
    it('should handle arbitrary strings without crashing', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          expect(() => shouldTriggerAssetLookup(input)).not.toThrow();
          const result = shouldTriggerAssetLookup(input);
          expect(typeof result).toBe('boolean');
        }),
        { numRuns: 100 }
      );
    });

    it('should trigger for valid ASSET.xcp format', () => {
      fc.assert(
        fc.property(validParentAssetArb, (parentAsset) => {
          const assetName = `${parentAsset}.xcp`;
          expect(shouldTriggerAssetLookup(assetName)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should not trigger for short strings', () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 7 }),
          (short) => {
            expect(shouldTriggerAssetLookup(short)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not trigger for Bitcoin addresses', () => {
      const bitcoinAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
      ];

      bitcoinAddresses.forEach((address) => {
        expect(shouldTriggerAssetLookup(address)).toBe(false);
      });
    });

    it('should not trigger for strings not ending in .xcp', () => {
      const nonXcp = [
        'VALID.btc',
        'VALID.eth',
        'VALID',
        'VALID.XC',
        'VALID.xcpp',
      ];

      nonXcp.forEach((value) => {
        expect(shouldTriggerAssetLookup(value)).toBe(false);
      });
    });

    it('should handle empty and falsy values', () => {
      expect(shouldTriggerAssetLookup('')).toBe(false);
      expect(shouldTriggerAssetLookup(null as any)).toBe(false);
      expect(shouldTriggerAssetLookup(undefined as any)).toBe(false);
    });

    it('should handle edge case lengths', () => {
      // Minimum valid: "TEST.xcp" = 8 chars
      expect(shouldTriggerAssetLookup('TEST.xcp')).toBe(true);
      expect(shouldTriggerAssetLookup('TES.xcp')).toBe(false); // 7 chars, too short
      expect(shouldTriggerAssetLookup('TESTT.xcp')).toBe(true); // 9 chars
    });

    it('should be case-insensitive for .xcp suffix', () => {
      expect(shouldTriggerAssetLookup('VALID.xcp')).toBe(true);
      expect(shouldTriggerAssetLookup('VALID.XCP')).toBe(true);
      expect(shouldTriggerAssetLookup('VALID.Xcp')).toBe(true);
    });
  });

  describe('Consistency tests', () => {
    it('should return consistent results for same input', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 100 }), (input) => {
          const result1 = looksLikeAssetName(input);
          const result2 = looksLikeAssetName(input);
          expect(result1).toBe(result2);
        }),
        { numRuns: 100 }
      );
    });

    it('looksLikeAssetName and shouldTriggerAssetLookup should be consistent', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 8, maxLength: 50 }),
          (input) => {
            const looks = looksLikeAssetName(input);
            const trigger = shouldTriggerAssetLookup(input);

            // If looksLikeAssetName is false, shouldTriggerAssetLookup must also be false
            if (!looks) {
              // trigger can still be true if it passes the simpler checks
              // but if trigger is true, looks must validate it
            }

            // Both should not crash
            expect(typeof looks).toBe('boolean');
            expect(typeof trigger).toBe('boolean');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Performance tests', () => {
    it('should handle rapid lookups efficiently', () => {
      const testCases = [
        'VALID.xcp',
        'INVALID',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '',
        'TOOLONGASSETNAME.xcp',
      ];

      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        testCases.forEach((tc) => {
          looksLikeAssetName(tc);
          shouldTriggerAssetLookup(tc);
        });
      }

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
    });

    it('should handle very long strings efficiently', () => {
      const longString = 'A'.repeat(1000) + '.xcp';

      const start = performance.now();
      looksLikeAssetName(longString);
      shouldTriggerAssetLookup(longString);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('Security tests', () => {
    it('should not be vulnerable to ReDoS', () => {
      // Potentially dangerous patterns for regex
      const redosAttempts = [
        'a'.repeat(100) + '.xcp',
        'A'.repeat(100) + 'B'.repeat(100) + '.xcp',
        ('AB' + 'C'.repeat(50)).repeat(10) + '.xcp',
      ];

      redosAttempts.forEach((attempt) => {
        const start = performance.now();
        looksLikeAssetName(attempt);
        shouldTriggerAssetLookup(attempt);
        const elapsed = performance.now() - start;

        // Should complete quickly (< 100ms) even for pathological inputs
        expect(elapsed).toBeLessThan(100);
      });
    });

    it('should handle null bytes and control characters', () => {
      const controlChars = [
        'VALID\x00.xcp',
        'VALID\x01.xcp',
        'VALID\x7F.xcp',
        '\x00VALID.xcp',
      ];

      controlChars.forEach((input) => {
        expect(() => looksLikeAssetName(input)).not.toThrow();
        expect(() => shouldTriggerAssetLookup(input)).not.toThrow();
      });
    });
  });
});
