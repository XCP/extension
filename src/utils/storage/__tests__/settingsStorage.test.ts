import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getKeychainSettings,
  updateKeychainSettings,
  KeychainSettings,
  DEFAULT_KEYCHAIN_SETTINGS,
  AutoLockTimer,
} from '../settingsStorage';
import {
  addRecord,
  updateRecord,
  getRecordById,
  clearAllRecords,
} from '../storage';

// Mock the storage.ts module
vi.mock('../storage', () => {
  let store: any[] = [];
  return {
    getAllRecords: async () => structuredClone(store),
    getRecordById: async (id: string) => {
      const record = store.find((r) => r.id === id);
      return record ? structuredClone(record) : undefined;
    },
    addRecord: async (record: any) => {
      if (store.some((r) => r.id === record.id)) {
        throw new Error(`Record with ID "${record.id}" already exists.`);
      }
      store.push(structuredClone(record));
    },
    updateRecord: async (record: any) => {
      const index = store.findIndex((r) => r.id === record.id);
      if (index === -1) {
        throw new Error(`Record with ID "${record.id}" not found.`);
      }
      store[index] = structuredClone(record);
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
      expect(settings).toEqual(DEFAULT_KEYCHAIN_SETTINGS);
      const stored = await getRecordById('keychain-settings');
      expect(stored).toBeDefined();
    });

    it('should return existing settings', async () => {
      const customSettings: KeychainSettings = {
        ...DEFAULT_KEYCHAIN_SETTINGS,
        lastActiveWalletId: 'wallet1',
        lastActiveAddress: 'addr1',
        autoLockTimeout: 15 * 60 * 1000,
        connectedWebsites: ['example.com'],
        showHelpText: true,
        analyticsAllowed: false,
        allowUnconfirmedTxs: true,
        autoLockTimer: '15m',
        enableMPMA: true,
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
        allowUnconfirmedTxs: true,
        autoLockTimer: '5m',
        enableMPMA: false,
        enableAdvancedBroadcasts: false,
        enableAdvancedBetting: false,
        transactionDryRun: false,
        pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'],
        counterpartyApiBase: 'https://api.counterparty.io:4000',
        defaultOrderExpiration: 1000
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

    it('should handle missing id field in stored record', async () => {
      const settings = await getKeychainSettings();
      expect(settings).not.toHaveProperty('id');
      expect(Object.keys(settings)).not.toContain('id');
    });

    it('should handle all autoLockTimer migration scenarios', async () => {
      // Test 1m migration
      await addRecord({ id: 'keychain-settings', autoLockTimeout: 1 * 60 * 1000 });
      await clearAllRecords();
      await addRecord({ id: 'keychain-settings', autoLockTimeout: 1 * 60 * 1000 });
      let settings = await getKeychainSettings();
      expect(settings.autoLockTimer).toBe('1m');

      // Test 30m migration
      await clearAllRecords();
      await addRecord({ id: 'keychain-settings', autoLockTimeout: 30 * 60 * 1000 });
      settings = await getKeychainSettings();
      expect(settings.autoLockTimer).toBe('30m');
    });
  });

  describe('AutoLockTimer validation', () => {
    it('should validate all valid AutoLockTimer values', async () => {
      const validTimers: AutoLockTimer[] = ['1m', '5m', '15m', '30m'];
      
      for (const timer of validTimers) {
        await clearAllRecords();
        await updateKeychainSettings({ autoLockTimer: timer });
        const settings = await getKeychainSettings();
        expect(settings.autoLockTimer).toBe(timer);
        
        const expectedTimeout = {
          '1m': 1 * 60 * 1000,
          '5m': 5 * 60 * 1000,
          '15m': 15 * 60 * 1000,
          '30m': 30 * 60 * 1000,
        }[timer];
        expect(settings.autoLockTimeout).toBe(expectedTimeout);
      }
    });

    it('should handle timeout-timer consistency enforcement', async () => {
      // Set timer to 15m but timeout inconsistent
      await addRecord({ 
        id: 'keychain-settings', 
        ...DEFAULT_KEYCHAIN_SETTINGS,
        autoLockTimer: '15m', 
        autoLockTimeout: 5 * 60 * 1000 // Wrong timeout
      });
      
      const settings = await getKeychainSettings();
      expect(settings.autoLockTimer).toBe('15m');
      expect(settings.autoLockTimeout).toBe(15 * 60 * 1000); // Should be corrected
    });
  });

  describe('DEFAULT_KEYCHAIN_SETTINGS validation', () => {
    it('should have all required properties with correct types', () => {
      expect(DEFAULT_KEYCHAIN_SETTINGS).toHaveProperty('lastActiveWalletId');
      expect(DEFAULT_KEYCHAIN_SETTINGS).toHaveProperty('lastActiveAddress'); 
      expect(typeof DEFAULT_KEYCHAIN_SETTINGS.autoLockTimeout).toBe('number');
      expect(Array.isArray(DEFAULT_KEYCHAIN_SETTINGS.connectedWebsites)).toBe(true);
      expect(typeof DEFAULT_KEYCHAIN_SETTINGS.showHelpText).toBe('boolean');
      expect(typeof DEFAULT_KEYCHAIN_SETTINGS.analyticsAllowed).toBe('boolean');
      expect(typeof DEFAULT_KEYCHAIN_SETTINGS.allowUnconfirmedTxs).toBe('boolean');
      expect(['1m', '5m', '15m', '30m']).toContain(DEFAULT_KEYCHAIN_SETTINGS.autoLockTimer);
      expect(typeof DEFAULT_KEYCHAIN_SETTINGS.enableMPMA).toBe('boolean');
      expect(typeof DEFAULT_KEYCHAIN_SETTINGS.enableAdvancedBroadcasts).toBe('boolean');
      expect(typeof DEFAULT_KEYCHAIN_SETTINGS.transactionDryRun).toBe('boolean');
      expect(Array.isArray(DEFAULT_KEYCHAIN_SETTINGS.pinnedAssets)).toBe(true);
      expect(typeof DEFAULT_KEYCHAIN_SETTINGS.counterpartyApiBase).toBe('string');
    });

    it('should have consistent autoLockTimer and autoLockTimeout', () => {
      const expectedTimeout = {
        '1m': 1 * 60 * 1000,
        '5m': 5 * 60 * 1000,
        '15m': 15 * 60 * 1000,
        '30m': 30 * 60 * 1000,
      }[DEFAULT_KEYCHAIN_SETTINGS.autoLockTimer];
      
      expect(DEFAULT_KEYCHAIN_SETTINGS.autoLockTimeout).toBe(expectedTimeout);
    });

    it('should have valid counterpartyApiBase URL', () => {
      expect(() => new URL(DEFAULT_KEYCHAIN_SETTINGS.counterpartyApiBase)).not.toThrow();
      expect(DEFAULT_KEYCHAIN_SETTINGS.counterpartyApiBase).toMatch(/^https:/);
    });
  });

  describe('complex update scenarios', () => {
    it('should handle multiple simultaneous updates', async () => {
      const updates: Partial<KeychainSettings> = {
        showHelpText: true,
        analyticsAllowed: false,
        autoLockTimer: '30m',
        pinnedAssets: ['XCP'],
        connectedWebsites: ['example.com', 'test.org'],
      };
      
      await updateKeychainSettings(updates);
      const settings = await getKeychainSettings();
      
      expect(settings.showHelpText).toBe(true);
      expect(settings.analyticsAllowed).toBe(false);
      expect(settings.autoLockTimer).toBe('30m');
      expect(settings.autoLockTimeout).toBe(30 * 60 * 1000);
      expect(settings.pinnedAssets).toEqual(['XCP']);
      expect(settings.connectedWebsites).toEqual(['example.com', 'test.org']);
    });

    it('should handle partial updates without overwriting unspecified fields', async () => {
      // Initialize with custom settings
      await updateKeychainSettings({
        lastActiveWalletId: 'original-wallet',
        analyticsAllowed: false,
        pinnedAssets: ['CUSTOM1', 'CUSTOM2'],
      });
      
      // Update only one field
      await updateKeychainSettings({ showHelpText: true });
      
      const settings = await getKeychainSettings();
      expect(settings.showHelpText).toBe(true);
      expect(settings.lastActiveWalletId).toBe('original-wallet');
      expect(settings.analyticsAllowed).toBe(false);
      expect(settings.pinnedAssets).toEqual(['CUSTOM1', 'CUSTOM2']);
    });

    it('should handle empty updates gracefully', async () => {
      const originalSettings = await getKeychainSettings();
      await updateKeychainSettings({});
      const newSettings = await getKeychainSettings();
      expect(newSettings).toEqual(originalSettings);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle undefined/null values in partial updates', async () => {
      await updateKeychainSettings({
        lastActiveWalletId: undefined,
        lastActiveAddress: undefined,
      });
      
      const settings = await getKeychainSettings();
      expect(settings.lastActiveWalletId).toBeUndefined();
      expect(settings.lastActiveAddress).toBeUndefined();
    });

    it('should handle array mutations correctly', async () => {
      const customAssets = ['ASSET1', 'ASSET2'];
      await updateKeychainSettings({ pinnedAssets: customAssets });
      
      // Mutate the original array
      customAssets.push('ASSET3');
      
      const settings = await getKeychainSettings();
      expect(settings.pinnedAssets).toEqual(['ASSET1', 'ASSET2']); // Should not be affected
    });

    it('should preserve object reference integrity', async () => {
      const settings1 = await getKeychainSettings();
      const settings2 = await getKeychainSettings();
      
      // Modify one
      settings1.connectedWebsites.push('test.com');
      
      // Other should be unaffected
      expect(settings2.connectedWebsites).not.toContain('test.com');
    });
  });
});
