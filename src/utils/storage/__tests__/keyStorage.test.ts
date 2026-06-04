import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  getCachedKeychainMasterKey,
  setCachedKeychainMasterKey,
  clearCachedKeychainMasterKey,
} from '../keyStorage';

describe('keyStorage.ts', () => {
  beforeEach(() => {
    fakeBrowser.reset();
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

    it('should handle clearing a non-existent keychain key', async () => {
      await expect(clearCachedKeychainMasterKey()).resolves.not.toThrow();
    });
  });
});
