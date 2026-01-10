import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  getSettingsSalt,
  setSettingsSalt,
  getCachedSettingsKey,
  setCachedSettingsKey,
  clearCachedSettingsKey,
  hasSettingsKey,
} from '../keyStorage';

describe('keyStorage.ts', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  describe('Settings Salt (local storage)', () => {
    it('should return null when no salt exists', async () => {
      const result = await getSettingsSalt();
      expect(result).toBeNull();
    });

    it('should store and retrieve salt', async () => {
      const salt = 'dGVzdFNhbHQ='; // "testSalt" in base64

      await setSettingsSalt(salt);
      const result = await getSettingsSalt();

      expect(result).toBe(salt);
    });

    it('should overwrite existing salt', async () => {
      await setSettingsSalt('firstSalt');
      await setSettingsSalt('secondSalt');

      const result = await getSettingsSalt();
      expect(result).toBe('secondSalt');
    });

    it('should persist salt across multiple gets', async () => {
      await setSettingsSalt('persistentSalt');

      expect(await getSettingsSalt()).toBe('persistentSalt');
      expect(await getSettingsSalt()).toBe('persistentSalt');
      expect(await getSettingsSalt()).toBe('persistentSalt');
    });

    it('should handle concurrent salt writes safely', async () => {
      // Due to write lock, these should not cause issues
      const promises = [
        setSettingsSalt('salt1'),
        setSettingsSalt('salt2'),
        setSettingsSalt('salt3'),
      ];

      await Promise.all(promises);

      // One of the salts should be stored
      const result = await getSettingsSalt();
      expect(['salt1', 'salt2', 'salt3']).toContain(result);
    });
  });

  describe('Cached Settings Key (session storage)', () => {
    it('should return null when no key is cached', async () => {
      const result = await getCachedSettingsKey();
      expect(result).toBeNull();
    });

    it('should store and retrieve cached key', async () => {
      const key = 'dGVzdEtleQ=='; // "testKey" in base64

      await setCachedSettingsKey(key);
      const result = await getCachedSettingsKey();

      expect(result).toBe(key);
    });

    it('should clear cached key', async () => {
      await setCachedSettingsKey('keyToRemove');
      expect(await getCachedSettingsKey()).toBe('keyToRemove');

      await clearCachedSettingsKey();

      expect(await getCachedSettingsKey()).toBeNull();
    });

    it('should handle clearing non-existent key', async () => {
      // Should not throw
      await expect(clearCachedSettingsKey()).resolves.not.toThrow();
    });
  });

  describe('hasSettingsKey', () => {
    it('should return false when no key is cached', async () => {
      const result = await hasSettingsKey();
      expect(result).toBe(false);
    });

    it('should return true when key is cached', async () => {
      await setCachedSettingsKey('someKey');

      const result = await hasSettingsKey();
      expect(result).toBe(true);
    });

    it('should return false after key is cleared', async () => {
      await setCachedSettingsKey('keyToRemove');
      expect(await hasSettingsKey()).toBe(true);

      await clearCachedSettingsKey();

      expect(await hasSettingsKey()).toBe(false);
    });
  });

  describe('Salt and Key independence', () => {
    it('should store salt and key independently', async () => {
      await setSettingsSalt('mySalt');
      await setCachedSettingsKey('myKey');

      expect(await getSettingsSalt()).toBe('mySalt');
      expect(await getCachedSettingsKey()).toBe('myKey');
    });

    it('should clear key without affecting salt', async () => {
      await setSettingsSalt('mySalt');
      await setCachedSettingsKey('myKey');

      await clearCachedSettingsKey();

      expect(await getSettingsSalt()).toBe('mySalt');
      expect(await getCachedSettingsKey()).toBeNull();
    });
  });
});
