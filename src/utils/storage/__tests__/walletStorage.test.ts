import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  getKeychainRecord,
  saveKeychainRecord,
  hasKeychain,
  deleteKeychain,
} from '../walletStorage';
import type { KeychainRecord } from '@/types/wallet';

describe('walletStorage.ts', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  const createTestKeychainRecord = (): KeychainRecord => ({
    version: 1,
    kdf: { iterations: 600000 },
    salt: 'dGVzdC1zYWx0', // base64 "test-salt"
    encryptedKeychain: 'encrypted-keychain-data',
  });

  describe('getKeychainRecord', () => {
    it('should return null when no keychain exists', async () => {
      const result = await getKeychainRecord();
      expect(result).toBeNull();
    });

    it('should return keychain record when it exists', async () => {
      const record = createTestKeychainRecord();
      await saveKeychainRecord(record);

      const result = await getKeychainRecord();
      expect(result).toEqual(record);
    });

    it('should return null for invalid/corrupted data', async () => {
      // Manually set invalid data in storage
      await fakeBrowser.storage.local.set({
        keychainRecord: { invalid: 'data' },
      });

      const result = await getKeychainRecord();
      expect(result).toBeNull();
    });
  });

  describe('saveKeychainRecord', () => {
    it('should save keychain record to storage', async () => {
      const record = createTestKeychainRecord();

      await saveKeychainRecord(record);

      const result = await getKeychainRecord();
      expect(result).toEqual(record);
    });

    it('should overwrite existing keychain record', async () => {
      const record1 = createTestKeychainRecord();
      const record2: KeychainRecord = {
        version: 1,
        kdf: { iterations: 700000 },
        salt: 'bmV3LXNhbHQ=', // "new-salt"
        encryptedKeychain: 'new-encrypted-data',
      };

      await saveKeychainRecord(record1);
      await saveKeychainRecord(record2);

      const result = await getKeychainRecord();
      expect(result).toEqual(record2);
    });
  });

  describe('hasKeychain', () => {
    it('should return false when no keychain exists', async () => {
      const result = await hasKeychain();
      expect(result).toBe(false);
    });

    it('should return true when keychain exists', async () => {
      const record = createTestKeychainRecord();
      await saveKeychainRecord(record);

      const result = await hasKeychain();
      expect(result).toBe(true);
    });

    it('should return false after keychain is deleted', async () => {
      const record = createTestKeychainRecord();
      await saveKeychainRecord(record);
      expect(await hasKeychain()).toBe(true);

      await deleteKeychain();

      expect(await hasKeychain()).toBe(false);
    });
  });

  describe('deleteKeychain', () => {
    it('should delete existing keychain', async () => {
      const record = createTestKeychainRecord();
      await saveKeychainRecord(record);
      expect(await getKeychainRecord()).not.toBeNull();

      await deleteKeychain();

      expect(await getKeychainRecord()).toBeNull();
    });

    it('should not throw when deleting non-existent keychain', async () => {
      await expect(deleteKeychain()).resolves.not.toThrow();
    });
  });

  describe('KeychainRecord validation', () => {
    it('should validate version field', async () => {
      // Missing version
      await fakeBrowser.storage.local.set({
        keychainRecord: {
          kdf: { iterations: 600000 },
          salt: 'test',
          encryptedKeychain: 'data',
        },
      });

      const result = await getKeychainRecord();
      expect(result).toBeNull();
    });

    it('should validate salt field', async () => {
      // Missing salt
      await fakeBrowser.storage.local.set({
        keychainRecord: {
          version: 1,
          kdf: { iterations: 600000 },
          encryptedKeychain: 'data',
        },
      });

      const result = await getKeychainRecord();
      expect(result).toBeNull();
    });

    it('should validate encryptedKeychain field', async () => {
      // Missing encryptedKeychain
      await fakeBrowser.storage.local.set({
        keychainRecord: {
          version: 1,
          kdf: { iterations: 600000 },
          salt: 'test',
        },
      });

      const result = await getKeychainRecord();
      expect(result).toBeNull();
    });

    it('should validate kdf.iterations field', async () => {
      // Missing kdf.iterations
      await fakeBrowser.storage.local.set({
        keychainRecord: {
          version: 1,
          kdf: {},
          salt: 'test',
          encryptedKeychain: 'data',
        },
      });

      const result = await getKeychainRecord();
      expect(result).toBeNull();
    });

    it('should accept valid keychain record', async () => {
      const record = createTestKeychainRecord();
      await saveKeychainRecord(record);

      const result = await getKeychainRecord();
      expect(result).toEqual(record);
      expect(result?.version).toBe(1);
      expect(result?.kdf.iterations).toBe(600000);
      expect(result?.salt).toBe('dGVzdC1zYWx0');
      expect(result?.encryptedKeychain).toBe('encrypted-keychain-data');
    });
  });
});
