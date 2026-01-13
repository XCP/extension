import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  encryptString,
  decryptString,
  DecryptionError,
} from '../encryption';

// Mock crypto API for testing
const mockCrypto = {
  getRandomValues: vi.fn((array) => {
    // Generate deterministic but "random-looking" values for testing
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  }),
  subtle: {
    importKey: vi.fn(),
    deriveBits: vi.fn(),
    deriveKey: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    sign: vi.fn(),
    verify: vi.fn(),
  },
};

// Set up global crypto mock using vi.stubGlobal
vi.stubGlobal('crypto', mockCrypto);

// Test data
const testPassword = 'testPassword123';
const testPlaintext = 'This is test data to encrypt';
const emptyPassword = '';
const emptyPlaintext = '';

describe('encryption.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('encryptString', () => {
    it('should throw error for empty password', async () => {
      await expect(encryptString(testPlaintext, emptyPassword)).rejects.toThrow(
        'Password cannot be empty'
      );
    });

    it('should throw error for empty plaintext', async () => {
      await expect(encryptString(emptyPlaintext, testPassword)).rejects.toThrow(
        'Plaintext cannot be empty'
      );
    });

    it('should return JSON string with expected structure', async () => {
      // Mock the crypto operations
      mockCrypto.subtle.importKey.mockResolvedValue({} as CryptoKey);
      mockCrypto.subtle.deriveBits.mockResolvedValue(new ArrayBuffer(32));
      mockCrypto.subtle.deriveKey.mockResolvedValue({} as CryptoKey);
      mockCrypto.subtle.encrypt.mockResolvedValue(new ArrayBuffer(32));
      mockCrypto.subtle.sign.mockResolvedValue(new ArrayBuffer(32));

      const result = await encryptString(testPlaintext, testPassword);
      
      expect(typeof result).toBe('string');
      
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('version');
      expect(parsed).toHaveProperty('iterations');
      expect(parsed).toHaveProperty('encryptedData');
      expect(parsed).toHaveProperty('authSignature');
      expect(parsed.version).toBe(2);
      expect(parsed.iterations).toBe(600000);
    });

    it('should call crypto operations with correct parameters', async () => {
      mockCrypto.subtle.importKey.mockResolvedValue({} as CryptoKey);
      mockCrypto.subtle.deriveBits.mockResolvedValue(new ArrayBuffer(32));
      mockCrypto.subtle.deriveKey.mockResolvedValue({} as CryptoKey);
      mockCrypto.subtle.encrypt.mockResolvedValue(new ArrayBuffer(32));
      mockCrypto.subtle.sign.mockResolvedValue(new ArrayBuffer(32));

      await encryptString(testPlaintext, testPassword);

      expect(mockCrypto.subtle.importKey).toHaveBeenCalled();
      expect(mockCrypto.subtle.deriveBits).toHaveBeenCalled();
      expect(mockCrypto.subtle.deriveKey).toHaveBeenCalled();
      expect(mockCrypto.subtle.encrypt).toHaveBeenCalled();
      expect(mockCrypto.subtle.sign).toHaveBeenCalled();
    });
  });

  describe('decryptString', () => {
    it('should throw DecryptionError for empty password', async () => {
      const validPayload = JSON.stringify({
        version: 2,
        iterations: 420690,
        encryptedData: 'dGVzdA==',
        authSignature: 'dGVzdA==',
      });

      await expect(decryptString(validPayload, emptyPassword)).rejects.toThrow(
        DecryptionError
      );
      await expect(decryptString(validPayload, emptyPassword)).rejects.toThrow(
        'Password cannot be empty'
      );
    });

    it('should throw DecryptionError for empty payload', async () => {
      await expect(decryptString('', testPassword)).rejects.toThrow(
        DecryptionError
      );
      await expect(decryptString('', testPassword)).rejects.toThrow(
        'Encrypted payload cannot be empty'
      );
    });

    it('should throw DecryptionError for invalid JSON', async () => {
      const invalidJson = 'not-valid-json';

      await expect(decryptString(invalidJson, testPassword)).rejects.toThrow(
        DecryptionError
      );
      await expect(decryptString(invalidJson, testPassword)).rejects.toThrow(
        'Invalid encrypted payload (not valid JSON)'
      );
    });

    it('should throw DecryptionError for unsupported version', async () => {
      const unsupportedVersion = JSON.stringify({
        version: 999,
        iterations: 420690,
        encryptedData: 'dGVzdA==',
        authSignature: 'dGVzdA==',
      });

      await expect(decryptString(unsupportedVersion, testPassword)).rejects.toThrow(
        DecryptionError
      );
      await expect(decryptString(unsupportedVersion, testPassword)).rejects.toThrow(
        'Unsupported encryption version: 999'
      );
    });

    it('should throw DecryptionError for invalid iterations', async () => {
      const invalidIterations = [
        { iterations: 0, desc: 'zero' },
        { iterations: -1, desc: 'negative' },
        { iterations: 1.5, desc: 'non-integer' },
        { iterations: 'string', desc: 'string' },
        { iterations: null, desc: 'null' },
      ];

      for (const { iterations, desc } of invalidIterations) {
        const payload = JSON.stringify({
          version: 2,
          iterations,
          encryptedData: 'dGVzdA==',
          authSignature: 'dGVzdA==',
        });

        await expect(decryptString(payload, testPassword)).rejects.toThrow(
          'Invalid encrypted payload (invalid iterations)'
        );
      }
    });

    it('should throw DecryptionError for incomplete data', async () => {
      const incompleteData = JSON.stringify({
        version: 2,
        iterations: 420690,
        encryptedData: 'dGVzdA==', // Too short
        authSignature: 'dGVzdA==',
      });

      await expect(decryptString(incompleteData, testPassword)).rejects.toThrow(
        DecryptionError
      );
      await expect(decryptString(incompleteData, testPassword)).rejects.toThrow(
        'Invalid encrypted payload (incomplete data)'
      );
    });

    it('should throw DecryptionError for invalid base64 in encryptedData', async () => {
      const invalidBase64 = JSON.stringify({
        version: 2,
        iterations: 420690,
        encryptedData: '!!!not-valid-base64!!!',
        authSignature: 'dGVzdA==',
      });

      await expect(decryptString(invalidBase64, testPassword)).rejects.toThrow(
        DecryptionError
      );
      await expect(decryptString(invalidBase64, testPassword)).rejects.toThrow(
        'Invalid encrypted payload (invalid format)'
      );
    });

    it('should throw DecryptionError for missing encryptedData field', async () => {
      const missingField = JSON.stringify({
        version: 2,
        iterations: 420690,
        authSignature: 'dGVzdA==',
      });

      await expect(decryptString(missingField, testPassword)).rejects.toThrow(
        DecryptionError
      );
      await expect(decryptString(missingField, testPassword)).rejects.toThrow(
        'Invalid encrypted payload (invalid format)'
      );
    });

    it('should throw DecryptionError for invalid authentication', async () => {
      // Create a payload with enough data length
      const longEnoughData = 'A'.repeat(100); // Base64 that decodes to sufficient length
      const invalidAuth = JSON.stringify({
        version: 2,
        iterations: 420690,
        encryptedData: btoa(longEnoughData),
        authSignature: 'dGVzdA==',
      });

      mockCrypto.subtle.importKey.mockResolvedValue({} as CryptoKey);
      mockCrypto.subtle.deriveBits.mockResolvedValue(new ArrayBuffer(32));
      mockCrypto.subtle.deriveKey.mockResolvedValue({} as CryptoKey);
      mockCrypto.subtle.verify.mockResolvedValue(false); // Invalid auth

      await expect(decryptString(invalidAuth, testPassword)).rejects.toThrow(
        DecryptionError
      );
      await expect(decryptString(invalidAuth, testPassword)).rejects.toThrow(
        'Invalid password or corrupted data'
      );
    });

    it('should successfully decrypt with valid payload and password', async () => {
      const longEnoughData = 'A'.repeat(100);
      const validPayload = JSON.stringify({
        version: 2,
        iterations: 420690,
        encryptedData: btoa(longEnoughData),
        authSignature: 'dGVzdA==',
      });

      const decryptedData = new TextEncoder().encode(testPlaintext);

      mockCrypto.subtle.importKey.mockResolvedValue({} as CryptoKey);
      mockCrypto.subtle.deriveBits.mockResolvedValue(new ArrayBuffer(32));
      mockCrypto.subtle.deriveKey.mockResolvedValue({} as CryptoKey);
      mockCrypto.subtle.verify.mockResolvedValue(true);
      mockCrypto.subtle.decrypt.mockResolvedValue(decryptedData.buffer);

      const result = await decryptString(validPayload, testPassword);

      expect(result).toBe(testPlaintext);
      expect(mockCrypto.subtle.verify).toHaveBeenCalled();
      expect(mockCrypto.subtle.decrypt).toHaveBeenCalled();
    });

    it('should handle crypto operation failures', async () => {
      const longEnoughData = 'A'.repeat(100);
      const validPayload = JSON.stringify({
        version: 2,
        iterations: 420690,
        encryptedData: btoa(longEnoughData),
        authSignature: 'dGVzdA==',
      });

      mockCrypto.subtle.importKey.mockRejectedValue(new Error('Crypto error'));

      // Error message should be generic (not leak internal crypto details)
      await expect(decryptString(validPayload, testPassword)).rejects.toThrow(
        DecryptionError
      );
      await expect(decryptString(validPayload, testPassword)).rejects.toThrow(
        'Invalid password or corrupted data'
      );
    });
  });

  describe('DecryptionError', () => {
    it('should create proper error instance', () => {
      const message = 'Test decryption error';
      const error = new DecryptionError(message);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DecryptionError);
      expect(error.name).toBe('DecryptionError');
      expect(error.message).toBe(message);
    });
  });

  describe('integration scenarios', () => {
    it('should handle various plaintext types', async () => {
      const testCases = [
        'Simple text',
        'Text with special chars: !@#$%^&*()',
        'Unicode text: 测试文本 🚀',
        JSON.stringify({ key: 'value', number: 123 }),
        'Very long text: ' + 'x'.repeat(1000),
      ];

      mockCrypto.subtle.importKey.mockResolvedValue({} as CryptoKey);
      mockCrypto.subtle.deriveBits.mockResolvedValue(new ArrayBuffer(32));
      mockCrypto.subtle.deriveKey.mockResolvedValue({} as CryptoKey);
      mockCrypto.subtle.encrypt.mockResolvedValue(new ArrayBuffer(32));
      mockCrypto.subtle.sign.mockResolvedValue(new ArrayBuffer(32));

      for (const testCase of testCases) {
        const result = await encryptString(testCase, testPassword);
        expect(typeof result).toBe('string');
        expect(() => JSON.parse(result)).not.toThrow();
      }
    });

    it('should handle various password types', async () => {
      const passwords = [
        'simple',
        'with spaces',
        'with-dashes_and_underscores',
        'with123numbers',
        'withSpecialChars!@#$%',
        'Unicode密码',
        'very'.repeat(100) + 'long',
      ];

      mockCrypto.subtle.importKey.mockResolvedValue({} as CryptoKey);
      mockCrypto.subtle.deriveBits.mockResolvedValue(new ArrayBuffer(32));
      mockCrypto.subtle.deriveKey.mockResolvedValue({} as CryptoKey);
      mockCrypto.subtle.encrypt.mockResolvedValue(new ArrayBuffer(32));
      mockCrypto.subtle.sign.mockResolvedValue(new ArrayBuffer(32));

      for (const password of passwords) {
        const result = await encryptString(testPlaintext, password);
        expect(typeof result).toBe('string');
      }
    });
  });

  describe('crypto configuration', () => {
    it('should use correct crypto parameters', async () => {
      mockCrypto.subtle.importKey.mockResolvedValue({} as CryptoKey);
      mockCrypto.subtle.deriveBits.mockResolvedValue(new ArrayBuffer(32));
      mockCrypto.subtle.deriveKey.mockResolvedValue({} as CryptoKey);
      mockCrypto.subtle.encrypt.mockResolvedValue(new ArrayBuffer(32));
      mockCrypto.subtle.sign.mockResolvedValue(new ArrayBuffer(32));

      await encryptString(testPlaintext, testPassword);

      // Verify PBKDF2 parameters
      expect(mockCrypto.subtle.deriveBits).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'PBKDF2',
          iterations: 600000,
          hash: 'SHA-256',
        }),
        expect.any(Object),
        256
      );

      // Verify AES-GCM parameters
      expect(mockCrypto.subtle.encrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'AES-GCM',
          tagLength: 128,
        }),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });
});
