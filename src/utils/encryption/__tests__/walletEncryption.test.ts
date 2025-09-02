import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  encryptMnemonic,
  decryptMnemonic,
  encryptPrivateKey,
  decryptPrivateKey,
} from '../walletEncryption';
import { AddressFormat } from '@/utils/blockchain/bitcoin';
import { DecryptionError } from '../encryption';

// Mock the underlying encryption module
vi.mock('../encryption', () => ({
  encryptString: vi.fn(),
  decryptString: vi.fn(),
  DecryptionError: class DecryptionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'DecryptionError';
    }
  },
}));

// Mock BIP39 validation
vi.mock('@scure/bip39', () => ({
  validateMnemonic: vi.fn(),
}));

// Mock Counterwallet validation
vi.mock('@/utils/blockchain/counterwallet', () => ({
  isValidCounterwalletMnemonic: vi.fn(),
}));

// Test data - using standard test vectors
const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const testCounterwalletMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
const testPrivateKey = '5HueCGU8rMjxEXxiPuD5BDuK4kq68W5ogS9uQF3rftmLhpXcda7';
const testPrivateKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const correctPassword = 'correcthorsebatterystaple';
const wrongPassword = 'incorrectpassword';
const emptyPassword = '';
const encryptedPayload = '{"version":1,"iterations":420690,"encryptedData":"test","authSignature":"test"}';

describe('walletEncryption.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('encryptMnemonic', () => {
    it('should throw error for empty password', async () => {
      await expect(
        encryptMnemonic(testMnemonic, emptyPassword, AddressFormat.P2WPKH)
      ).rejects.toThrow('Password cannot be empty');
    });

    it('should validate standard mnemonic before encryption', async () => {
      const { validateMnemonic } = await import('@scure/bip39');
      const { encryptString } = await import('../encryption');
      
      vi.mocked(validateMnemonic).mockReturnValue(true);
      vi.mocked(encryptString).mockResolvedValue(encryptedPayload);

      await encryptMnemonic(testMnemonic, correctPassword, AddressFormat.P2WPKH);

      expect(validateMnemonic).toHaveBeenCalledWith(testMnemonic, expect.any(Object));
      expect(encryptString).toHaveBeenCalledWith(testMnemonic, correctPassword);
    });

    it('should validate Counterwallet mnemonic before encryption', async () => {
      const { isValidCounterwalletMnemonic } = await import('@/utils/blockchain/counterwallet');
      const { encryptString } = await import('../encryption');
      
      vi.mocked(isValidCounterwalletMnemonic).mockReturnValue(true);
      vi.mocked(encryptString).mockResolvedValue(encryptedPayload);

      await encryptMnemonic(testCounterwalletMnemonic, correctPassword, AddressFormat.Counterwallet);

      expect(isValidCounterwalletMnemonic).toHaveBeenCalledWith(testCounterwalletMnemonic);
      expect(encryptString).toHaveBeenCalledWith(testCounterwalletMnemonic, correctPassword);
    });

    it('should throw error for invalid standard mnemonic', async () => {
      const { validateMnemonic } = await import('@scure/bip39');
      
      vi.mocked(validateMnemonic).mockReturnValue(false);

      await expect(
        encryptMnemonic('invalid mnemonic', correctPassword, AddressFormat.P2WPKH)
      ).rejects.toThrow('Invalid mnemonic for address type: p2wpkh');
    });

    it('should throw error for invalid Counterwallet mnemonic', async () => {
      const { isValidCounterwalletMnemonic } = await import('@/utils/blockchain/counterwallet');
      
      vi.mocked(isValidCounterwalletMnemonic).mockReturnValue(false);

      await expect(
        encryptMnemonic('invalid counterwallet mnemonic', correctPassword, AddressFormat.Counterwallet)
      ).rejects.toThrow('Invalid mnemonic for address type: counterwallet');
    });

    it('should handle all address types correctly', async () => {
      const { validateMnemonic } = await import('@scure/bip39');
      const { isValidCounterwalletMnemonic } = await import('@/utils/blockchain/counterwallet');
      const { encryptString } = await import('../encryption');
      
      vi.mocked(validateMnemonic).mockReturnValue(true);
      vi.mocked(isValidCounterwalletMnemonic).mockReturnValue(true);
      vi.mocked(encryptString).mockResolvedValue(encryptedPayload);

      const addressTypes = [
        AddressFormat.P2PKH,
        AddressFormat.P2SH_P2WPKH,
        AddressFormat.P2WPKH,
        AddressFormat.P2TR,
        AddressFormat.Counterwallet,
      ];

      for (const addressType of addressTypes) {
        const mnemonic = addressType === AddressFormat.Counterwallet ? testCounterwalletMnemonic : testMnemonic;
        await encryptMnemonic(mnemonic, correctPassword, addressType);
        
        if (addressType === AddressFormat.Counterwallet) {
          expect(isValidCounterwalletMnemonic).toHaveBeenCalledWith(mnemonic);
        } else {
          expect(validateMnemonic).toHaveBeenCalledWith(mnemonic, expect.any(Object));
        }
      }
    });

    it('should successfully encrypt valid mnemonic', async () => {
      const { validateMnemonic } = await import('@scure/bip39');
      const { encryptString } = await import('../encryption');
      
      vi.mocked(validateMnemonic).mockReturnValue(true);
      vi.mocked(encryptString).mockResolvedValue(encryptedPayload);

      const result = await encryptMnemonic(testMnemonic, correctPassword, AddressFormat.P2WPKH);

      expect(result).toBe(encryptedPayload);
      expect(encryptString).toHaveBeenCalledWith(testMnemonic, correctPassword);
    });
  });

  describe('decryptMnemonic', () => {
    it('should decrypt and validate standard mnemonic', async () => {
      const { validateMnemonic } = await import('@scure/bip39');
      const { isValidCounterwalletMnemonic } = await import('@/utils/blockchain/counterwallet');
      const { decryptString } = await import('../encryption');
      
      vi.mocked(decryptString).mockResolvedValue(testMnemonic);
      vi.mocked(validateMnemonic).mockReturnValue(true);
      vi.mocked(isValidCounterwalletMnemonic).mockReturnValue(false);

      const result = await decryptMnemonic(encryptedPayload, correctPassword);

      expect(result).toBe(testMnemonic);
      expect(decryptString).toHaveBeenCalledWith(encryptedPayload, correctPassword);
      expect(validateMnemonic).toHaveBeenCalledWith(testMnemonic, expect.any(Object));
    });

    it('should decrypt and validate Counterwallet mnemonic', async () => {
      const { validateMnemonic } = await import('@scure/bip39');
      const { isValidCounterwalletMnemonic } = await import('@/utils/blockchain/counterwallet');
      const { decryptString } = await import('../encryption');
      
      vi.mocked(decryptString).mockResolvedValue(testCounterwalletMnemonic);
      vi.mocked(validateMnemonic).mockReturnValue(false);
      vi.mocked(isValidCounterwalletMnemonic).mockReturnValue(true);

      const result = await decryptMnemonic(encryptedPayload, correctPassword);

      expect(result).toBe(testCounterwalletMnemonic);
      expect(isValidCounterwalletMnemonic).toHaveBeenCalledWith(testCounterwalletMnemonic);
    });

    it('should throw DecryptionError for invalid decrypted mnemonic', async () => {
      const { validateMnemonic } = await import('@scure/bip39');
      const { isValidCounterwalletMnemonic } = await import('@/utils/blockchain/counterwallet');
      const { decryptString } = await import('../encryption');
      
      vi.mocked(decryptString).mockResolvedValue('invalid decrypted mnemonic');
      vi.mocked(validateMnemonic).mockReturnValue(false);
      vi.mocked(isValidCounterwalletMnemonic).mockReturnValue(false);

      await expect(
        decryptMnemonic(encryptedPayload, correctPassword)
      ).rejects.toThrow(DecryptionError);
      await expect(
        decryptMnemonic(encryptedPayload, correctPassword)
      ).rejects.toThrow('Decrypted mnemonic is invalid');
    });

    it('should propagate decryption errors', async () => {
      const { decryptString } = await import('../encryption');
      
      vi.mocked(decryptString).mockRejectedValue(new DecryptionError('Invalid password'));

      await expect(
        decryptMnemonic(encryptedPayload, wrongPassword)
      ).rejects.toThrow(DecryptionError);
    });
  });

  describe('encryptPrivateKey', () => {
    it('should throw error for empty password', async () => {
      await expect(
        encryptPrivateKey(testPrivateKey, emptyPassword)
      ).rejects.toThrow('Password cannot be empty');
    });

    it('should encrypt private key without validation', async () => {
      const { encryptString } = await import('../encryption');
      
      vi.mocked(encryptString).mockResolvedValue(encryptedPayload);

      const result = await encryptPrivateKey(testPrivateKey, correctPassword);

      expect(result).toBe(encryptedPayload);
      expect(encryptString).toHaveBeenCalledWith(testPrivateKey, correctPassword);
    });

    it('should handle different private key formats', async () => {
      const { encryptString } = await import('../encryption');
      
      vi.mocked(encryptString).mockResolvedValue(encryptedPayload);

      const privateKeyFormats = [
        testPrivateKey, // WIF format
        testPrivateKeyHex, // Hex format
        JSON.stringify({ privateKey: testPrivateKey }), // JSON format
      ];

      for (const privateKey of privateKeyFormats) {
        await encryptPrivateKey(privateKey, correctPassword);
        expect(encryptString).toHaveBeenCalledWith(privateKey, correctPassword);
      }
    });
  });

  describe('decryptPrivateKey', () => {
    it('should decrypt private key without validation', async () => {
      const { decryptString } = await import('../encryption');
      
      vi.mocked(decryptString).mockResolvedValue(testPrivateKey);

      const result = await decryptPrivateKey(encryptedPayload, correctPassword);

      expect(result).toBe(testPrivateKey);
      expect(decryptString).toHaveBeenCalledWith(encryptedPayload, correctPassword);
    });

    it('should propagate decryption errors', async () => {
      const { decryptString } = await import('../encryption');
      
      vi.mocked(decryptString).mockRejectedValue(new DecryptionError('Invalid password'));

      await expect(
        decryptPrivateKey(encryptedPayload, wrongPassword)
      ).rejects.toThrow(DecryptionError);
    });

    it('should handle different decrypted private key formats', async () => {
      const { decryptString } = await import('../encryption');
      
      const privateKeyFormats = [
        testPrivateKey,
        testPrivateKeyHex,
        JSON.stringify({ privateKey: testPrivateKey }),
      ];

      for (const privateKey of privateKeyFormats) {
        vi.mocked(decryptString).mockResolvedValue(privateKey);
        
        const result = await decryptPrivateKey(encryptedPayload, correctPassword);
        expect(result).toBe(privateKey);
      }
    });
  });

  describe('integration and error scenarios', () => {
    it('should handle encryption failures', async () => {
      const { validateMnemonic } = await import('@scure/bip39');
      const { encryptString } = await import('../encryption');
      
      vi.mocked(validateMnemonic).mockReturnValue(true);
      vi.mocked(encryptString).mockRejectedValue(new Error('Encryption failed'));

      await expect(
        encryptMnemonic(testMnemonic, correctPassword, AddressFormat.P2WPKH)
      ).rejects.toThrow('Encryption failed');
    });

    it('should handle various mnemonic lengths', async () => {
      const { validateMnemonic } = await import('@scure/bip39');
      const { encryptString } = await import('../encryption');
      
      vi.mocked(encryptString).mockResolvedValue(encryptedPayload);

      // Test different mnemonic lengths (12, 15, 18, 21, 24 words)
      const mnemonics = [
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      ];

      for (const mnemonic of mnemonics) {
        vi.mocked(validateMnemonic).mockReturnValue(true);
        await encryptMnemonic(mnemonic, correctPassword, AddressFormat.P2WPKH);
        expect(validateMnemonic).toHaveBeenCalledWith(mnemonic, expect.any(Object));
      }
    });

    it('should handle special characters in passwords and data', async () => {
      const { validateMnemonic } = await import('@scure/bip39');
      const { encryptString, decryptString } = await import('../encryption');
      
      const specialPasswords = [
        'password with spaces',
        'пароль', // Cyrillic
        '密码', // Chinese
        'pass@word!123',
        'päßwörd',
      ];

      vi.mocked(validateMnemonic).mockReturnValue(true);
      vi.mocked(encryptString).mockResolvedValue(encryptedPayload);
      vi.mocked(decryptString).mockResolvedValue(testMnemonic);

      for (const password of specialPasswords) {
        await encryptMnemonic(testMnemonic, password, AddressFormat.P2WPKH);
        expect(encryptString).toHaveBeenCalledWith(testMnemonic, password);
      }
    });

    it('should maintain consistency between encrypt/decrypt cycles', async () => {
      const bip39Module = await import('@scure/bip39');
      const counterwalletModule = await import('@/utils/blockchain/counterwallet');
      const encryptionModule = await import('../encryption');
      
      vi.mocked(bip39Module.validateMnemonic).mockReturnValue(true);
      vi.mocked(counterwalletModule.isValidCounterwalletMnemonic).mockReturnValue(false);
      vi.mocked(encryptionModule.encryptString).mockResolvedValue(encryptedPayload);
      vi.mocked(encryptionModule.decryptString).mockResolvedValue(testMnemonic);

      // Test mnemonic encrypt -> decrypt cycle
      const encryptedMnemonic = await encryptMnemonic(testMnemonic, correctPassword, AddressFormat.P2WPKH);
      const decryptedMnemonic = await decryptMnemonic(encryptedMnemonic, correctPassword);
      
      expect(encryptionModule.encryptString).toHaveBeenCalledWith(testMnemonic, correctPassword);
      expect(encryptionModule.decryptString).toHaveBeenCalledWith(encryptedPayload, correctPassword);

      // Test private key encrypt -> decrypt cycle
      vi.mocked(encryptionModule.decryptString).mockResolvedValue(testPrivateKey);
      
      const encryptedPrivateKey = await encryptPrivateKey(testPrivateKey, correctPassword);
      const decryptedPrivateKey = await decryptPrivateKey(encryptedPrivateKey, correctPassword);
      
      expect(encryptionModule.encryptString).toHaveBeenCalledWith(testPrivateKey, correctPassword);
      expect(encryptionModule.decryptString).toHaveBeenCalledWith(encryptedPayload, correctPassword);
    });
  });

  // Legacy compatibility tests (from original files)
  describe('legacy compatibility', () => {
    it('should encrypt and decrypt a mnemonic successfully', async () => {
      const { validateMnemonic } = await import('@scure/bip39');
      const { encryptString, decryptString } = await import('../encryption');
      
      vi.mocked(validateMnemonic).mockReturnValue(true);
      vi.mocked(encryptString).mockResolvedValue(encryptedPayload);
      vi.mocked(decryptString).mockResolvedValue(testMnemonic);

      const encrypted = await encryptMnemonic(testMnemonic, correctPassword, AddressFormat.P2WPKH);
      const decrypted = await decryptMnemonic(encrypted, correctPassword);
      
      expect(decrypted).toBe(testMnemonic);
    });

    it('should throw an error when decrypting a mnemonic with a wrong password', async () => {
      const { validateMnemonic } = await import('@scure/bip39');
      const { encryptString, decryptString } = await import('../encryption');
      
      vi.mocked(validateMnemonic).mockReturnValue(true);
      vi.mocked(encryptString).mockResolvedValue(encryptedPayload);
      vi.mocked(decryptString).mockRejectedValue(new DecryptionError('Invalid password'));

      const encrypted = await encryptMnemonic(testMnemonic, correctPassword, AddressFormat.P2WPKH);
      await expect(decryptMnemonic(encrypted, wrongPassword)).rejects.toThrow();
    });

    it('should encrypt and decrypt a private key successfully', async () => {
      const { encryptString, decryptString } = await import('../encryption');
      
      vi.mocked(encryptString).mockResolvedValue(encryptedPayload);
      vi.mocked(decryptString).mockResolvedValue(testPrivateKey);

      const encrypted = await encryptPrivateKey(testPrivateKey, correctPassword);
      const decrypted = await decryptPrivateKey(encrypted, correctPassword);
      
      expect(decrypted).toBe(testPrivateKey);
    });

    it('should throw an error when decrypting a private key with a wrong password', async () => {
      const { encryptString, decryptString } = await import('../encryption');
      
      vi.mocked(encryptString).mockResolvedValue(encryptedPayload);
      vi.mocked(decryptString).mockRejectedValue(new DecryptionError('Invalid password'));

      const encrypted = await encryptPrivateKey(testPrivateKey, correctPassword);
      await expect(decryptPrivateKey(encrypted, wrongPassword)).rejects.toThrow();
    });

    it('should throw an error when encrypting a mnemonic with an empty password', async () => {
      await expect(
        encryptMnemonic(testMnemonic, '', AddressFormat.P2WPKH)
      ).rejects.toThrow();
    });

    it('should throw an error when encrypting a private key with an empty password', async () => {
      await expect(encryptPrivateKey(testPrivateKey, '')).rejects.toThrow();
    });

    it('should decrypt a mnemonic correctly after re-encryption', async () => {
      const { validateMnemonic } = await import('@scure/bip39');
      const { encryptString, decryptString } = await import('../encryption');
      
      vi.mocked(validateMnemonic).mockReturnValue(true);
      vi.mocked(encryptString).mockResolvedValue(encryptedPayload);
      vi.mocked(decryptString).mockResolvedValue(testMnemonic);

      const encrypted = await encryptMnemonic(testMnemonic, correctPassword, AddressFormat.P2WPKH);
      const decrypted = await decryptMnemonic(encrypted, correctPassword);
      
      expect(decrypted).toBe(testMnemonic);
    });

    it('should decrypt a private key correctly after re-encryption', async () => {
      const { encryptString, decryptString } = await import('../encryption');
      
      vi.mocked(encryptString).mockResolvedValue(encryptedPayload);
      vi.mocked(decryptString).mockResolvedValue(testPrivateKey);

      const encrypted = await encryptPrivateKey(testPrivateKey, correctPassword);
      const decrypted = await decryptPrivateKey(encrypted, correctPassword);
      
      expect(decrypted).toBe(testPrivateKey);
    });
  });
});
