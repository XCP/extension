import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  deriveSettingsMasterKey,
  generateSettingsSalt,
  storeSettingsMasterKey,
  clearSettingsMasterKey,
  isSettingsMasterKeyAvailable,
  encryptSettings,
  decryptSettings,
  encryptSettingsWithPassword,
  decryptSettingsWithPassword,
} from '../settings';
import { DEFAULT_SETTINGS, type AppSettings } from '@/utils/storage/settingsStorage';

describe('settings encryption', () => {
  const TEST_PASSWORD = 'test-password-123';
  const TEST_SETTINGS: AppSettings = {
    ...DEFAULT_SETTINGS,
    lastActiveWalletId: 'wallet-123',
    lastActiveAddress: 'bc1qtest123',
    connectedWebsites: ['https://example.com', 'https://dapp.io'],
    pinnedAssets: ['XCP', 'PEPE', 'RARE'],
    showHelpText: true,
    autoLockTimer: '15m',
  };

  // Fixed test salt for reproducibility
  let testSalt: Uint8Array<ArrayBuffer>;

  beforeEach(() => {
    fakeBrowser.reset();
    testSalt = generateSettingsSalt();
  });

  /**
   * Helper to initialize the settings key for tests.
   * Derives key from password + salt and stores in session.
   */
  async function initializeKey(password: string, salt = testSalt): Promise<void> {
    const key = await deriveSettingsMasterKey(password, salt);
    await storeSettingsMasterKey(key);
  }

  describe('key management', () => {
    it('should store derived key in session storage', async () => {
      await initializeKey(TEST_PASSWORD);

      const available = await isSettingsMasterKeyAvailable();
      expect(available).toBe(true);
    });

    it('should derive same key for same password and salt', async () => {
      // First initialization
      await initializeKey(TEST_PASSWORD, testSalt);
      const encrypted1 = await encryptSettings(TEST_SETTINGS);

      // Clear and reinitialize with same password AND salt
      await clearSettingsMasterKey();
      await initializeKey(TEST_PASSWORD, testSalt);

      // Should decrypt with the newly derived key (same key for same password+salt)
      const decrypted = await decryptSettings(encrypted1);
      expect(decrypted).toEqual(TEST_SETTINGS);
    });

    it('should derive different keys for different passwords', async () => {
      await initializeKey('password1', testSalt);
      const encrypted = await encryptSettings(TEST_SETTINGS);

      await clearSettingsMasterKey();
      await initializeKey('password2', testSalt);

      // Different password should produce different key, decryption should fail
      await expect(decryptSettings(encrypted)).rejects.toThrow(
        'Failed to decrypt settings'
      );
    });

    it('should derive different keys for different salts', async () => {
      const salt1 = generateSettingsSalt();
      const salt2 = generateSettingsSalt();

      await initializeKey(TEST_PASSWORD, salt1);
      const encrypted = await encryptSettings(TEST_SETTINGS);

      await clearSettingsMasterKey();
      await initializeKey(TEST_PASSWORD, salt2);

      // Different salt should produce different key, decryption should fail
      await expect(decryptSettings(encrypted)).rejects.toThrow(
        'Failed to decrypt settings'
      );
    });
  });

  describe('clearSettingsMasterKey', () => {
    it('should remove key from session storage', async () => {
      await initializeKey(TEST_PASSWORD);
      expect(await isSettingsMasterKeyAvailable()).toBe(true);

      await clearSettingsMasterKey();

      expect(await isSettingsMasterKeyAvailable()).toBe(false);
    });
  });

  describe('isSettingsMasterKeyAvailable', () => {
    it('should return false when key not initialized', async () => {
      const result = await isSettingsMasterKeyAvailable();
      expect(result).toBe(false);
    });

    it('should return true when key is initialized', async () => {
      await initializeKey(TEST_PASSWORD);

      const result = await isSettingsMasterKeyAvailable();
      expect(result).toBe(true);
    });

    it('should return false after key is cleared', async () => {
      await initializeKey(TEST_PASSWORD);
      await clearSettingsMasterKey();

      const result = await isSettingsMasterKeyAvailable();
      expect(result).toBe(false);
    });
  });

  describe('encryptSettings / decryptSettings', () => {
    it('should encrypt and decrypt settings correctly', async () => {
      await initializeKey(TEST_PASSWORD);

      const encrypted = await encryptSettings(TEST_SETTINGS);
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toContain('bc1qtest123'); // Should not contain plaintext

      const decrypted = await decryptSettings(encrypted);
      expect(decrypted).toEqual(TEST_SETTINGS);
    });

    it('should throw error when key not initialized (encrypt)', async () => {
      await expect(encryptSettings(TEST_SETTINGS)).rejects.toThrow(
        'Settings master key not initialized'
      );
    });

    it('should throw error when key not initialized (decrypt)', async () => {
      await expect(decryptSettings('some-encrypted-data')).rejects.toThrow(
        'Settings master key not initialized'
      );
    });

    it('should produce different ciphertext each time (random IV)', async () => {
      await initializeKey(TEST_PASSWORD);

      const encrypted1 = await encryptSettings(TEST_SETTINGS);
      const encrypted2 = await encryptSettings(TEST_SETTINGS);

      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to same value
      const decrypted1 = await decryptSettings(encrypted1);
      const decrypted2 = await decryptSettings(encrypted2);
      expect(decrypted1).toEqual(decrypted2);
    });

    it('should handle all settings fields', async () => {
      await initializeKey(TEST_PASSWORD);

      const fullSettings: AppSettings = {
        version: 1,
        lastActiveWalletId: 'wallet-1',
        lastActiveAddress: 'bc1qfull',
        autoLockTimer: '30m',
        showHelpText: true,
        analyticsAllowed: false,
        allowUnconfirmedTxs: false,
        enableMPMA: true,
        enableAdvancedBroadcasts: true,
        transactionDryRun: true,
        counterpartyApiBase: 'https://custom.api.com:4000',
        defaultOrderExpiration: 1000,
        strictTransactionVerification: true,
        connectedWebsites: ['https://a.com', 'https://b.com'],
        pinnedAssets: ['ASSET1', 'ASSET2', 'ASSET3'],
        hasVisitedRecoverBitcoin: true,
        priceUnit: 'btc',
        fiat: 'usd',
      };

      const encrypted = await encryptSettings(fullSettings);
      const decrypted = await decryptSettings(encrypted);

      expect(decrypted).toEqual(fullSettings);
    });

    it('should fail decryption with wrong key', async () => {
      await initializeKey('password1', testSalt);
      const encrypted = await encryptSettings(TEST_SETTINGS);

      // Clear and initialize with different password
      await clearSettingsMasterKey();
      await initializeKey('password2', testSalt);

      await expect(decryptSettings(encrypted)).rejects.toThrow(
        'Failed to decrypt settings'
      );
    });

    it('should fail on corrupted data', async () => {
      await initializeKey(TEST_PASSWORD);

      const encrypted = await encryptSettings(TEST_SETTINGS);
      // Corrupt the ciphertext
      const corrupted = encrypted.slice(0, 20) + 'X' + encrypted.slice(21);

      await expect(decryptSettings(corrupted)).rejects.toThrow(
        'Failed to decrypt settings'
      );
    });

    it('should fail on invalid base64 input', async () => {
      await initializeKey(TEST_PASSWORD);

      // Invalid base64 string (contains invalid characters)
      const invalidBase64 = '!!!not-valid-base64!!!';

      await expect(decryptSettings(invalidBase64)).rejects.toThrow(
        'Failed to decrypt settings'
      );
    });
  });

  describe('encryptSettingsWithPassword / decryptSettingsWithPassword', () => {
    it('should encrypt and decrypt with password directly', async () => {
      const encrypted = await encryptSettingsWithPassword(TEST_SETTINGS, TEST_PASSWORD, testSalt);
      expect(typeof encrypted).toBe('string');

      const decrypted = await decryptSettingsWithPassword(encrypted, TEST_PASSWORD, testSalt);
      expect(decrypted).toEqual(TEST_SETTINGS);
    });

    it('should work without session key initialized', async () => {
      // Verify no session key
      expect(await isSettingsMasterKeyAvailable()).toBe(false);

      const encrypted = await encryptSettingsWithPassword(TEST_SETTINGS, TEST_PASSWORD, testSalt);
      const decrypted = await decryptSettingsWithPassword(encrypted, TEST_PASSWORD, testSalt);

      expect(decrypted).toEqual(TEST_SETTINGS);
    });

    it('should fail with wrong password', async () => {
      const encrypted = await encryptSettingsWithPassword(TEST_SETTINGS, 'correct-password', testSalt);

      await expect(
        decryptSettingsWithPassword(encrypted, 'wrong-password', testSalt)
      ).rejects.toThrow('Failed to decrypt settings');
    });

    it('should produce different ciphertext each time (random IV)', async () => {
      const encrypted1 = await encryptSettingsWithPassword(TEST_SETTINGS, TEST_PASSWORD, testSalt);
      const encrypted2 = await encryptSettingsWithPassword(TEST_SETTINGS, TEST_PASSWORD, testSalt);

      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('edge cases', () => {
    it('should handle unicode in settings', async () => {
      await initializeKey(TEST_PASSWORD);

      const unicodeSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        lastActiveAddress: 'bc1q日本語test',
        connectedWebsites: ['https://例え.jp'],
        pinnedAssets: ['XCP', '资产', 'émoji🚀'],
      };

      const encrypted = await encryptSettings(unicodeSettings);
      const decrypted = await decryptSettings(encrypted);

      expect(decrypted).toEqual(unicodeSettings);
    });

    it('should handle empty arrays', async () => {
      await initializeKey(TEST_PASSWORD);

      const emptySettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        connectedWebsites: [],
        pinnedAssets: [],
      };

      const encrypted = await encryptSettings(emptySettings);
      const decrypted = await decryptSettings(encrypted);

      expect(decrypted.connectedWebsites).toEqual([]);
      expect(decrypted.pinnedAssets).toEqual([]);
    });

    it('should handle very long arrays', async () => {
      await initializeKey(TEST_PASSWORD);

      const longSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        connectedWebsites: Array.from({ length: 100 }, (_, i) => `https://site${i}.com`),
        pinnedAssets: Array.from({ length: 50 }, (_, i) => `ASSET${i}`),
      };

      const encrypted = await encryptSettings(longSettings);
      const decrypted = await decryptSettings(encrypted);

      expect(decrypted.connectedWebsites).toHaveLength(100);
      expect(decrypted.pinnedAssets).toHaveLength(50);
    });
  });

  describe('empty password validation', () => {
    it('should throw error for empty password in deriveSettingsMasterKey', async () => {
      await expect(deriveSettingsMasterKey('', testSalt)).rejects.toThrow('Password cannot be empty');
    });

    it('should throw error for empty password in encryptSettingsWithPassword', async () => {
      await expect(
        encryptSettingsWithPassword(TEST_SETTINGS, '', testSalt)
      ).rejects.toThrow('Password cannot be empty');
    });

    it('should throw error for empty password in decryptSettingsWithPassword', async () => {
      await expect(
        decryptSettingsWithPassword('someEncryptedData', '', testSalt)
      ).rejects.toThrow('Password cannot be empty');
    });
  });
});
