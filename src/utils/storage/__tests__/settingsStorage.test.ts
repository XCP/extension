import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getKeychainSettings,
  updateKeychainSettings,
  KeychainSettings,
  addRecord,
  updateRecord,
  getRecordById,
  clearAllRecords,
} from '@/utils/storage';

// Mock the storage.ts module
vi.mock('../storage', () => {
  let store: any[] = [];
  return {
    getAllRecords: async () => [...store],
    getRecordById: async (id: string) => store.find((r) => r.id === id),
    addRecord: async (record: any) => {
      if (store.some((r) => r.id === record.id)) {
        throw new Error(`Record with ID "${record.id}" already exists.`);
      }
      store.push({ ...record });
    },
    updateRecord: async (record: any) => {
      const index = store.findIndex((r) => r.id === record.id);
      if (index === -1) {
        throw new Error(`Record with ID "${record.id}" not found.`);
      }
      store[index] = { ...record };
    },
    removeRecord: async (id: string) => {
      store = store.filter((r) => r.id !== id);
    },
    clearAllRecords: async () => {
      store = [];
    },
  };
});

describe('settingsStorage.ts', () => {
  beforeEach(async () => {
    await clearAllRecords();
  });

  describe('getKeychainSettings', () => {
    it('should initialize with defaults if no settings exist', async () => {
      const settings = await getKeychainSettings();
      expect(settings).toEqual({
        lastActiveWalletId: undefined,
        lastActiveAddress: undefined,
        autoLockTimeout: 5 * 60 * 1000,
        connectedWebsites: [],
        showHelpText: false,
        analyticsAllowed: true,
        allowUnconfirmedTxs: false,
        autoLockTimer: '5m',
        enableMPMA: false,
        enableAdvancedBroadcasts: false,
        transactionDryRun: false,
        pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'],
        counterpartyApiBase: 'https://api.counterparty.io:4000',
      });
      const stored = await getRecordById('keychain-settings');
      expect(stored).toBeDefined();
    });

    it('should return existing settings', async () => {
      const customSettings: KeychainSettings = {
        lastActiveWalletId: 'wallet1',
        lastActiveAddress: 'addr1',
        autoLockTimeout: 15 * 60 * 1000,
        connectedWebsites: ['example.com'],
        showHelpText: true,
        analyticsAllowed: false,
        allowUnconfirmedTxs: true,
        autoLockTimer: '15m',
        enableMPMA: true,
        enableAdvancedBroadcasts: false,
        transactionDryRun: false,
        pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'],
        counterpartyApiBase: 'https://api.counterparty.io:4000',
      };
      await addRecord({ id: 'keychain-settings', ...customSettings });
      const settings = await getKeychainSettings();
      expect(settings).toEqual(customSettings);
    });

    it('should migrate legacy settings without autoLockTimer', async () => {
      const legacySettings = {
        id: 'keychain-settings',
        autoLockTimeout: 15 * 60 * 1000,
        connectedWebsites: [],
        showHelpText: false,
      };
      await addRecord(legacySettings);
      const settings = await getKeychainSettings();
      expect(settings.autoLockTimer).toBe('15m');
      expect(settings.autoLockTimeout).toBe(15 * 60 * 1000);
    });

    it('should default invalid autoLockTimer to 5m', async () => {
      const invalidSettings = {
        id: 'keychain-settings',
        autoLockTimer: 'always' as any,
        autoLockTimeout: 0,
      };
      await addRecord(invalidSettings);
      const settings = await getKeychainSettings();
      expect(settings.autoLockTimer).toBe('5m');
      expect(settings.autoLockTimeout).toBe(5 * 60 * 1000);
    });
  });

  describe('updateKeychainSettings', () => {
    it('should update settings and merge with existing values', async () => {
      await getKeychainSettings();
      const partialUpdate: Partial<KeychainSettings> = {
        showHelpText: true,
        autoLockTimer: '30m',
      };
      await updateKeychainSettings(partialUpdate);
      const settings = await getKeychainSettings();
      expect(settings.showHelpText).toBe(true);
      expect(settings.autoLockTimer).toBe('30m');
      expect(settings.autoLockTimeout).toBe(30 * 60 * 1000);
      expect(settings.analyticsAllowed).toBe(true);
    });

    it('should set autoLockTimeout based on autoLockTimer', async () => {
      await getKeychainSettings();
      await updateKeychainSettings({ autoLockTimer: '15m' });
      const settings = await getKeychainSettings();
      expect(settings.autoLockTimer).toBe('15m');
      expect(settings.autoLockTimeout).toBe(15 * 60 * 1000);
    });

    it('should preserve unrelated fields', async () => {
      const initialSettings: KeychainSettings = {
        lastActiveWalletId: 'wallet1',
        lastActiveAddress: 'addr1',
        autoLockTimeout: 5 * 60 * 1000,
        connectedWebsites: ['example.com'],
        showHelpText: false,
        analyticsAllowed: true,
        allowUnconfirmedTxs: false,
        autoLockTimer: '5m',
        enableMPMA: false,
        enableAdvancedBroadcasts: false,
        transactionDryRun: false,
        pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'],
        counterpartyApiBase: 'https://api.counterparty.io:4000',
      };
      await addRecord({ id: 'keychain-settings', ...initialSettings });
      await updateKeychainSettings({ showHelpText: true });
      const settings = await getKeychainSettings();
      expect(settings.showHelpText).toBe(true);
      expect(settings.lastActiveWalletId).toBe('wallet1');
      expect(settings.connectedWebsites).toEqual(['example.com']);
    });

    it('should handle updates when no settings exist yet', async () => {
      await updateKeychainSettings({ autoLockTimer: '30m', enableMPMA: true });
      const settings = await getKeychainSettings();
      expect(settings.autoLockTimer).toBe('30m');
      expect(settings.autoLockTimeout).toBe(30 * 60 * 1000);
      expect(settings.enableMPMA).toBe(true);
      expect(settings.showHelpText).toBe(false);
    });
  });

  describe('migration and edge cases', () => {
    it('should migrate autoLockTimeout of 0 to 5m', async () => {
      const legacySettings = {
        id: 'keychain-settings',
        autoLockTimeout: 0,
      };
      await addRecord(legacySettings);
      const settings = await getKeychainSettings();
      expect(settings.autoLockTimer).toBe('5m');
      expect(settings.autoLockTimeout).toBe(5 * 60 * 1000);
    });

    it('should handle invalid autoLockTimeout values', async () => {
      // Initialize with defaults first
      await getKeychainSettings();
      // Update with invalid autoLockTimeout
      const invalidSettings = {
        id: 'keychain-settings',
        autoLockTimeout: 999999,
      };
      await updateRecord(invalidSettings); // Use update instead of add to avoid duplicate
      const settings = await getKeychainSettings();
      expect(settings.autoLockTimer).toBe('5m');
      expect(settings.autoLockTimeout).toBe(5 * 60 * 1000);
    });

    it('should not throw on duplicate ID during initial creation', async () => {
      await expect(getKeychainSettings()).resolves.toBeDefined();
      await expect(getKeychainSettings()).resolves.toBeDefined();
    });
  });
});
