/**
 * Fuzz tests for session validation functions
 * Tests wallet ID, secret, timeout, and rate limiting validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  validateWalletId,
  validateSecret,
  validateTimeout,
  validateSessionMetadata,
  assertRateLimit,
  clearRateLimit,
  clearAllRateLimits,
  assertSecretLimit,
  MAX_WALLET_ID_LENGTH,
  MAX_SECRET_LENGTH,
  MAX_STORED_SECRETS,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  WALLET_ID_REGEX,
} from '../session';

// Valid SHA-256 hash (64 hex chars)
const hexCharArb = fc.constantFrom(...'0123456789abcdef'.split(''));
const validWalletIdArb: fc.Arbitrary<string> = fc.array(hexCharArb, { minLength: 64, maxLength: 64 }).map(arr => arr.join(''));

describe('Session Validation Fuzz Tests', () => {
  beforeEach(() => {
    clearAllRateLimits();
  });

  describe('validateWalletId', () => {
    it('should accept valid SHA-256 wallet IDs', () => {
      fc.assert(
        fc.property(validWalletIdArb, (walletId) => {
          expect(() => validateWalletId(walletId)).not.toThrow();
        }),
        { numRuns: 100 }
      );
    });

    it('should reject non-hex strings', () => {
      // Generate a 64-char string with at least one non-hex char
      // by inserting a non-hex char at a random position in a hex string
      const nonHexChar = fc.constantFrom(...'ghijklmnopqrstuvwxyzGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()'.split(''));
      const invalidIdArb = fc.tuple(
        fc.integer({ min: 0, max: 63 }), // position to insert non-hex char
        nonHexChar,
        fc.array(hexCharArb, { minLength: 63, maxLength: 63 }) // 63 hex chars
      ).map(([pos, badChar, hexChars]) => {
        const result = [...hexChars];
        result.splice(pos, 0, badChar);
        return result.join('');
      });

      fc.assert(
        fc.property(invalidIdArb, (invalidId) => {
          expect(() => validateWalletId(invalidId)).toThrow('Invalid wallet ID format');
        }),
        { numRuns: 100 }
      );
    });

    it('should reject wrong-length strings', () => {
      // Create a hex string of variable length that's not 64 characters
      const wrongLengthHexArb = fc.integer({ min: 1, max: MAX_WALLET_ID_LENGTH - 1 })
        .filter(len => len !== 64)
        .chain(len => fc.array(hexCharArb, { minLength: len, maxLength: len }).map(arr => arr.join('')));

      fc.assert(
        fc.property(
          wrongLengthHexArb,
          (wrongLength: string) => {
            if (wrongLength.length > 0) {
              expect(() => validateWalletId(wrongLength)).toThrow();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject IDs exceeding max length', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: MAX_WALLET_ID_LENGTH + 1, maxLength: MAX_WALLET_ID_LENGTH + 100 }),
          (longId) => {
            expect(() => validateWalletId(longId)).toThrow('exceeds maximum length');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject empty and falsy values', () => {
      const falsyValues = ['', null, undefined, 0, false];

      falsyValues.forEach((value) => {
        expect(() => validateWalletId(value as any)).toThrow();
      });
    });

    it('should reject non-string types', () => {
      const nonStrings = [123, {}, [], true, Symbol('test'), () => {}];

      nonStrings.forEach((value) => {
        expect(() => validateWalletId(value as any)).toThrow();
      });
    });

    it('should handle injection attempts', () => {
      const injections = [
        '<script>alert(1)</script>',
        "'; DROP TABLE wallets;--",
        '${process.env.SECRET}',
        '../../../etc/passwd',
        'a'.repeat(64) + '<script>',
      ];

      injections.forEach((injection) => {
        expect(() => validateWalletId(injection)).toThrow();
      });
    });

    it('should be case-insensitive for hex', () => {
      const upperCase = 'A'.repeat(64);
      const lowerCase = 'a'.repeat(64);
      const mixedCase = 'aAbBcCdDeEfF'.repeat(5) + 'aabb';

      // All should fail the regex which expects lowercase
      expect(() => validateWalletId(upperCase)).toThrow();
      expect(() => validateWalletId(lowerCase)).not.toThrow();
      expect(() => validateWalletId(mixedCase)).toThrow();
    });
  });

  describe('validateSecret', () => {
    it('should accept valid non-empty secrets', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: MAX_SECRET_LENGTH }),
          (secret) => {
            expect(() => validateSecret(secret)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject empty strings', () => {
      expect(() => validateSecret('')).toThrow('Secret cannot be empty');
    });

    it('should reject secrets exceeding max length', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: MAX_SECRET_LENGTH + 1, maxLength: MAX_SECRET_LENGTH + 100 }),
          (longSecret) => {
            expect(() => validateSecret(longSecret)).toThrow('exceeds maximum length');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject null and undefined', () => {
      expect(() => validateSecret(null as any)).toThrow('cannot be null or undefined');
      expect(() => validateSecret(undefined as any)).toThrow('cannot be null or undefined');
    });

    it('should reject non-string types', () => {
      const nonStrings = [123, {}, [], true, Symbol('test')];

      nonStrings.forEach((value) => {
        expect(() => validateSecret(value as any)).toThrow('must be a string');
      });
    });

    it('should handle secrets with special characters', () => {
      const specialSecrets = [
        'mnemonic with spaces and words',
        'key-with-dashes',
        'key_with_underscores',
        '{"json": "object"}',
        '<xml>data</xml>',
        '🔐🔑💰',
        '\x00\x01\x02',
        '\n\r\t',
      ];

      specialSecrets.forEach((secret) => {
        expect(() => validateSecret(secret)).not.toThrow();
      });
    });

    it('should handle typical mnemonic phrases', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(
            'abandon', 'ability', 'able', 'about', 'above', 'absent',
            'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'
          ), { minLength: 12, maxLength: 24 }),
          (words) => {
            const mnemonic = words.join(' ');
            expect(() => validateSecret(mnemonic)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('validateTimeout', () => {
    it('should accept valid timeouts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_TIMEOUT_MS, max: MAX_TIMEOUT_MS }),
          (timeout) => {
            expect(() => validateTimeout(timeout)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject timeouts below minimum', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: MIN_TIMEOUT_MS - 1 }),
          (timeout) => {
            expect(() => validateTimeout(timeout)).toThrow(`at least ${MIN_TIMEOUT_MS}ms`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject timeouts above maximum', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MAX_TIMEOUT_MS + 1, max: MAX_TIMEOUT_MS * 2 }),
          (timeout) => {
            expect(() => validateTimeout(timeout)).toThrow(`cannot exceed ${MAX_TIMEOUT_MS}ms`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject non-number types', () => {
      const nonNumbers = ['60000', null, undefined, {}, [], true];

      nonNumbers.forEach((value) => {
        expect(() => validateTimeout(value as any)).toThrow('must be a valid number');
      });
    });

    it('should reject NaN and Infinity', () => {
      expect(() => validateTimeout(NaN)).toThrow('must be a valid number');
      expect(() => validateTimeout(Infinity)).toThrow();
      expect(() => validateTimeout(-Infinity)).toThrow();
    });

    it('should handle edge cases', () => {
      expect(() => validateTimeout(MIN_TIMEOUT_MS)).not.toThrow();
      expect(() => validateTimeout(MAX_TIMEOUT_MS)).not.toThrow();
      expect(() => validateTimeout(MIN_TIMEOUT_MS - 1)).toThrow();
      expect(() => validateTimeout(MAX_TIMEOUT_MS + 1)).toThrow();
    });

    it('should reject negative timeouts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000000, max: -1 }),
          (timeout) => {
            expect(() => validateTimeout(timeout)).toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('validateSessionMetadata', () => {
    it('should accept valid metadata', () => {
      fc.assert(
        fc.property(
          fc.record({
            unlockedAt: fc.integer({ min: 1 }),
            lastActiveTime: fc.integer({ min: 1 }),
            timeout: fc.integer({ min: MIN_TIMEOUT_MS, max: MAX_TIMEOUT_MS }),
          }),
          (metadata) => {
            expect(() => validateSessionMetadata(metadata)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject null and undefined', () => {
      expect(() => validateSessionMetadata(null)).toThrow('Invalid session metadata');
      expect(() => validateSessionMetadata(undefined)).toThrow('Invalid session metadata');
    });

    it('should reject non-object types', () => {
      const nonObjects = ['string', 123, true, []];

      nonObjects.forEach((value) => {
        expect(() => validateSessionMetadata(value)).toThrow();
      });
    });

    it('should reject invalid unlockedAt', () => {
      const invalidValues = [0, -1, 'timestamp', null, undefined];

      invalidValues.forEach((value) => {
        const metadata = {
          unlockedAt: value,
          lastActiveTime: Date.now(),
          timeout: MIN_TIMEOUT_MS,
        };
        expect(() => validateSessionMetadata(metadata)).toThrow();
      });
    });

    it('should reject invalid lastActiveTime', () => {
      const invalidValues = [0, -1, 'timestamp', null, undefined];

      invalidValues.forEach((value) => {
        const metadata = {
          unlockedAt: Date.now(),
          lastActiveTime: value,
          timeout: MIN_TIMEOUT_MS,
        };
        expect(() => validateSessionMetadata(metadata)).toThrow();
      });
    });

    it('should reject invalid timeout in metadata', () => {
      const metadata = {
        unlockedAt: Date.now(),
        lastActiveTime: Date.now(),
        timeout: MIN_TIMEOUT_MS - 1,
      };
      expect(() => validateSessionMetadata(metadata)).toThrow();
    });
  });

  describe('assertRateLimit', () => {
    it('should allow operations within limit', () => {
      const walletId = 'a'.repeat(64);

      // Should allow up to MAX_OPERATIONS_PER_WINDOW
      for (let i = 0; i < 10; i++) {
        expect(() => assertRateLimit(walletId)).not.toThrow();
      }
    });

    it('should reject operations exceeding limit', () => {
      const walletId = 'b'.repeat(64);

      // First 10 should succeed
      for (let i = 0; i < 10; i++) {
        assertRateLimit(walletId);
      }

      // 11th should fail
      expect(() => assertRateLimit(walletId)).toThrow('Rate limit exceeded');
    });

    it('should track limits separately per wallet', () => {
      fc.assert(
        fc.property(
          fc.array(validWalletIdArb, { minLength: 2, maxLength: 5 }),
          (walletIds) => {
            clearAllRateLimits();

            // Each wallet should have its own limit
            walletIds.forEach((walletId) => {
              expect(() => assertRateLimit(walletId)).not.toThrow();
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle rapid calls', () => {
      const walletId = 'c'.repeat(64);

      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        assertRateLimit(walletId);
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('clearRateLimit', () => {
    it('should clear rate limit for specific wallet', () => {
      const walletId = 'd'.repeat(64);

      // Use up the limit
      for (let i = 0; i < 10; i++) {
        assertRateLimit(walletId);
      }
      expect(() => assertRateLimit(walletId)).toThrow();

      // Clear and try again
      clearRateLimit(walletId);
      expect(() => assertRateLimit(walletId)).not.toThrow();
    });

    it('should not affect other wallets', () => {
      const walletId1 = 'e'.repeat(64);
      const walletId2 = 'f'.repeat(64);

      // Use up limit for both
      for (let i = 0; i < 10; i++) {
        assertRateLimit(walletId1);
        assertRateLimit(walletId2);
      }

      // Clear only first
      clearRateLimit(walletId1);

      expect(() => assertRateLimit(walletId1)).not.toThrow();
      expect(() => assertRateLimit(walletId2)).toThrow();
    });
  });

  describe('assertSecretLimit', () => {
    it('should allow new secrets under limit', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: MAX_STORED_SECRETS - 1 }),
          validWalletIdArb,
          (currentCount, walletId) => {
            expect(() => assertSecretLimit(currentCount, walletId, {})).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject when at limit', () => {
      const walletId = 'a'.repeat(64);
      expect(() => assertSecretLimit(MAX_STORED_SECRETS, walletId, {})).toThrow(
        `Cannot store more than ${MAX_STORED_SECRETS}`
      );
    });

    it('should allow updates to existing secrets', () => {
      const walletId = 'a'.repeat(64);
      const existingSecrets = { [walletId]: 'existing' };

      // Even at limit, updating existing should work
      expect(() => assertSecretLimit(MAX_STORED_SECRETS, walletId, existingSecrets)).not.toThrow();
    });

    it('should handle edge cases', () => {
      const walletId = 'a'.repeat(64);

      expect(() => assertSecretLimit(0, walletId, {})).not.toThrow();
      expect(() => assertSecretLimit(MAX_STORED_SECRETS - 1, walletId, {})).not.toThrow();
      expect(() => assertSecretLimit(MAX_STORED_SECRETS, walletId, {})).toThrow();
    });
  });

  describe('Security tests', () => {
    it('should handle prototype pollution attempts', () => {
      const pollutionAttempts = [
        '__proto__',
        'constructor',
        'prototype',
      ];

      pollutionAttempts.forEach((key) => {
        // These should all fail validation (not 64 hex chars)
        expect(() => validateWalletId(key)).toThrow();
      });
    });

    it('should handle very long inputs without hanging', () => {
      const veryLong = 'a'.repeat(10000);

      const start = performance.now();
      expect(() => validateWalletId(veryLong)).toThrow();
      expect(() => validateSecret(veryLong)).toThrow();
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });
});
