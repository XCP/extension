import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateWalletId,
  validateSecret,
  validateTimeout,
  validateSessionMetadata,
  checkRateLimit,
  clearRateLimit,
  clearAllRateLimits,
  checkSecretLimit,
  MAX_WALLET_ID_LENGTH,
  MAX_SECRET_LENGTH,
  MAX_STORED_SECRETS,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  WALLET_ID_REGEX,
  RATE_LIMIT_WINDOW_MS,
  MAX_OPERATIONS_PER_WINDOW
} from '../session';

describe('Session Validation Utilities', () => {
  let mockDateNow: any;

  beforeEach(() => {
    // Clear all rate limits before each test
    clearAllRateLimits();

    // Mock Date.now for consistent time-based testing
    mockDateNow = vi.spyOn(Date, 'now');
    mockDateNow.mockReturnValue(1000000); // Fixed timestamp
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearAllRateLimits();
  });

  describe('validateWalletId', () => {
    describe('valid wallet IDs', () => {
      it('should accept valid SHA-256 hash format', () => {
        const validId = 'a'.repeat(64); // 64 hex characters
        expect(() => validateWalletId(validId)).not.toThrow();
      });

      it('should accept lowercase hex characters only', () => {
        const validId = 'ab1234567890abcdef' + '0'.repeat(46);
        expect(() => validateWalletId(validId)).not.toThrow();
      });

      it('should accept exactly 64 characters', () => {
        const validId = '1234567890abcdef'.repeat(4); // Exactly 64 chars
        expect(() => validateWalletId(validId)).not.toThrow();
      });
    });

    describe('invalid wallet IDs', () => {
      it('should reject null or undefined', () => {
        expect(() => validateWalletId(null as any)).toThrow('Wallet ID is required');
        expect(() => validateWalletId(undefined as any)).toThrow('Wallet ID is required');
        expect(() => validateWalletId('')).toThrow('Wallet ID is required');
      });

      it('should reject non-string types', () => {
        expect(() => validateWalletId(123 as any)).toThrow('Wallet ID must be a string');
        expect(() => validateWalletId({} as any)).toThrow('Wallet ID must be a string');
        expect(() => validateWalletId([] as any)).toThrow('Wallet ID must be a string');
        expect(() => validateWalletId(true as any)).toThrow('Wallet ID must be a string');
      });

      it('should reject strings exceeding max length', () => {
        const tooLong = 'a'.repeat(MAX_WALLET_ID_LENGTH + 1);
        expect(() => validateWalletId(tooLong)).toThrow(
          `Wallet ID exceeds maximum length of ${MAX_WALLET_ID_LENGTH}`
        );
      });

      it('should reject invalid hex characters', () => {
        const invalidChars = ['g', 'z', 'G', 'Z', '@', '#', '!', ' '];
        invalidChars.forEach(char => {
          const invalidId = 'a'.repeat(63) + char;
          expect(() => validateWalletId(invalidId)).toThrow('Invalid wallet ID format. Expected SHA-256 hash');
        });
      });

      it('should reject wrong length strings', () => {
        // Too short
        expect(() => validateWalletId('a'.repeat(63))).toThrow('Invalid wallet ID format. Expected SHA-256 hash');

        // Too long (but within max length limit)
        expect(() => validateWalletId('a'.repeat(65))).toThrow('Invalid wallet ID format. Expected SHA-256 hash');
      });

      it('should reject uppercase hex characters', () => {
        const invalidId = 'a'.repeat(63) + 'A';
        expect(() => validateWalletId(invalidId)).toThrow('Invalid wallet ID format. Expected SHA-256 hash');
      });

      it('should reject uppercase letters outside hex range', () => {
        const invalidId = 'a'.repeat(63) + 'G';
        expect(() => validateWalletId(invalidId)).toThrow('Invalid wallet ID format. Expected SHA-256 hash');
      });

      it('should reject special characters and spaces', () => {
        const specialChars = ['-', '_', '.', '/', '\\', ':', ';', '(', ')', '[', ']'];
        specialChars.forEach(char => {
          const invalidId = 'a'.repeat(63) + char;
          expect(() => validateWalletId(invalidId)).toThrow('Invalid wallet ID format. Expected SHA-256 hash');
        });
      });
    });

    describe('security attack scenarios', () => {
      it('should reject SQL injection attempts', () => {
        const sqlInjection = "'; DROP TABLE users; --" + 'a'.repeat(40);
        expect(() => validateWalletId(sqlInjection)).toThrow('Invalid wallet ID format. Expected SHA-256 hash');
      });

      it('should reject script injection attempts', () => {
        const scriptInjection = '<script>alert("xss")</script>' + 'a'.repeat(35);
        expect(() => validateWalletId(scriptInjection)).toThrow('Invalid wallet ID format. Expected SHA-256 hash');
      });

      it('should reject path traversal attempts', () => {
        const pathTraversal = '../../../etc/passwd' + 'a'.repeat(45);
        expect(() => validateWalletId(pathTraversal)).toThrow('Invalid wallet ID format. Expected SHA-256 hash');
      });

      it('should reject unicode and encoding attacks', () => {
        const unicodeAttack = '\u0000\u0001\u0002' + 'a'.repeat(61);
        expect(() => validateWalletId(unicodeAttack)).toThrow('Invalid wallet ID format. Expected SHA-256 hash');
      });
    });
  });

  describe('validateSecret', () => {
    describe('valid secrets', () => {
      it('should accept empty string as valid secret', () => {
        expect(() => validateSecret('')).not.toThrow();
      });

      it('should accept normal string secrets', () => {
        expect(() => validateSecret('my-secret-key')).not.toThrow();
        expect(() => validateSecret('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')).not.toThrow();
      });

      it('should accept secrets up to max length', () => {
        const maxLengthSecret = 'a'.repeat(MAX_SECRET_LENGTH);
        expect(() => validateSecret(maxLengthSecret)).not.toThrow();
      });

      it('should accept special characters in secrets', () => {
        expect(() => validateSecret('!@#$%^&*()_+-=[]{}|;:,.<>?')).not.toThrow();
      });
    });

    describe('invalid secrets', () => {
      it('should reject null or undefined', () => {
        expect(() => validateSecret(null as any)).toThrow('Secret cannot be null or undefined');
        expect(() => validateSecret(undefined as any)).toThrow('Secret cannot be null or undefined');
      });

      it('should reject non-string types', () => {
        expect(() => validateSecret(123 as any)).toThrow('Secret must be a string');
        expect(() => validateSecret({} as any)).toThrow('Secret must be a string');
        expect(() => validateSecret([] as any)).toThrow('Secret must be a string');
        expect(() => validateSecret(true as any)).toThrow('Secret must be a string');
      });

      it('should reject secrets exceeding max length', () => {
        const tooLong = 'a'.repeat(MAX_SECRET_LENGTH + 1);
        expect(() => validateSecret(tooLong)).toThrow(
          `Secret exceeds maximum length of ${MAX_SECRET_LENGTH}`
        );
      });
    });

    describe('security scenarios', () => {
      it('should handle very long malicious strings', () => {
        const maliciousLongString = 'A'.repeat(MAX_SECRET_LENGTH * 2);
        expect(() => validateSecret(maliciousLongString)).toThrow(
          `Secret exceeds maximum length of ${MAX_SECRET_LENGTH}`
        );
      });

      it('should handle binary data as strings', () => {
        const binaryData = '\x00\x01\x02\x03\xFF';
        expect(() => validateSecret(binaryData)).not.toThrow();
      });

      it('should handle unicode characters', () => {
        const unicodeSecret = '密码🔑🔐🗝️';
        expect(() => validateSecret(unicodeSecret)).not.toThrow();
      });
    });
  });

  describe('validateTimeout', () => {
    describe('valid timeouts', () => {
      it('should accept minimum timeout', () => {
        expect(() => validateTimeout(MIN_TIMEOUT_MS)).not.toThrow();
      });

      it('should accept maximum timeout', () => {
        expect(() => validateTimeout(MAX_TIMEOUT_MS)).not.toThrow();
      });

      it('should accept values within range', () => {
        expect(() => validateTimeout(300000)).not.toThrow(); // 5 minutes
        expect(() => validateTimeout(3600000)).not.toThrow(); // 1 hour
      });
    });

    describe('invalid timeouts', () => {
      it('should reject non-number types', () => {
        expect(() => validateTimeout('60000' as any)).toThrow('Timeout must be a valid number');
        expect(() => validateTimeout({} as any)).toThrow('Timeout must be a valid number');
        expect(() => validateTimeout(null as any)).toThrow('Timeout must be a valid number');
        expect(() => validateTimeout(undefined as any)).toThrow('Timeout must be a valid number');
      });

      it('should reject NaN', () => {
        expect(() => validateTimeout(NaN)).toThrow('Timeout must be a valid number');
      });

      it('should reject negative numbers', () => {
        expect(() => validateTimeout(-1)).toThrow(`Timeout must be at least ${MIN_TIMEOUT_MS}ms`);
        expect(() => validateTimeout(-60000)).toThrow(`Timeout must be at least ${MIN_TIMEOUT_MS}ms`);
      });

      it('should reject values below minimum', () => {
        expect(() => validateTimeout(MIN_TIMEOUT_MS - 1)).toThrow(
          `Timeout must be at least ${MIN_TIMEOUT_MS}ms`
        );
        expect(() => validateTimeout(59999)).toThrow(`Timeout must be at least ${MIN_TIMEOUT_MS}ms`);
      });

      it('should reject values above maximum', () => {
        expect(() => validateTimeout(MAX_TIMEOUT_MS + 1)).toThrow(
          `Timeout cannot exceed ${MAX_TIMEOUT_MS}ms`
        );
      });

      it('should reject infinity', () => {
        expect(() => validateTimeout(Infinity)).toThrow(`Timeout cannot exceed ${MAX_TIMEOUT_MS}ms`);
        expect(() => validateTimeout(-Infinity)).toThrow(`Timeout must be at least ${MIN_TIMEOUT_MS}ms`);
      });
    });

    describe('boundary conditions', () => {
      it('should handle edge of minimum boundary', () => {
        expect(() => validateTimeout(MIN_TIMEOUT_MS - 0.1)).toThrow();
        expect(() => validateTimeout(MIN_TIMEOUT_MS + 0.1)).not.toThrow();
      });

      it('should handle edge of maximum boundary', () => {
        expect(() => validateTimeout(MAX_TIMEOUT_MS - 0.1)).not.toThrow();
        expect(() => validateTimeout(MAX_TIMEOUT_MS + 0.1)).toThrow();
      });
    });
  });

  describe('validateSessionMetadata', () => {
    const validMetadata = {
      unlockedAt: 1000000,
      lastActiveTime: 1000000,
      timeout: 300000
    };

    describe('valid metadata', () => {
      it('should accept valid session metadata', () => {
        expect(() => validateSessionMetadata(validMetadata)).not.toThrow();
      });

      it('should accept metadata with additional properties', () => {
        const extendedMetadata = {
          ...validMetadata,
          customProperty: 'value',
          anotherProperty: 123
        };
        expect(() => validateSessionMetadata(extendedMetadata)).not.toThrow();
      });
    });

    describe('invalid metadata', () => {
      it('should reject null or undefined', () => {
        expect(() => validateSessionMetadata(null)).toThrow('Invalid session metadata');
        expect(() => validateSessionMetadata(undefined)).toThrow('Invalid session metadata');
      });

      it('should reject non-object types', () => {
        expect(() => validateSessionMetadata('string')).toThrow('Invalid session metadata');
        expect(() => validateSessionMetadata(123)).toThrow('Invalid session metadata');
        expect(() => validateSessionMetadata([])).toThrow('Invalid'); // Arrays fail at the property level
        expect(() => validateSessionMetadata(true)).toThrow('Invalid session metadata');
      });

      it('should reject missing unlockedAt', () => {
        const invalidMetadata = { ...validMetadata };
        delete invalidMetadata.unlockedAt;
        expect(() => validateSessionMetadata(invalidMetadata)).toThrow('Invalid unlockedAt timestamp');
      });

      it('should reject invalid unlockedAt types', () => {
        expect(() => validateSessionMetadata({
          ...validMetadata,
          unlockedAt: 'invalid'
        })).toThrow('Invalid unlockedAt timestamp');

        expect(() => validateSessionMetadata({
          ...validMetadata,
          unlockedAt: null
        })).toThrow('Invalid unlockedAt timestamp');
      });

      it('should reject non-positive unlockedAt', () => {
        expect(() => validateSessionMetadata({
          ...validMetadata,
          unlockedAt: 0
        })).toThrow('Invalid unlockedAt timestamp');

        expect(() => validateSessionMetadata({
          ...validMetadata,
          unlockedAt: -1
        })).toThrow('Invalid unlockedAt timestamp');
      });

      it('should reject missing lastActiveTime', () => {
        const invalidMetadata = { ...validMetadata };
        delete invalidMetadata.lastActiveTime;
        expect(() => validateSessionMetadata(invalidMetadata)).toThrow('Invalid lastActiveTime timestamp');
      });

      it('should reject invalid lastActiveTime types', () => {
        expect(() => validateSessionMetadata({
          ...validMetadata,
          lastActiveTime: 'invalid'
        })).toThrow('Invalid lastActiveTime timestamp');
      });

      it('should reject non-positive lastActiveTime', () => {
        expect(() => validateSessionMetadata({
          ...validMetadata,
          lastActiveTime: 0
        })).toThrow('Invalid lastActiveTime timestamp');
      });

      it('should validate timeout through validateTimeout', () => {
        expect(() => validateSessionMetadata({
          ...validMetadata,
          timeout: -1
        })).toThrow('Timeout must be at least');
      });
    });

    describe('security scenarios', () => {
      it('should handle prototype pollution attempts', () => {
        const maliciousMetadata = {
          ...validMetadata,
          '__proto__': { polluted: true },
          'constructor': { prototype: { polluted: true } }
        };
        expect(() => validateSessionMetadata(maliciousMetadata)).not.toThrow();
      });

      it('should handle very large timestamp values', () => {
        expect(() => validateSessionMetadata({
          ...validMetadata,
          unlockedAt: Number.MAX_SAFE_INTEGER
        })).not.toThrow();
      });
    });
  });

  describe('checkRateLimit', () => {
    const testWalletId = 'a'.repeat(64);

    describe('normal rate limiting', () => {
      it('should allow operations within limit', () => {
        // Should allow up to MAX_OPERATIONS_PER_WINDOW operations
        for (let i = 0; i < MAX_OPERATIONS_PER_WINDOW; i++) {
          expect(() => checkRateLimit(testWalletId)).not.toThrow();
        }
      });

      it('should block operations exceeding limit', () => {
        // Fill up to the limit
        for (let i = 0; i < MAX_OPERATIONS_PER_WINDOW; i++) {
          checkRateLimit(testWalletId);
        }

        // The next operation should be blocked
        expect(() => checkRateLimit(testWalletId)).toThrow('Rate limit exceeded for secret storage operations');
      });

      it('should track different wallets separately', () => {
        const wallet1 = 'a'.repeat(64);
        const wallet2 = 'b'.repeat(64);

        // Fill up wallet1 to the limit
        for (let i = 0; i < MAX_OPERATIONS_PER_WINDOW; i++) {
          checkRateLimit(wallet1);
        }

        // wallet1 should be blocked
        expect(() => checkRateLimit(wallet1)).toThrow('Rate limit exceeded');

        // wallet2 should still work
        expect(() => checkRateLimit(wallet2)).not.toThrow();
      });
    });

    describe('time-based rate limiting', () => {
      it('should reset rate limit after time window', () => {
        // Fill up to the limit
        for (let i = 0; i < MAX_OPERATIONS_PER_WINDOW; i++) {
          checkRateLimit(testWalletId);
        }

        // Should be blocked
        expect(() => checkRateLimit(testWalletId)).toThrow('Rate limit exceeded');

        // Move time forward past the window
        mockDateNow.mockReturnValue(1000000 + RATE_LIMIT_WINDOW_MS + 1);

        // Should work again
        expect(() => checkRateLimit(testWalletId)).not.toThrow();
      });

      it('should handle partial window expiry', () => {
        const baseTime = 1000000;

        // Add operations at different times
        mockDateNow.mockReturnValue(baseTime);
        for (let i = 0; i < 5; i++) {
          checkRateLimit(testWalletId);
        }

        // Move time forward but not past the window
        mockDateNow.mockReturnValue(baseTime + RATE_LIMIT_WINDOW_MS / 2);
        for (let i = 0; i < 5; i++) {
          checkRateLimit(testWalletId);
        }

        // Should be at limit now
        expect(() => checkRateLimit(testWalletId)).toThrow('Rate limit exceeded');

        // Move time forward to expire the first batch
        mockDateNow.mockReturnValue(baseTime + RATE_LIMIT_WINDOW_MS + 1);

        // Should allow 5 more operations (since first 5 expired)
        for (let i = 0; i < 5; i++) {
          expect(() => checkRateLimit(testWalletId)).not.toThrow();
        }
      });
    });

    describe('cleanup behavior', () => {
      it('should trigger cleanup when map gets large', () => {
        // Create many different wallet IDs to trigger cleanup
        for (let i = 0; i < 1001; i++) {
          const walletId = i.toString().padStart(64, '0');
          checkRateLimit(walletId);
        }

        // The cleanup should have been triggered, but we can't easily test the internal state
        // Just verify it doesn't crash
        expect(() => checkRateLimit('test')).not.toThrow();
      });
    });

    describe('security scenarios', () => {
      it('should handle rapid successive calls', () => {
        const startTime = 1000000;
        mockDateNow.mockReturnValue(startTime);

        // Rapid fire operations
        for (let i = 0; i < MAX_OPERATIONS_PER_WINDOW; i++) {
          mockDateNow.mockReturnValue(startTime + i); // Each operation 1ms apart
          checkRateLimit(testWalletId);
        }

        expect(() => checkRateLimit(testWalletId)).toThrow('Rate limit exceeded');
      });

      it('should handle malicious wallet IDs in rate limiting', () => {
        const maliciousIds = [
          'malicious-injection-attempt' + 'a'.repeat(38),
          '../../../attack' + 'a'.repeat(47),
          '<script>alert(1)</script>' + 'a'.repeat(39)
        ];

        // These should be handled gracefully (though they would fail wallet ID validation elsewhere)
        maliciousIds.forEach(id => {
          expect(() => checkRateLimit(id)).not.toThrow();
        });
      });
    });
  });

  describe('rate limit management', () => {
    const testWalletId = 'a'.repeat(64);

    describe('clearRateLimit', () => {
      it('should clear rate limit for specific wallet', () => {
        // Fill up to the limit
        for (let i = 0; i < MAX_OPERATIONS_PER_WINDOW; i++) {
          checkRateLimit(testWalletId);
        }

        // Should be blocked
        expect(() => checkRateLimit(testWalletId)).toThrow('Rate limit exceeded');

        // Clear the rate limit
        clearRateLimit(testWalletId);

        // Should work again
        expect(() => checkRateLimit(testWalletId)).not.toThrow();
      });

      it('should not affect other wallets when clearing specific wallet', () => {
        const wallet1 = 'a'.repeat(64);
        const wallet2 = 'b'.repeat(64);

        // Fill both wallets to limit
        for (let i = 0; i < MAX_OPERATIONS_PER_WINDOW; i++) {
          checkRateLimit(wallet1);
          checkRateLimit(wallet2);
        }

        // Both should be blocked
        expect(() => checkRateLimit(wallet1)).toThrow('Rate limit exceeded');
        expect(() => checkRateLimit(wallet2)).toThrow('Rate limit exceeded');

        // Clear only wallet1
        clearRateLimit(wallet1);

        // wallet1 should work, wallet2 should still be blocked
        expect(() => checkRateLimit(wallet1)).not.toThrow();
        expect(() => checkRateLimit(wallet2)).toThrow('Rate limit exceeded');
      });
    });

    describe('clearAllRateLimits', () => {
      it('should clear all rate limits', () => {
        const wallet1 = 'a'.repeat(64);
        const wallet2 = 'b'.repeat(64);

        // Fill both wallets to limit
        for (let i = 0; i < MAX_OPERATIONS_PER_WINDOW; i++) {
          checkRateLimit(wallet1);
          checkRateLimit(wallet2);
        }

        // Both should be blocked
        expect(() => checkRateLimit(wallet1)).toThrow('Rate limit exceeded');
        expect(() => checkRateLimit(wallet2)).toThrow('Rate limit exceeded');

        // Clear all rate limits
        clearAllRateLimits();

        // Both should work again
        expect(() => checkRateLimit(wallet1)).not.toThrow();
        expect(() => checkRateLimit(wallet2)).not.toThrow();
      });
    });
  });

  describe('checkSecretLimit', () => {
    const testWalletId = 'a'.repeat(64);

    describe('normal secret limit checking', () => {
      it('should allow adding secrets under the limit', () => {
        const existingSecrets = {};
        const currentCount = 5;

        expect(() => checkSecretLimit(currentCount, testWalletId, existingSecrets)).not.toThrow();
      });

      it('should allow updating existing secrets', () => {
        const existingSecrets = { [testWalletId]: 'existing-secret' };
        const currentCount = MAX_STORED_SECRETS; // At the limit

        // Should allow updating existing secret even at limit
        expect(() => checkSecretLimit(currentCount, testWalletId, existingSecrets)).not.toThrow();
      });

      it('should block adding new secrets at the limit', () => {
        const existingSecrets = {};
        const currentCount = MAX_STORED_SECRETS;

        expect(() => checkSecretLimit(currentCount, testWalletId, existingSecrets)).toThrow(
          `Cannot store more than ${MAX_STORED_SECRETS} wallet secrets`
        );
      });

      it('should provide helpful error message', () => {
        const existingSecrets = {};
        const currentCount = MAX_STORED_SECRETS;

        expect(() => checkSecretLimit(currentCount, testWalletId, existingSecrets)).toThrow(
          /Each wallet stores one secret \(mnemonic or private key\)/
        );
        expect(() => checkSecretLimit(currentCount, testWalletId, existingSecrets)).toThrow(
          /Addresses are derived from the wallet secret, not stored separately/
        );
      });
    });

    describe('edge cases', () => {
      it('should handle empty existing secrets object', () => {
        expect(() => checkSecretLimit(0, testWalletId, {})).not.toThrow();
      });

      it('should handle null or undefined existing secrets', () => {
        // The function expects an object, so null/undefined will cause errors
        // This tests that the function correctly fails with invalid inputs
        expect(() => checkSecretLimit(0, testWalletId, null as any)).toThrow();
        expect(() => checkSecretLimit(0, testWalletId, undefined as any)).toThrow();
      });

      it('should handle exactly at the limit scenarios', () => {
        const existingSecrets = {};

        // Just under the limit should work
        expect(() => checkSecretLimit(MAX_STORED_SECRETS - 1, testWalletId, existingSecrets)).not.toThrow();

        // At the limit should fail
        expect(() => checkSecretLimit(MAX_STORED_SECRETS, testWalletId, existingSecrets)).toThrow();
      });
    });

    describe('security scenarios', () => {
      it('should handle malicious wallet IDs in secret checking', () => {
        const maliciousIds = [
          '../../../attack',
          '<script>alert(1)</script>',
          'normal_id\x00injection'
        ];

        const existingSecrets = {};

        maliciousIds.forEach(id => {
          expect(() => checkSecretLimit(0, id, existingSecrets)).not.toThrow();
        });
      });

      it('should handle malicious existing secrets object', () => {
        const maliciousSecrets = {
          '__proto__': 'polluted',
          'constructor': { prototype: { polluted: true } },
          [testWalletId]: 'normal-secret'
        };

        // Should handle existing secret check correctly despite malicious properties
        expect(() => checkSecretLimit(MAX_STORED_SECRETS, testWalletId, maliciousSecrets)).not.toThrow();
      });

      it('should handle very large count values', () => {
        const existingSecrets = {};

        // Test with very large numbers
        expect(() => checkSecretLimit(Number.MAX_SAFE_INTEGER, testWalletId, existingSecrets)).toThrow();
        expect(() => checkSecretLimit(1000000, testWalletId, existingSecrets)).toThrow();
      });

      it('should handle negative count values', () => {
        const existingSecrets = {};

        // Negative counts should be treated as under limit
        expect(() => checkSecretLimit(-1, testWalletId, existingSecrets)).not.toThrow();
        expect(() => checkSecretLimit(-100, testWalletId, existingSecrets)).not.toThrow();
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex multi-function workflows', () => {
      const walletId = 'a'.repeat(64);
      const secret = 'test-secret';
      const timeout = 300000;
      const metadata = {
        unlockedAt: 1000000,
        lastActiveTime: 1000000,
        timeout: timeout
      };

      // Validate all components
      expect(() => validateWalletId(walletId)).not.toThrow();
      expect(() => validateSecret(secret)).not.toThrow();
      expect(() => validateTimeout(timeout)).not.toThrow();
      expect(() => validateSessionMetadata(metadata)).not.toThrow();

      // Check rate limits and secret limits
      expect(() => checkRateLimit(walletId)).not.toThrow();
      expect(() => checkSecretLimit(0, walletId, {})).not.toThrow();
    });

    it('should handle cleanup scenarios after many operations', () => {
      // Test the system under load
      for (let i = 0; i < 15; i++) { // Keep under the secret limit of 20
        const walletId = i.toString().padStart(64, '0');

        // Validate
        expect(() => validateWalletId(walletId)).not.toThrow();

        // Rate limit (should work for all since different wallets)
        expect(() => checkRateLimit(walletId)).not.toThrow();

        // Secret limit (use a count that stays under the limit)
        expect(() => checkSecretLimit(i, walletId, {})).not.toThrow();
      }

      // Clear everything
      clearAllRateLimits();

      // Should still work
      expect(() => checkRateLimit('a'.repeat(64))).not.toThrow();
    });
  });

  describe('constants validation', () => {
    it('should have reasonable constant values', () => {
      expect(MAX_WALLET_ID_LENGTH).toBe(128);
      expect(MAX_SECRET_LENGTH).toBe(1024);
      expect(MAX_STORED_SECRETS).toBe(20);
      expect(MIN_TIMEOUT_MS).toBe(60000); // 1 minute
      expect(MAX_TIMEOUT_MS).toBe(86400000); // 24 hours
      expect(RATE_LIMIT_WINDOW_MS).toBe(60000); // 1 minute
      expect(MAX_OPERATIONS_PER_WINDOW).toBe(10);
    });

    it('should have valid regex pattern', () => {
      expect(WALLET_ID_REGEX).toEqual(/^[a-f0-9]{64}$/);

      // Test the regex directly
      expect(WALLET_ID_REGEX.test('a'.repeat(64))).toBe(true);
      expect(WALLET_ID_REGEX.test('A'.repeat(64))).toBe(false); // Uppercase not allowed
      expect(WALLET_ID_REGEX.test('g' + 'a'.repeat(63))).toBe(false); // Invalid char
      expect(WALLET_ID_REGEX.test('a'.repeat(63))).toBe(false); // Too short
      expect(WALLET_ID_REGEX.test('a'.repeat(65))).toBe(false); // Too long
    });
  });
});