import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  initializeSettingsKey,
  clearSettingsKey,
  isSettingsKeyAvailable,
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

  beforeEach(() => {
    fakeBrowser.reset();
  });

  describe('initializeSettingsKey', () => {
    it('should store derived key in session storage', async () => {
      await initializeSettingsKey(TEST_PASSWORD);

      // Verify key was stored by checking it's available
      const available = await isSettingsKeyAvailable();
      expect(available).toBe(true);
    });

    it('should derive same key for same password', async () => {
      // First initialization
      await initializeSettingsKey(TEST_PASSWORD);
      const encrypted1 = await encryptSettings(TEST_SETTINGS);

      // Clear and reinitialize with same password
      await clearSettingsKey();
      await initializeSettingsKey(TEST_PASSWORD);

      // Should decrypt with the newly derived key (same key for same password)
      const decrypted = await decryptSettings(encrypted1);
      expect(decrypted).toEqual(TEST_SETTINGS);
    });

    it('should derive different keys for different passwords', async () => {
      await initializeSettingsKey('password1');
      const encrypted = await encryptSettings(TEST_SETTINGS);

      await clearSettingsKey();
      await initializeSettingsKey('password2');

      // Different password should produce different key, decryption should fail
      await expect(decryptSettings(encrypted)).rejects.toThrow(
        'Failed to decrypt settings'
      );
    });
  });

  describe('clearSettingsKey', () => {
    it('should remove key from session storage', async () => {
      await initializeSettingsKey(TEST_PASSWORD);
      expect(await isSettingsKeyAvailable()).toBe(true);

      await clearSettingsKey();

      expect(await isSettingsKeyAvailable()).toBe(false);
    });
  });

  describe('isSettingsKeyAvailable', () => {
    it('should return false when key not initialized', async () => {
      const result = await isSettingsKeyAvailable();
      expect(result).toBe(false);
    });

    it('should return true when key is initialized', async () => {
      await initializeSettingsKey(TEST_PASSWORD);

      const result = await isSettingsKeyAvailable();
      expect(result).toBe(true);
    });

    it('should return false after key is cleared', async () => {
      await initializeSettingsKey(TEST_PASSWORD);
      await clearSettingsKey();

      const result = await isSettingsKeyAvailable();
      expect(result).toBe(false);
    });
  });

  describe('encryptSettings / decryptSettings', () => {
    it('should encrypt and decrypt settings correctly', async () => {
      await initializeSettingsKey(TEST_PASSWORD);

      const encrypted = await encryptSettings(TEST_SETTINGS);
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toContain('bc1qtest123'); // Should not contain plaintext

      const decrypted = await decryptSettings(encrypted);
      expect(decrypted).toEqual(TEST_SETTINGS);
    });

    it('should throw error when key not initialized (encrypt)', async () => {
      await expect(encryptSettings(TEST_SETTINGS)).rejects.toThrow(
        'Settings key not initialized'
      );
    });

    it('should throw error when key not initialized (decrypt)', async () => {
      await expect(decryptSettings('some-encrypted-data')).rejects.toThrow(
        'Settings key not initialized'
      );
    });

    it('should produce different ciphertext each time (random IV)', async () => {
      await initializeSettingsKey(TEST_PASSWORD);

      const encrypted1 = await encryptSettings(TEST_SETTINGS);
      const encrypted2 = await encryptSettings(TEST_SETTINGS);

      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to same value
      const decrypted1 = await decryptSettings(encrypted1);
      const decrypted2 = await decryptSettings(encrypted2);
      expect(decrypted1).toEqual(decrypted2);
    });

    it('should handle all settings fields', async () => {
      await initializeSettingsKey(TEST_PASSWORD);

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
      await initializeSettingsKey('password1');
      const encrypted = await encryptSettings(TEST_SETTINGS);

      // Clear and initialize with different password
      await clearSettingsKey();
      await initializeSettingsKey('password2');

      await expect(decryptSettings(encrypted)).rejects.toThrow(
        'Failed to decrypt settings'
      );
    });

    it('should fail on corrupted data', async () => {
      await initializeSettingsKey(TEST_PASSWORD);

      const encrypted = await encryptSettings(TEST_SETTINGS);
      // Corrupt the ciphertext
      const corrupted = encrypted.slice(0, 20) + 'X' + encrypted.slice(21);

      await expect(decryptSettings(corrupted)).rejects.toThrow(
        'Failed to decrypt settings'
      );
    });
  });

  describe('encryptSettingsWithPassword / decryptSettingsWithPassword', () => {
    it('should encrypt and decrypt with password directly', async () => {
      const encrypted = await encryptSettingsWithPassword(TEST_SETTINGS, TEST_PASSWORD);
      expect(typeof encrypted).toBe('string');

      const decrypted = await decryptSettingsWithPassword(encrypted, TEST_PASSWORD);
      expect(decrypted).toEqual(TEST_SETTINGS);
    });

    it('should work without session key initialized', async () => {
      // Verify no session key
      expect(await isSettingsKeyAvailable()).toBe(false);

      const encrypted = await encryptSettingsWithPassword(TEST_SETTINGS, TEST_PASSWORD);
      const decrypted = await decryptSettingsWithPassword(encrypted, TEST_PASSWORD);

      expect(decrypted).toEqual(TEST_SETTINGS);
    });

    it('should fail with wrong password', async () => {
      const encrypted = await encryptSettingsWithPassword(TEST_SETTINGS, 'correct-password');

      await expect(
        decryptSettingsWithPassword(encrypted, 'wrong-password')
      ).rejects.toThrow('Failed to decrypt settings');
    });

    it('should be compatible with session-based encryption', async () => {
      // Encrypt with password
      const encrypted = await encryptSettingsWithPassword(TEST_SETTINGS, TEST_PASSWORD);

      // Initialize session key with same password
      await initializeSettingsKey(TEST_PASSWORD);

      // Decrypt with session key
      const decrypted = await decryptSettings(encrypted);
      expect(decrypted).toEqual(TEST_SETTINGS);
    });

    it('should produce different ciphertext each time (random IV)', async () => {
      const encrypted1 = await encryptSettingsWithPassword(TEST_SETTINGS, TEST_PASSWORD);
      const encrypted2 = await encryptSettingsWithPassword(TEST_SETTINGS, TEST_PASSWORD);

      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('edge cases', () => {
    it('should handle unicode in settings', async () => {
      await initializeSettingsKey(TEST_PASSWORD);

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
      await initializeSettingsKey(TEST_PASSWORD);

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
      await initializeSettingsKey(TEST_PASSWORD);

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
});
