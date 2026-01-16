import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  getCachedSettingsMasterKey,
  setCachedSettingsMasterKey,
  clearCachedSettingsMasterKey,
  hasSettingsMasterKey,
  getCachedKeychainMasterKey,
  setCachedKeychainMasterKey,
  clearCachedKeychainMasterKey,
} from '../keyStorage';

describe('keyStorage.ts', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  describe('Cached Settings Master Key (session storage)', () => {
    it('should return null when no key is cached', async () => {
      const result = await getCachedSettingsMasterKey();
      expect(result).toBeNull();
    });

    it('should store and retrieve cached key', async () => {
      const key = 'dGVzdEtleQ=='; // "testKey" in base64

      await setCachedSettingsMasterKey(key);
      const result = await getCachedSettingsMasterKey();

      expect(result).toBe(key);
    });

    it('should clear cached key', async () => {
      await setCachedSettingsMasterKey('keyToRemove');
      expect(await getCachedSettingsMasterKey()).toBe('keyToRemove');

      await clearCachedSettingsMasterKey();

      expect(await getCachedSettingsMasterKey()).toBeNull();
    });

    it('should handle clearing non-existent key', async () => {
      // Should not throw
      await expect(clearCachedSettingsMasterKey()).resolves.not.toThrow();
    });
  });

  describe('hasSettingsMasterKey', () => {
    it('should return false when no key is cached', async () => {
      const result = await hasSettingsMasterKey();
      expect(result).toBe(false);
    });

    it('should return true when key is cached', async () => {
      await setCachedSettingsMasterKey('someKey');

      const result = await hasSettingsMasterKey();
      expect(result).toBe(true);
    });

    it('should return false after key is cleared', async () => {
      await setCachedSettingsMasterKey('keyToRemove');
      expect(await hasSettingsMasterKey()).toBe(true);

      await clearCachedSettingsMasterKey();

      expect(await hasSettingsMasterKey()).toBe(false);
    });
  });

  describe('Cached Keychain Master Key (session storage)', () => {
    it('should return null when no keychain key is cached', async () => {
      const result = await getCachedKeychainMasterKey();
      expect(result).toBeNull();
    });

    it('should store and retrieve cached keychain key', async () => {
      const key = 'a2V5Y2hhaW5LZXk='; // "keychainKey" in base64

      await setCachedKeychainMasterKey(key);
      const result = await getCachedKeychainMasterKey();

      expect(result).toBe(key);
    });

    it('should clear cached keychain key', async () => {
      await setCachedKeychainMasterKey('keyToRemove');
      expect(await getCachedKeychainMasterKey()).toBe('keyToRemove');

      await clearCachedKeychainMasterKey();

      expect(await getCachedKeychainMasterKey()).toBeNull();
    });
  });

  describe('Settings and Keychain key independence', () => {
    it('should store settings and keychain keys independently', async () => {
      await setCachedSettingsMasterKey('settingsKey');
      await setCachedKeychainMasterKey('keychainKey');

      expect(await getCachedSettingsMasterKey()).toBe('settingsKey');
      expect(await getCachedKeychainMasterKey()).toBe('keychainKey');
    });

    it('should clear settings key without affecting keychain key', async () => {
      await setCachedSettingsMasterKey('settingsKey');
      await setCachedKeychainMasterKey('keychainKey');

      await clearCachedSettingsMasterKey();

      expect(await getCachedSettingsMasterKey()).toBeNull();
      expect(await getCachedKeychainMasterKey()).toBe('keychainKey');
    });

    it('should clear keychain key without affecting settings key', async () => {
      await setCachedSettingsMasterKey('settingsKey');
      await setCachedKeychainMasterKey('keychainKey');

      await clearCachedKeychainMasterKey();

      expect(await getCachedSettingsMasterKey()).toBe('settingsKey');
      expect(await getCachedKeychainMasterKey()).toBeNull();
    });
  });
});
