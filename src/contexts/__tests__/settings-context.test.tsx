import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { AppSettings } from '@/core/settings';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { saveKeychainRecord } from '@/platform/storage/walletStorage';
import { SettingsProvider, useSettings } from '../settings-context';

// Mock walletService
const mockGetSettings = vi.fn();
const mockUpdateSettings = vi.fn();

vi.mock('@/services/walletService', () => ({
  getWalletService: () => ({
    getSettings: () => mockGetSettings(),
    updateSettings: (updates: Partial<AppSettings>) => mockUpdateSettings(updates),
  }),
}));

vi.mock('webext-bridge/popup', () => ({
  sendMessage: vi.fn(),
  onMessage: vi.fn().mockReturnValue(() => {}), // Return unsubscribe function
}));

describe('SettingsContext', () => {
  const defaultSettings = DEFAULT_SETTINGS;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a shared state that can be mutated
    let currentSettings = { ...defaultSettings };

    mockGetSettings.mockImplementation(async () => {
      return { ...currentSettings };
    });

    mockUpdateSettings.mockImplementation(async (newSettings: Partial<AppSettings>) => {
      // Update the shared state with proper type handling
      currentSettings = { ...currentSettings, ...newSettings } as typeof defaultSettings;
    });
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
        expect(mockGetSettings).toHaveBeenCalled();
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

      expect(mockUpdateSettings).toHaveBeenCalledWith({ autoLockTimer: '15m' });
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

      expect(mockUpdateSettings).toHaveBeenCalledWith(updates);
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
      mockUpdateSettings.mockRejectedValueOnce(new Error('Update failed'));

      await act(async () => {
        try {
          await result.current.updateSettings({ autoLockTimer: '15m' });
        } catch (_error) {
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
      mockUpdateSettings.mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        try {
          await result.current.updateSettings({ autoLockTimer: '30m' });
        } catch (_error) {
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
    it('should complete loading after mount', async () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.settings).toEqual(defaultSettings);
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
      const { result, unmount } = renderHook(() => useSettings(), {
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
      mockGetSettings.mockResolvedValue({
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
});

describe('SettingsContext — settings changed in another surface', () => {
  /**
   * Settings live inside the keychain record, so a change made anywhere lands as a write to it.
   * The popup and the side panel are separate documents, each holding whatever they read on mount;
   * without this the one merely sitting open goes stale.
   */
  const record = (data: string) => ({
    version: 1 as const,
    kdf: { iterations: 600000 },
    salt: 'dGVzdC1zYWx0',
    encryptedKeychain: data,
  });

  let stored: AppSettings;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeBrowser.reset();
    stored = { ...DEFAULT_SETTINGS };
    mockGetSettings.mockImplementation(async () => stored);
  });

  it('re-reads settings when the keychain record changes', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settings.connectedWebsites).toEqual([]);

    // What another window's approval does, as this one sees it.
    await act(async () => {
      stored = { ...stored, connectedWebsites: ['https://elsewhere.org'] };
      await saveKeychainRecord(record('changed-elsewhere'));
    });

    await waitFor(() => {
      expect(result.current.settings.connectedWebsites).toEqual(['https://elsewhere.org']);
    });
  });

  it('does not raise the loading flag while re-reading', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const loadingSeen: boolean[] = [];
    const watching = setInterval(() => loadingSeen.push(result.current.isLoading), 1);

    await act(async () => {
      stored = { ...stored, connectedWebsites: ['https://elsewhere.org'] };
      await saveKeychainRecord(record('changed-again'));
    });
    await waitFor(() => {
      expect(result.current.settings.connectedWebsites).toHaveLength(1);
    });
    clearInterval(watching);

    // Every surface consuming isLoading renders a spinner from it. Raising it for a change made in
    // another window would flash all of them.
    expect(loadingSeen).not.toContain(true);
  });

  it('stops watching when the provider unmounts', async () => {
    const { result, unmount } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    unmount();
    const callsBefore = mockGetSettings.mock.calls.length;

    await act(async () => {
      await saveKeychainRecord(record('after-unmount'));
    });

    expect(mockGetSettings.mock.calls.length).toBe(callsBefore);
  });
});
