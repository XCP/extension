import { describe, it, expect, beforeEach, vi } from 'vitest';
import { settingsManager } from '../settingsManager';
import type { KeychainSettings } from '@/utils/storage/settingsStorage';

// Mock the storage functions
vi.mock('@/utils/storage', () => ({
  getKeychainSettings: vi.fn(),
  updateKeychainSettings: vi.fn(),
}));

// Dynamic imports to avoid top-level await
import * as storageModule from '@/utils/storage';
import { DEFAULT_KEYCHAIN_SETTINGS } from '@/utils/storage/settingsStorage';

const mockGetKeychainSettings = vi.mocked(storageModule.getKeychainSettings);
const mockUpdateKeychainSettings = vi.mocked(storageModule.updateKeychainSettings);

describe('SettingsManager', () => {
  // Use real default settings with some test overrides
  const mockSettings = {
    ...DEFAULT_KEYCHAIN_SETTINGS,
    lastActiveWalletId: 'wallet-123',
    lastActiveAddress: 'bc1qtest123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the internal state by setting settings to null
    // @ts-ignore - accessing private property for testing
    settingsManager.settings = null;
    mockGetKeychainSettings.mockResolvedValue(mockSettings);
  });

  describe('loadSettings', () => {
    it('should load settings from storage and cache them', async () => {
      const settings = await settingsManager.loadSettings();

      expect(mockGetKeychainSettings).toHaveBeenCalledOnce();
      expect(settings).toEqual(mockSettings);
      expect(settingsManager.getSettings()).toEqual(mockSettings);
    });

    it('should update cached settings when called multiple times', async () => {
      const firstSettings = { ...mockSettings, showHelpText: true };
      const secondSettings = { ...mockSettings, showHelpText: false };

      mockGetKeychainSettings
        .mockResolvedValueOnce(firstSettings)
        .mockResolvedValueOnce(secondSettings);

      const first = await settingsManager.loadSettings();
      expect(first.showHelpText).toBe(true);
      expect(settingsManager.getSettings()?.showHelpText).toBe(true);

      const second = await settingsManager.loadSettings();
      expect(second.showHelpText).toBe(false);
      expect(settingsManager.getSettings()?.showHelpText).toBe(false);

      expect(mockGetKeychainSettings).toHaveBeenCalledTimes(2);
    });

    it('should handle empty settings object', async () => {
      const emptySettings = {} as KeychainSettings;
      mockGetKeychainSettings.mockResolvedValue(emptySettings);

      const settings = await settingsManager.loadSettings();

      expect(settings).toEqual(emptySettings);
      expect(settingsManager.getSettings()).toEqual(emptySettings);
    });

    it('should handle storage errors gracefully', async () => {
      const error = new Error('Storage error');
      mockGetKeychainSettings.mockRejectedValue(error);

      await expect(settingsManager.loadSettings()).rejects.toThrow('Storage error');
      expect(settingsManager.getSettings()).toBeNull();
    });
  });

  describe('updateSettings', () => {
    beforeEach(async () => {
      // Initialize with some settings
      await settingsManager.loadSettings();
    });

    it('should update settings and refresh cached data', async () => {
      const partialUpdate = { 
        showHelpText: false, 
        analyticsAllowed: true 
      };
      const updatedSettings = { 
        ...mockSettings, 
        ...partialUpdate 
      };

      mockGetKeychainSettings.mockResolvedValue(updatedSettings);

      await settingsManager.updateSettings(partialUpdate);

      expect(mockUpdateKeychainSettings).toHaveBeenCalledOnce();
      expect(mockUpdateKeychainSettings).toHaveBeenCalledWith(partialUpdate);
      expect(mockGetKeychainSettings).toHaveBeenCalledTimes(2); // Once in beforeEach, once in updateSettings
      expect(settingsManager.getSettings()).toEqual(updatedSettings);
    });

    it('should handle single property updates', async () => {
      const singleUpdate = { autoLockTimer: '1m' as const };
      const updatedSettings = { ...mockSettings, ...singleUpdate };

      mockGetKeychainSettings.mockResolvedValue(updatedSettings);

      await settingsManager.updateSettings(singleUpdate);

      expect(mockUpdateKeychainSettings).toHaveBeenCalledWith(singleUpdate);
      expect(settingsManager.getSettings()?.autoLockTimer).toBe('1m');
    });

    it('should handle array property updates', async () => {
      const arrayUpdate = { 
        pinnedAssets: ['BTC', 'ETH', 'DOGE'],
        connectedWebsites: ['https://newsite.com'] 
      };
      const updatedSettings = { ...mockSettings, ...arrayUpdate };

      mockGetKeychainSettings.mockResolvedValue(updatedSettings);

      await settingsManager.updateSettings(arrayUpdate);

      expect(mockUpdateKeychainSettings).toHaveBeenCalledWith(arrayUpdate);
      expect(settingsManager.getSettings()?.pinnedAssets).toEqual(['BTC', 'ETH', 'DOGE']);
      expect(settingsManager.getSettings()?.connectedWebsites).toEqual(['https://newsite.com']);
    });

    it('should handle empty partial updates', async () => {
      const emptyUpdate = {};
      mockGetKeychainSettings.mockResolvedValue(mockSettings);

      await settingsManager.updateSettings(emptyUpdate);

      expect(mockUpdateKeychainSettings).toHaveBeenCalledWith(emptyUpdate);
      expect(settingsManager.getSettings()).toEqual(mockSettings);
    });

    it('should handle undefined values in partial updates', async () => {
      const updateWithUndefined = { 
        lastActiveWalletId: undefined,
        showHelpText: false 
      };
      const expectedSettings = { 
        ...mockSettings, 
        showHelpText: false 
      };

      mockGetKeychainSettings.mockResolvedValue(expectedSettings);

      await settingsManager.updateSettings(updateWithUndefined);

      expect(mockUpdateKeychainSettings).toHaveBeenCalledWith(updateWithUndefined);
    });

    it('should handle update storage errors', async () => {
      const error = new Error('Update storage error');
      mockUpdateKeychainSettings.mockRejectedValue(error);

      const partialUpdate = { showHelpText: false };

      await expect(settingsManager.updateSettings(partialUpdate)).rejects.toThrow('Update storage error');
      
      // Settings should remain unchanged on error
      expect(settingsManager.getSettings()).toEqual(mockSettings);
    });

    it('should handle errors when refreshing after update', async () => {
      const partialUpdate = { showHelpText: false };
      mockUpdateKeychainSettings.mockResolvedValue(undefined);
      
      // First call succeeds (from beforeEach), second call fails
      mockGetKeychainSettings.mockRejectedValueOnce(new Error('Refresh error'));

      await expect(settingsManager.updateSettings(partialUpdate)).rejects.toThrow('Refresh error');
      
      expect(mockUpdateKeychainSettings).toHaveBeenCalledWith(partialUpdate);
    });
  });

  describe('getSettings', () => {
    it('should return null when no settings are loaded', () => {
      // Ensure settings are cleared for this specific test
      // @ts-ignore - accessing private property for testing
      settingsManager.settings = null;
      expect(settingsManager.getSettings()).toBeNull();
    });

    it('should return cached settings after loading', async () => {
      await settingsManager.loadSettings();
      
      const settings = settingsManager.getSettings();
      expect(settings).toEqual(mockSettings);
      expect(settings).toBe(settingsManager.getSettings()); // Same reference
    });

    it('should return updated settings after update', async () => {
      await settingsManager.loadSettings();
      
      const updatedSettings = { ...mockSettings, showHelpText: false };
      mockGetKeychainSettings.mockResolvedValue(updatedSettings);
      
      await settingsManager.updateSettings({ showHelpText: false });
      
      const settings = settingsManager.getSettings();
      expect(settings?.showHelpText).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should handle full settings lifecycle', async () => {
      // Start with no settings
      expect(settingsManager.getSettings()).toBeNull();

      // Load initial settings
      const initialSettings = await settingsManager.loadSettings();
      expect(initialSettings).toEqual(mockSettings);
      expect(settingsManager.getSettings()).toEqual(mockSettings);

      // Update some settings
      const updates = { 
        showHelpText: false, 
        autoLockTimer: '15m' as const,
        pinnedAssets: ['BTC', 'DOGE'] 
      };
      const finalSettings = { ...mockSettings, ...updates };
      mockGetKeychainSettings.mockResolvedValue(finalSettings);

      await settingsManager.updateSettings(updates);

      expect(settingsManager.getSettings()).toEqual(finalSettings);
      expect(mockUpdateKeychainSettings).toHaveBeenCalledWith(updates);
    });

    it('should handle multiple rapid updates', async () => {
      await settingsManager.loadSettings();

      const update1 = { showHelpText: false };
      const update2 = { analyticsAllowed: true };
      const update3 = { autoLockTimer: '30m' as const };

      const settings1 = { ...mockSettings, ...update1 };
      const settings2 = { ...settings1, ...update2 };
      const settings3 = { ...settings2, ...update3 };

      mockGetKeychainSettings
        .mockResolvedValueOnce(settings1)
        .mockResolvedValueOnce(settings2)
        .mockResolvedValueOnce(settings3);

      await settingsManager.updateSettings(update1);
      await settingsManager.updateSettings(update2);
      await settingsManager.updateSettings(update3);

      expect(mockUpdateKeychainSettings).toHaveBeenCalledTimes(3);
      expect(settingsManager.getSettings()).toEqual(settings3);
    });

    it('should maintain state consistency after mixed operations', async () => {
      // Load settings
      await settingsManager.loadSettings();
      expect(settingsManager.getSettings()?.showHelpText).toBe(false); // Real default is false

      // Update settings
      const updatedSettings = { ...mockSettings, showHelpText: true };
      mockGetKeychainSettings.mockResolvedValue(updatedSettings);
      await settingsManager.updateSettings({ showHelpText: true });
      expect(settingsManager.getSettings()?.showHelpText).toBe(true);

      // Reload settings (simulating app restart)
      const reloadedSettings = { ...updatedSettings, analyticsAllowed: false };
      mockGetKeychainSettings.mockResolvedValue(reloadedSettings);
      await settingsManager.loadSettings();
      expect(settingsManager.getSettings()?.analyticsAllowed).toBe(false);
      expect(settingsManager.getSettings()?.showHelpText).toBe(true);
    });
  });
});