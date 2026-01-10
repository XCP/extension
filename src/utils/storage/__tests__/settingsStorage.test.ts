import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

// Mock encryption functions BEFORE importing settingsStorage
// These mocks make encryption transparent for testing
vi.mock('@/utils/encryption/settings', () => ({
  isSettingsKeyAvailable: vi.fn().mockResolvedValue(true),
  encryptSettings: vi.fn().mockImplementation(async (settings) =>
    JSON.stringify(settings)
  ),
  decryptSettings: vi.fn().mockImplementation(async (encrypted) =>
    JSON.parse(encrypted)
  ),
  encryptSettingsWithPassword: vi.fn().mockImplementation(async (settings, _password) =>
    JSON.stringify(settings)
  ),
  decryptSettingsWithPassword: vi.fn().mockImplementation(async (encrypted, _password) =>
    JSON.parse(encrypted)
  ),
  initializeSettingsKey: vi.fn().mockResolvedValue(undefined),
}));

// Import AFTER mocks are set up
import {
  getSettings,
  updateSettings,
  AppSettings,
  DEFAULT_SETTINGS,
  AutoLockTimer,
  PriceUnit,
  invalidateSettingsCache,
} from '../settingsStorage';

// Helper to set settings directly in storage (bypassing encryption)
// Note: wxt storage.defineItem('local:key') stores under key 'key' in chrome.storage.local
const setRawSettings = async (settings: Partial<AppSettings> | null) => {
  const storageKey = 'settingsRecord_test'; // Without 'local:' prefix for direct chrome storage
  if (settings === null) {
    await fakeBrowser.storage.local.remove(storageKey);
  } else {
    const fullSettings = { ...DEFAULT_SETTINGS, ...settings };
    await fakeBrowser.storage.local.set({
      [storageKey]: { encryptedSettings: JSON.stringify(fullSettings) },
    });
  }
};

describe('settingsStorage.ts', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    invalidateSettingsCache();
  });

  describe('getSettings', () => {
    it('should initialize with defaults if no settings exist', async () => {
      const settings = await getSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should return existing settings', async () => {
      const customSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
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
      await setRawSettings(customSettings);
      const settings = await getSettings();
      expect(settings.lastActiveWalletId).toBe('wallet1');
      expect(settings.showHelpText).toBe(true);
      expect(settings.autoLockTimer).toBe('15m');
    });

    it('should default invalid autoLockTimer to 5m', async () => {
      await setRawSettings({
        autoLockTimer: 'always' as any,
        autoLockTimeout: 0,
      });
      const settings = await getSettings();
      expect(settings.autoLockTimer).toBe('5m');
      expect(settings.autoLockTimeout).toBe(5 * 60 * 1000);
    });
  });

  describe('updateSettings', () => {
    it('should update settings and merge with existing values', async () => {
      await getSettings(); // Initialize with defaults
      const partialUpdate: Partial<AppSettings> = {
        showHelpText: true,
        autoLockTimer: '30m',
      };
      await updateSettings(partialUpdate);
      const settings = await getSettings();
      expect(settings.showHelpText).toBe(true);
      expect(settings.autoLockTimer).toBe('30m');
      expect(settings.autoLockTimeout).toBe(30 * 60 * 1000);
      expect(settings.analyticsAllowed).toBe(true); // Default preserved
    });

    it('should set autoLockTimeout based on autoLockTimer', async () => {
      await getSettings(); // Initialize
      await updateSettings({ autoLockTimer: '15m' });
      const settings = await getSettings();
      expect(settings.autoLockTimer).toBe('15m');
      expect(settings.autoLockTimeout).toBe(15 * 60 * 1000);
    });

    it('should preserve unrelated fields', async () => {
      await setRawSettings({
        lastActiveWalletId: 'wallet1',
        lastActiveAddress: 'addr1',
        connectedWebsites: ['example.com'],
        showHelpText: false,
      });
      await updateSettings({ showHelpText: true });
      const settings = await getSettings();
      expect(settings.showHelpText).toBe(true);
      expect(settings.lastActiveWalletId).toBe('wallet1');
      expect(settings.connectedWebsites).toEqual(['example.com']);
    });

    it('should handle updates when no settings exist yet', async () => {
      await updateSettings({ autoLockTimer: '30m', enableMPMA: true });
      const settings = await getSettings();
      expect(settings.autoLockTimer).toBe('30m');
      expect(settings.autoLockTimeout).toBe(30 * 60 * 1000);
      expect(settings.enableMPMA).toBe(true);
      expect(settings.showHelpText).toBe(false); // Default
    });
  });

  describe('edge cases', () => {
    it('should not throw on duplicate getSettings calls', async () => {
      await expect(getSettings()).resolves.toBeDefined();
      await expect(getSettings()).resolves.toBeDefined();
    });

    it('should handle missing id field in stored record', async () => {
      const settings = await getSettings();
      expect(settings).not.toHaveProperty('id');
      expect(Object.keys(settings)).not.toContain('id');
    });

    it('should return defaults for records without encryptedSettings', async () => {
      // Empty record (empty encryptedSettings simulates missing data)
      const storageKey = 'settingsRecord_test'; // Without 'local:' prefix
      await fakeBrowser.storage.local.set({
        [storageKey]: { encryptedSettings: '' },
      });
      const settings = await getSettings();
      expect(settings.autoLockTimer).toBe('5m');
      expect(settings.autoLockTimeout).toBe(5 * 60 * 1000);
    });
  });

  describe('AutoLockTimer validation', () => {
    it('should validate all valid AutoLockTimer values', async () => {
      const validTimers: AutoLockTimer[] = ['1m', '5m', '15m', '30m'];

      for (const timer of validTimers) {
        fakeBrowser.reset();
        invalidateSettingsCache();
        await updateSettings({ autoLockTimer: timer });
        const settings = await getSettings();
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
      // Set timer to 15m but timeout inconsistent - should be corrected
      await setRawSettings({
        autoLockTimer: '15m',
        autoLockTimeout: 5 * 60 * 1000, // Wrong timeout - should be corrected
      });

      const settings = await getSettings();
      expect(settings.autoLockTimer).toBe('15m');
      expect(settings.autoLockTimeout).toBe(15 * 60 * 1000); // Should be corrected
    });
  });

  describe('DEFAULT_SETTINGS validation', () => {
    it('should have all required properties with correct types', () => {
      expect(DEFAULT_SETTINGS).toHaveProperty('lastActiveWalletId');
      expect(DEFAULT_SETTINGS).toHaveProperty('lastActiveAddress');
      expect(typeof DEFAULT_SETTINGS.autoLockTimeout).toBe('number');
      expect(Array.isArray(DEFAULT_SETTINGS.connectedWebsites)).toBe(true);
      expect(typeof DEFAULT_SETTINGS.showHelpText).toBe('boolean');
      expect(typeof DEFAULT_SETTINGS.analyticsAllowed).toBe('boolean');
      expect(typeof DEFAULT_SETTINGS.allowUnconfirmedTxs).toBe('boolean');
      expect(['10s', '1m', '5m', '15m', '30m']).toContain(DEFAULT_SETTINGS.autoLockTimer);
      expect(typeof DEFAULT_SETTINGS.enableMPMA).toBe('boolean');
      expect(typeof DEFAULT_SETTINGS.enableAdvancedBroadcasts).toBe('boolean');
      expect(typeof DEFAULT_SETTINGS.transactionDryRun).toBe('boolean');
      expect(Array.isArray(DEFAULT_SETTINGS.pinnedAssets)).toBe(true);
      expect(typeof DEFAULT_SETTINGS.counterpartyApiBase).toBe('string');
      expect(DEFAULT_SETTINGS.preferences).toBeDefined();
      expect(['btc', 'sats', 'fiat']).toContain(DEFAULT_SETTINGS.preferences.unit);
      expect(['usd', 'eur', 'gbp', 'jpy', 'cad', 'aud', 'cny']).toContain(DEFAULT_SETTINGS.preferences.fiat);
    });

    it('should have consistent autoLockTimer and autoLockTimeout', () => {
      const expectedTimeout = {
        '10s': 10 * 1000,
        '1m': 1 * 60 * 1000,
        '5m': 5 * 60 * 1000,
        '15m': 15 * 60 * 1000,
        '30m': 30 * 60 * 1000,
      }[DEFAULT_SETTINGS.autoLockTimer];

      expect(DEFAULT_SETTINGS.autoLockTimeout).toBe(expectedTimeout);
    });

    it('should have valid counterpartyApiBase URL', () => {
      expect(() => new URL(DEFAULT_SETTINGS.counterpartyApiBase)).not.toThrow();
      expect(DEFAULT_SETTINGS.counterpartyApiBase).toMatch(/^https:/);
    });
  });

  describe('complex update scenarios', () => {
    it('should handle multiple simultaneous updates', async () => {
      await getSettings(); // Initialize first
      const updates: Partial<AppSettings> = {
        showHelpText: true,
        analyticsAllowed: false,
        autoLockTimer: '30m',
        pinnedAssets: ['XCP'],
        connectedWebsites: ['example.com', 'test.org'],
      };

      await updateSettings(updates);
      const settings = await getSettings();

      expect(settings.showHelpText).toBe(true);
      expect(settings.analyticsAllowed).toBe(false);
      expect(settings.autoLockTimer).toBe('30m');
      expect(settings.autoLockTimeout).toBe(30 * 60 * 1000);
      expect(settings.pinnedAssets).toEqual(['XCP']);
      expect(settings.connectedWebsites).toEqual(['example.com', 'test.org']);
    });

    it('should handle partial updates without overwriting unspecified fields', async () => {
      // Initialize with custom settings
      await updateSettings({
        lastActiveWalletId: 'original-wallet',
        analyticsAllowed: false,
        pinnedAssets: ['CUSTOM1', 'CUSTOM2'],
      });

      // Update only one field
      await updateSettings({ showHelpText: true });

      const settings = await getSettings();
      expect(settings.showHelpText).toBe(true);
      expect(settings.lastActiveWalletId).toBe('original-wallet');
      expect(settings.analyticsAllowed).toBe(false);
      expect(settings.pinnedAssets).toEqual(['CUSTOM1', 'CUSTOM2']);
    });

    it('should handle empty updates gracefully', async () => {
      const originalSettings = await getSettings();
      await updateSettings({});
      const newSettings = await getSettings();
      expect(newSettings).toEqual(originalSettings);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle undefined/null values in partial updates', async () => {
      await getSettings(); // Initialize first
      await updateSettings({
        lastActiveWalletId: undefined,
        lastActiveAddress: undefined,
      });

      const settings = await getSettings();
      expect(settings.lastActiveWalletId).toBeUndefined();
      expect(settings.lastActiveAddress).toBeUndefined();
    });

    it('should handle array mutations correctly', async () => {
      const customAssets = ['ASSET1', 'ASSET2'];
      await updateSettings({ pinnedAssets: customAssets });

      // Mutate the original array
      customAssets.push('ASSET3');

      const settings = await getSettings();
      expect(settings.pinnedAssets).toEqual(['ASSET1', 'ASSET2']); // Should not be affected
    });

    it('should preserve object reference integrity', async () => {
      await getSettings(); // Initialize first
      const settings1 = await getSettings();
      const settings2 = await getSettings();

      // Modify one (local mutation - shouldn't affect storage)
      settings1.connectedWebsites.push('test.com');

      // Other should be unaffected since settings1 is a deep copy
      expect(settings2.connectedWebsites).not.toContain('test.com');
    });
  });

  describe('preferences validation', () => {
    it('should have btc as the default unit and usd as default fiat', () => {
      expect(DEFAULT_SETTINGS.preferences.unit).toBe('btc');
      expect(DEFAULT_SETTINGS.preferences.fiat).toBe('usd');
    });

    it('should validate all valid PriceUnit values', async () => {
      const validUnits: PriceUnit[] = ['btc', 'sats', 'fiat'];

      for (const unit of validUnits) {
        fakeBrowser.reset();
        invalidateSettingsCache();
        await updateSettings({ preferences: { unit } });
        const settings = await getSettings();
        expect(settings.preferences.unit).toBe(unit);
      }
    });

    it('should default invalid preferences.unit to btc', async () => {
      await setRawSettings({
        preferences: { unit: 'invalid' as any, fiat: 'usd' },
      });

      const settings = await getSettings();
      expect(settings.preferences.unit).toBe('btc');
    });

    it('should default invalid preferences.fiat to usd', async () => {
      await setRawSettings({
        preferences: { unit: 'btc', fiat: 'invalid' as any },
      });

      const settings = await getSettings();
      expect(settings.preferences.fiat).toBe('usd');
    });

    it('should preserve preferences when updating other settings', async () => {
      await updateSettings({ preferences: { unit: 'sats', fiat: 'jpy' } });
      await updateSettings({ showHelpText: true });

      const settings = await getSettings();
      expect(settings.preferences.unit).toBe('sats');
      expect(settings.preferences.fiat).toBe('jpy');
      expect(settings.showHelpText).toBe(true);
    });

    it('should handle unit cycle: btc -> sats -> fiat -> btc', async () => {
      // Start with btc (default)
      let settings = await getSettings();
      expect(settings.preferences.unit).toBe('btc');

      // Update to sats
      await updateSettings({ preferences: { unit: 'sats' } });
      settings = await getSettings();
      expect(settings.preferences.unit).toBe('sats');

      // Update to fiat
      await updateSettings({ preferences: { unit: 'fiat' } });
      settings = await getSettings();
      expect(settings.preferences.unit).toBe('fiat');

      // Update back to btc
      await updateSettings({ preferences: { unit: 'btc' } });
      settings = await getSettings();
      expect(settings.preferences.unit).toBe('btc');
    });

    it('should deep merge preferences without overwriting other preference fields', async () => {
      // Set both unit and fiat
      await updateSettings({ preferences: { unit: 'sats', fiat: 'eur' } });

      // Update only unit
      await updateSettings({ preferences: { unit: 'btc' } });

      const settings = await getSettings();
      expect(settings.preferences.unit).toBe('btc');
      expect(settings.preferences.fiat).toBe('eur'); // Should be preserved
    });

    it('should validate all supported fiat currencies', async () => {
      const validCurrencies = ['usd', 'eur', 'gbp', 'jpy', 'cad', 'aud', 'cny'];

      for (const fiat of validCurrencies) {
        fakeBrowser.reset();
        invalidateSettingsCache();
        await updateSettings({ preferences: { fiat: fiat as any } });
        const settings = await getSettings();
        expect(settings.preferences.fiat).toBe(fiat);
      }
    });

    it('should handle missing preferences object gracefully', async () => {
      await setRawSettings({
        preferences: undefined as any,
      });

      const settings = await getSettings();
      expect(settings.preferences).toBeDefined();
      expect(settings.preferences.unit).toBe('btc');
      expect(settings.preferences.fiat).toBe('usd');
    });
  });
});
