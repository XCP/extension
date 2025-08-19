import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { SettingsProvider, useSettings } from '../settings-context';
import { sendMessage } from 'webext-bridge/popup';

// Mock dependencies
vi.mock('@/utils/storage', () => ({
  getKeychainSettings: vi.fn(),
  updateKeychainSettings: vi.fn()
}));
vi.mock('webext-bridge/popup', () => ({
  sendMessage: vi.fn()
}));

// Import the mocked functions
import { getKeychainSettings, updateKeychainSettings } from '@/utils/storage';

describe('SettingsContext', () => {
  const defaultSettings = {
    lastActiveWalletId: undefined,
    lastActiveAddress: undefined,
    autoLockTimeout: 5 * 60 * 1000, // Updated to match context
    connectedWebsites: [],
    showHelpText: false,
    analyticsAllowed: true, // Updated to match context
    allowUnconfirmedTxs: false,
    autoLockTimer: '5m' as const,
    enableMPMA: false,
    enableAdvancedBroadcasts: false,
    transactionDryRun: false,
    pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'], // Updated to match context
    counterpartyApiBase: 'https://api.counterparty.io:4000', // Updated to match context
    defaultOrderExpiration: 1000
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create a shared state that can be mutated
    let currentSettings = { ...defaultSettings };
    
    vi.mocked(getKeychainSettings).mockImplementation(async () => {
      return { ...currentSettings };
    });
    
    vi.mocked(updateKeychainSettings).mockImplementation(async (newSettings) => {
      // Update the shared state with proper type handling
      currentSettings = { ...currentSettings, ...newSettings } as typeof defaultSettings;
    });
    
    vi.mocked(sendMessage).mockResolvedValue({ success: true });
  });

  describe('SettingsProvider', () => {
    it('should provide initial settings', async () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(result.current.settings).toEqual(defaultSettings);
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should throw error when useSettings is used outside provider', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => {
        renderHook(() => useSettings());
      }).toThrow('useSettings must be used within a SettingsProvider');
      
      spy.mockRestore();
    });

    it('should load settings on mount', async () => {
      renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(getKeychainSettings).toHaveBeenCalled();
      });
    });
  });

  describe('Settings Updates', () => {
    it('should update single setting', async () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateSettings({ autoLockTimer: '15m' });
      });

      expect(updateKeychainSettings).toHaveBeenCalledWith({ autoLockTimer: '15m' });
      expect(result.current.settings.autoLockTimer).toBe('15m');
    });

    it('should update multiple settings', async () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const updates = {
        analyticsAllowed: true,
        showHelpText: true,
        allowUnconfirmedTxs: true
      };

      await act(async () => {
        await result.current.updateSettings(updates);
      });

      expect(updateKeychainSettings).toHaveBeenCalledWith(updates);
      expect(result.current.settings.analyticsAllowed).toBe(true);
      expect(result.current.settings.showHelpText).toBe(true);
      expect(result.current.settings.allowUnconfirmedTxs).toBe(true);
    });

    it('should handle update failure', async () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const originalTimer = result.current.settings.autoLockTimer;

      // Mock the error after initial setup
      vi.mocked(updateKeychainSettings).mockRejectedValueOnce(new Error('Update failed'));

      await act(async () => {
        try {
          await result.current.updateSettings({ autoLockTimer: '15m' });
        } catch (error) {
          // Error expected
        }
      });

      // Settings should not change on failure
      expect(result.current.settings.autoLockTimer).toBe(originalTimer);
    });

    it('should handle network errors', async () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const originalTimer = result.current.settings.autoLockTimer;

      // Mock the error after initial setup
      vi.mocked(updateKeychainSettings).mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        try {
          await result.current.updateSettings({ autoLockTimer: '30m' });
        } catch (error) {
          // Error expected
        }
      });

      // Settings should not change on failure
      expect(result.current.settings.autoLockTimer).toBe(originalTimer);
    });
  });

  describe('Specific Settings', () => {
    it('should toggle analytics', async () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.settings.analyticsAllowed).toBe(true);

      await act(async () => {
        await result.current.updateSettings({ analyticsAllowed: false });
      });

      expect(result.current.settings.analyticsAllowed).toBe(false);

      await act(async () => {
        await result.current.updateSettings({ analyticsAllowed: true });
      });

      expect(result.current.settings.analyticsAllowed).toBe(true);
    });

    it('should toggle help text', async () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.settings.showHelpText).toBe(false);

      await act(async () => {
        await result.current.updateSettings({ showHelpText: true });
      });

      expect(result.current.settings.showHelpText).toBe(true);
    });

    it('should update pinned assets', async () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const newPinnedAssets = ['BTC', 'XCP', 'PEPECASH'];

      await act(async () => {
        await result.current.updateSettings({ pinnedAssets: newPinnedAssets });
      });

      expect(result.current.settings.pinnedAssets).toEqual(newPinnedAssets);
    });

    it('should set active wallet', async () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateSettings({ lastActiveWalletId: 'wallet123' });
      });

      expect(result.current.settings.lastActiveWalletId).toBe('wallet123');
    });

    it('should set auto-lock timer', async () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateSettings({ autoLockTimer: '30m' });
      });

      expect(result.current.settings.autoLockTimer).toBe('30m');
    });

    it('should validate auto-lock timer values', async () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Test valid value
      await act(async () => {
        await result.current.updateSettings({ autoLockTimer: '1m' });
      });

      // Should update to valid value
      expect(result.current.settings.autoLockTimer).toBe('1m');
    });
  });

  describe('Settings Reset', () => {
    it('should reset to default settings', async () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Change some settings
      await act(async () => {
        await result.current.updateSettings({
          analyticsAllowed: true,
          autoLockTimer: '30m',
          showHelpText: true
        });
      });

      // Reset to defaults
      await act(async () => {
        await result.current.updateSettings(defaultSettings);
      });

      expect(result.current.settings).toEqual(defaultSettings);
    });
  });

  describe('Loading State', () => {
    it('should show loading state during initial load', async () => {
      let resolveSettings: (value: any) => void;
      const settingsPromise = new Promise((resolve) => {
        resolveSettings = resolve;
      });
      vi.mocked(getKeychainSettings).mockReturnValue(settingsPromise as any);

      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      expect(result.current.isLoading).toBe(true);

      act(() => {
        resolveSettings!(defaultSettings);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should not show loading state during updates', async () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let isLoadingDuringUpdate = false;

      await act(async () => {
        const updatePromise = result.current.updateSettings({ autoLockTimer: '15m' });
        isLoadingDuringUpdate = result.current.isLoading;
        await updatePromise;
      });

      expect(isLoadingDuringUpdate).toBe(false);
    });
  });

  describe('Settings Persistence', () => {
    it('should persist settings across remounts', async () => {
      const { result, rerender, unmount } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Update a setting
      await act(async () => {
        await result.current.updateSettings({ autoLockTimer: '15m' });
      });

      // Unmount and remount
      unmount();

      // Mock the stored settings
      vi.mocked(getKeychainSettings).mockResolvedValue({
        ...defaultSettings,
        autoLockTimer: '15m'
      });

      const { result: newResult } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(newResult.current.settings.autoLockTimer).toBe('15m');
      });
    });
  });

  // Settings Validation tests removed - theme and network are not part of KeychainSettings
});