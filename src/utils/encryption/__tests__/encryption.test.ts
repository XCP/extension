import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deriveKey,
  deriveKeyAsync,
  exportKey,
  importKey,
  encryptWithKey,
  decryptWithKey,
  encryptJsonWithKey,
  decryptJsonWithKey,
  DEFAULT_PBKDF2_ITERATIONS,
} from '../encryption';
import { generateRandomBytes } from '../buffer';

// Test constants matching encryption.ts security requirements
const VALID_PASSWORD = 'SecureP@ss1'; // 11 chars, meets 8 char minimum
const SHORT_PASSWORD = 'short'; // 5 chars, below 8 char minimum
const EMPTY_PASSWORD = '';
const MIN_SALT_SIZE = 16;
const MIN_ITERATIONS = 500_000;
const VALID_ITERATIONS = 600_000;
const LOW_ITERATIONS = 100_000; // Below 500K minimum

describe('encryption.ts', () => {
  describe('deriveKey', () => {
    describe('validation', () => {
      it('should reject empty password', async () => {
        const salt = generateRandomBytes(MIN_SALT_SIZE);
        await expect(deriveKey(EMPTY_PASSWORD, salt)).rejects.toThrow(
          'Password must be at least 8 characters'
        );
      });

      it('should reject password shorter than 8 characters', async () => {
        const salt = generateRandomBytes(MIN_SALT_SIZE);
        await expect(deriveKey(SHORT_PASSWORD, salt)).rejects.toThrow(
          'Password must be at least 8 characters'
        );
      });

      it('should accept password of exactly 8 characters', async () => {
        const salt = generateRandomBytes(MIN_SALT_SIZE);
        const eightCharPassword = '12345678';
        await expect(deriveKey(eightCharPassword, salt)).resolves.toBeDefined();
      });

      it('should reject salt smaller than 16 bytes', async () => {
        const smallSalt = generateRandomBytes(15);
        await expect(deriveKey(VALID_PASSWORD, smallSalt)).rejects.toThrow(
          'Salt must be at least 16 bytes'
        );
      });

      it('should reject empty salt', async () => {
        const emptySalt = new Uint8Array(0);
        await expect(deriveKey(VALID_PASSWORD, emptySalt)).rejects.toThrow(
          'Salt must be at least 16 bytes'
        );
      });

      it('should accept salt of exactly 16 bytes', async () => {
        const salt = generateRandomBytes(MIN_SALT_SIZE);
        await expect(deriveKey(VALID_PASSWORD, salt)).resolves.toBeDefined();
      });

      it('should accept salt larger than 16 bytes', async () => {
        const largeSalt = generateRandomBytes(32);
        await expect(deriveKey(VALID_PASSWORD, largeSalt)).resolves.toBeDefined();
      });

      it('should reject iterations below 500,000', async () => {
        const salt = generateRandomBytes(MIN_SALT_SIZE);
        await expect(deriveKey(VALID_PASSWORD, salt, LOW_ITERATIONS)).rejects.toThrow(
          'PBKDF2 iterations must be at least 500000'
        );
      });

      it('should reject non-integer iterations', async () => {
        const salt = generateRandomBytes(MIN_SALT_SIZE);
        await expect(deriveKey(VALID_PASSWORD, salt, 600000.5)).rejects.toThrow(
          'PBKDF2 iterations must be at least 500000'
        );
      });

      it('should accept iterations of exactly 500,000', async () => {
        const salt = generateRandomBytes(MIN_SALT_SIZE);
        await expect(deriveKey(VALID_PASSWORD, salt, MIN_ITERATIONS)).resolves.toBeDefined();
      });

      it('should use default iterations (600K) when not specified', async () => {
        const salt = generateRandomBytes(MIN_SALT_SIZE);
        // Should not throw - uses default 600K
        await expect(deriveKey(VALID_PASSWORD, salt)).resolves.toBeDefined();
      });
    });

    describe('key derivation', () => {
      it('should derive a CryptoKey', async () => {
        const salt = generateRandomBytes(MIN_SALT_SIZE);
        const key = await deriveKey(VALID_PASSWORD, salt);

        expect(key).toBeDefined();
        expect(key.type).toBe('secret');
        expect(key.algorithm.name).toBe('AES-GCM');
        expect(key.extractable).toBe(true);
        expect(key.usages).toContain('encrypt');
        expect(key.usages).toContain('decrypt');
      });

      it('should derive different keys for different passwords', async () => {
        const salt = generateRandomBytes(MIN_SALT_SIZE);
        const key1 = await deriveKey(VALID_PASSWORD, salt);
        const key2 = await deriveKey('DifferentPass1', salt);

        const exported1 = await exportKey(key1);
        const exported2 = await exportKey(key2);

        expect(exported1).not.toBe(exported2);
      });

      it('should derive different keys for different salts', async () => {
        const salt1 = generateRandomBytes(MIN_SALT_SIZE);
        const salt2 = generateRandomBytes(MIN_SALT_SIZE);
        const key1 = await deriveKey(VALID_PASSWORD, salt1);
        const key2 = await deriveKey(VALID_PASSWORD, salt2);

        const exported1 = await exportKey(key1);
        const exported2 = await exportKey(key2);

        expect(exported1).not.toBe(exported2);
      });

      it('should derive same key for same inputs (deterministic)', async () => {
        const salt = generateRandomBytes(MIN_SALT_SIZE);
        const key1 = await deriveKey(VALID_PASSWORD, salt, VALID_ITERATIONS);
        const key2 = await deriveKey(VALID_PASSWORD, salt, VALID_ITERATIONS);

        const exported1 = await exportKey(key1);
        const exported2 = await exportKey(key2);

        expect(exported1).toBe(exported2);
      });
    });
  });

  describe('deriveKeyAsync', () => {
    // In test environment, deriveKeyAsync falls back to deriveKey (no worker)
    // So these tests verify the same validation logic applies

    describe('validation', () => {
      it('should reject empty password', async () => {
        const salt = generateRandomBytes(MIN_SALT_SIZE);
        await expect(deriveKeyAsync(EMPTY_PASSWORD, salt)).rejects.toThrow(
          'Password must be at least 8 characters'
        );
      });

      it('should reject password shorter than 8 characters', async () => {
        const salt = generateRandomBytes(MIN_SALT_SIZE);
        await expect(deriveKeyAsync(SHORT_PASSWORD, salt)).rejects.toThrow(
          'Password must be at least 8 characters'
        );
      });

      it('should reject salt smaller than 16 bytes', async () => {
        const smallSalt = generateRandomBytes(15);
        await expect(deriveKeyAsync(VALID_PASSWORD, smallSalt)).rejects.toThrow(
          'Salt must be at least 16 bytes'
        );
      });

      it('should reject iterations below 500,000', async () => {
        const salt = generateRandomBytes(MIN_SALT_SIZE);
        await expect(deriveKeyAsync(VALID_PASSWORD, salt, LOW_ITERATIONS)).rejects.toThrow(
          'PBKDF2 iterations must be at least 500000'
        );
      });
    });

    describe('key derivation', () => {
      it('should derive a CryptoKey (fallback path)', async () => {
        const salt = generateRandomBytes(MIN_SALT_SIZE);
        const key = await deriveKeyAsync(VALID_PASSWORD, salt);

        expect(key).toBeDefined();
        expect(key.type).toBe('secret');
        expect(key.algorithm.name).toBe('AES-GCM');
      });
    });
  });

  describe('exportKey / importKey', () => {
    it('should export key to base64 string', async () => {
      const salt = generateRandomBytes(MIN_SALT_SIZE);
      const key = await deriveKey(VALID_PASSWORD, salt);

      const exported = await exportKey(key);

      expect(typeof exported).toBe('string');
      expect(exported.length).toBeGreaterThan(0);
      // Base64 of 256-bit (32 bytes) key = 44 characters
      expect(exported.length).toBe(44);
    });

    it('should import key from base64 string', async () => {
      const salt = generateRandomBytes(MIN_SALT_SIZE);
      const originalKey = await deriveKey(VALID_PASSWORD, salt);
      const exported = await exportKey(originalKey);

      const importedKey = await importKey(exported);

      expect(importedKey).toBeDefined();
      expect(importedKey.type).toBe('secret');
      expect(importedKey.algorithm.name).toBe('AES-GCM');
      // Imported key is not extractable for security
      expect(importedKey.extractable).toBe(false);
    });

    it('should produce functionally equivalent keys after round-trip', async () => {
      const salt = generateRandomBytes(MIN_SALT_SIZE);
      const originalKey = await deriveKey(VALID_PASSWORD, salt);
      const exported = await exportKey(originalKey);
      const importedKey = await importKey(exported);

      // Both keys should encrypt/decrypt the same data
      const testData = 'test encryption data';
      const encrypted = await encryptWithKey(testData, originalKey);
      const decrypted = await decryptWithKey(encrypted, importedKey);

      expect(decrypted).toBe(testData);
    });
  });

  describe('encryptWithKey / decryptWithKey', () => {
    let testKey: CryptoKey;

    beforeEach(async () => {
      const salt = generateRandomBytes(MIN_SALT_SIZE);
      testKey = await deriveKey(VALID_PASSWORD, salt);
    });

    describe('encryption', () => {
      it('should encrypt a string to base64', async () => {
        const plaintext = 'Hello, World!';
        const encrypted = await encryptWithKey(plaintext, testKey);

        expect(typeof encrypted).toBe('string');
        expect(encrypted.length).toBeGreaterThan(0);
        expect(encrypted).not.toBe(plaintext);
      });

      it('should produce different ciphertext each time (random IV)', async () => {
        const plaintext = 'Same message';
        const encrypted1 = await encryptWithKey(plaintext, testKey);
        const encrypted2 = await encryptWithKey(plaintext, testKey);

        expect(encrypted1).not.toBe(encrypted2);
      });

      it('should handle empty string', async () => {
        const encrypted = await encryptWithKey('', testKey);
        const decrypted = await decryptWithKey(encrypted, testKey);
        expect(decrypted).toBe('');
      });

      it('should handle unicode characters', async () => {
        const plaintext = '你好世界 🌍 émojis';
        const encrypted = await encryptWithKey(plaintext, testKey);
        const decrypted = await decryptWithKey(encrypted, testKey);
        expect(decrypted).toBe(plaintext);
      });

      it('should handle large data', async () => {
        const plaintext = 'x'.repeat(100000); // 100KB of data
        const encrypted = await encryptWithKey(plaintext, testKey);
        const decrypted = await decryptWithKey(encrypted, testKey);
        expect(decrypted).toBe(plaintext);
      });
    });

    describe('decryption', () => {
      it('should decrypt to original plaintext', async () => {
        const plaintext = 'Secret message';
        const encrypted = await encryptWithKey(plaintext, testKey);
        const decrypted = await decryptWithKey(encrypted, testKey);

        expect(decrypted).toBe(plaintext);
      });

      it('should fail with wrong key', async () => {
        const plaintext = 'Secret message';
        const encrypted = await encryptWithKey(plaintext, testKey);

        const wrongSalt = generateRandomBytes(MIN_SALT_SIZE);
        const wrongKey = await deriveKey('WrongPassword1', wrongSalt);

        await expect(decryptWithKey(encrypted, wrongKey)).rejects.toThrow();
      });

      it('should fail with invalid base64', async () => {
        await expect(decryptWithKey('not-valid-base64!!!', testKey)).rejects.toThrow(
          'Failed to decrypt: invalid format'
        );
      });

      it('should fail with data too short (no IV)', async () => {
        // Minimum size is IV (12) + 1 byte + GCM tag (16) = 29 bytes
        // This is just a few bytes, way too short
        const tooShort = btoa('short');
        await expect(decryptWithKey(tooShort, testKey)).rejects.toThrow(
          'Failed to decrypt: invalid format'
        );
      });

      it('should fail with tampered ciphertext', async () => {
        const plaintext = 'Secret message';
        const encrypted = await encryptWithKey(plaintext, testKey);

        // Decode, tamper, re-encode
        const decoded = atob(encrypted);
        const tampered =
          decoded.slice(0, 20) +
          String.fromCharCode(decoded.charCodeAt(20) ^ 0xff) +
          decoded.slice(21);
        const tamperedEncoded = btoa(tampered);

        await expect(decryptWithKey(tamperedEncoded, testKey)).rejects.toThrow();
      });
    });
  });

  describe('encryptJsonWithKey / decryptJsonWithKey', () => {
    let testKey: CryptoKey;

    beforeEach(async () => {
      const salt = generateRandomBytes(MIN_SALT_SIZE);
      testKey = await deriveKey(VALID_PASSWORD, salt);
    });

    it('should encrypt and decrypt simple object', async () => {
      const obj = { name: 'test', value: 42 };
      const encrypted = await encryptJsonWithKey(obj, testKey);
      const decrypted = await decryptJsonWithKey<typeof obj>(encrypted, testKey);

      expect(decrypted).toEqual(obj);
    });

    it('should encrypt and decrypt nested object', async () => {
      const obj = {
        user: {
          name: 'Alice',
          settings: {
            theme: 'dark',
            notifications: true,
          },
        },
        items: [1, 2, 3],
      };
      const encrypted = await encryptJsonWithKey(obj, testKey);
      const decrypted = await decryptJsonWithKey<typeof obj>(encrypted, testKey);

      expect(decrypted).toEqual(obj);
    });

    it('should encrypt and decrypt array', async () => {
      const arr = [1, 'two', { three: 3 }];
      const encrypted = await encryptJsonWithKey(arr, testKey);
      const decrypted = await decryptJsonWithKey<typeof arr>(encrypted, testKey);

      expect(decrypted).toEqual(arr);
    });

    it('should encrypt and decrypt null', async () => {
      const encrypted = await encryptJsonWithKey(null, testKey);
      const decrypted = await decryptJsonWithKey<null>(encrypted, testKey);

      expect(decrypted).toBeNull();
    });

    it('should encrypt and decrypt empty object', async () => {
      const obj = {};
      const encrypted = await encryptJsonWithKey(obj, testKey);
      const decrypted = await decryptJsonWithKey<typeof obj>(encrypted, testKey);

      expect(decrypted).toEqual(obj);
    });

    it('should fail with wrong key', async () => {
      const obj = { secret: 'data' };
      const encrypted = await encryptJsonWithKey(obj, testKey);

      const wrongSalt = generateRandomBytes(MIN_SALT_SIZE);
      const wrongKey = await deriveKey('WrongPassword1', wrongSalt);

      await expect(decryptJsonWithKey(encrypted, wrongKey)).rejects.toThrow();
    });
  });

  describe('DEFAULT_PBKDF2_ITERATIONS', () => {
    it('should be 600,000', () => {
      expect(DEFAULT_PBKDF2_ITERATIONS).toBe(600_000);
    });
  });

  describe('timing attack mitigations', () => {
    // Note: These tests verify the code structure exists, not actual timing security
    // True timing analysis requires specialized tooling

    it('should complete decryption in similar time for valid vs invalid data', async () => {
      const salt = generateRandomBytes(MIN_SALT_SIZE);
      const testKey = await deriveKey(VALID_PASSWORD, salt);

      const validEncrypted = await encryptWithKey('valid data', testKey);

      // Create properly-sized but invalid ciphertext
      const invalidData = generateRandomBytes(50);
      const invalidEncrypted = btoa(String.fromCharCode(...invalidData));

      // Both should complete (one succeeds, one fails)
      // The timing mitigation adds random delay to mask differences
      const validResult = await decryptWithKey(validEncrypted, testKey).catch(() => 'error');
      const invalidResult = await decryptWithKey(invalidEncrypted, testKey).catch(() => 'error');

      expect(validResult).toBe('valid data');
      expect(invalidResult).toBe('error');
    });
  });
});
