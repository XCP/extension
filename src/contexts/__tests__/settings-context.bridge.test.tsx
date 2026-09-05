import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider, useSettings } from '@/contexts/settings-context';
import { type AppSettings, DEFAULT_SETTINGS, getActiveSettings } from '@/core/settings';

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  onLock: undefined as undefined | ((message: { data: { locked: boolean } }) => void),
  onStorage: undefined as undefined | (() => void),
}));
vi.mock('@/services/walletService', () => ({ getWalletService: () => mocks }));
vi.mock('@/platform/fathom', () => ({ analytics: { track: vi.fn() } }));
vi.mock('webext-bridge/popup', () => ({
  onMessage: (_event: string, callback: typeof mocks.onLock) => {
    mocks.onLock = callback;
    return () => {};
  },
}));
vi.mock('@/platform/storage/walletStorage', () => ({
  watchKeychainRecord: (callback: () => void) => {
    mocks.onStorage = callback;
    return () => {};
  },
}));
const enabled = { ...DEFAULT_SETTINGS, enableDieselMinting: true, protectAlkanesUtxos: true };

beforeEach(() => {
  mocks.getSettings.mockReset().mockResolvedValue(enabled);
  mocks.updateSettings.mockReset().mockResolvedValue(undefined);
});

describe('popup settings bridge for core transaction code', () => {
  it('keeps a hydrated child mounted when it refreshes settings on mount', async () => {
    let resolveRefresh!: (settings: AppSettings) => void;
    mocks.getSettings.mockResolvedValueOnce(enabled).mockImplementationOnce(
      () => new Promise<AppSettings>(resolve => { resolveRefresh = resolve; }),
    );
    function RefreshingChild() {
      const { refreshSettings } = useSettings();
      useEffect(() => { void refreshSettings(); }, [refreshSettings]);
      return <div>Mounted transaction page</div>;
    }
    render(<SettingsProvider><RefreshingChild /></SettingsProvider>);
    await waitFor(() => expect(mocks.getSettings).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Mounted transaction page')).toBeVisible();
    await act(async () => { resolveRefresh(enabled); });
    expect(screen.getByText('Mounted transaction page')).toBeVisible();
    expect(mocks.getSettings).toHaveBeenCalledTimes(2);
  });

  it('withholds transaction pages after an initial read failure until retry loads saved settings', async () => {
    mocks.getSettings.mockRejectedValueOnce(new Error('RPC disconnected'));
    render(<SettingsProvider><div>Transaction form</div></SettingsProvider>);
    expect(screen.queryByText('Transaction form')).not.toBeInTheDocument();
    await screen.findByRole('alert');
    expect(screen.queryByText('Transaction form')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Transaction form');
    expect(getActiveSettings()).toEqual(enabled);
  });

  it('publishes hydrated settings and live optimistic changes, then restores the reader on unmount', async () => {
    const { result, unmount } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getActiveSettings()).toEqual(enabled);
    await act(async () => {
      const update = result.current.updateSettings({ enableDieselMinting: false, dieselMintMaxFeeRate: 5 });
      expect(getActiveSettings()).toMatchObject({ enableDieselMinting: false, protectAlkanesUtxos: true, dieselMintMaxFeeRate: 5 });
      await update;
    });
    unmount();
    expect(getActiveSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps protection enabled when mining is enabled optimistically', async () => {
    mocks.getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.updateSettings({ enableDieselMinting: true }); });
    expect(getActiveSettings()).toMatchObject({ enableDieselMinting: true, protectAlkanesUtxos: true });
  });

  it('publishes authoritative rollback after a rejected update', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mocks.updateSettings.mockRejectedValueOnce(new Error('persist failed'));
    await act(async () => {
      await expect(result.current.updateSettings({ dieselMintMaxFeeRate: 5 })).rejects.toThrow('persist failed');
    });
    expect(getActiveSettings().dieselMintMaxFeeRate).toBe(enabled.dieselMintMaxFeeRate);
  });

  it('publishes changes read from another surface without remounting', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mocks.getSettings.mockResolvedValue({ ...enabled, dieselMintMaxFeeRate: 7 });
    act(() => mocks.onStorage!());
    await waitFor(() => expect(getActiveSettings().dieselMintMaxFeeRate).toBe(7));
    expect(result.current.settings.dieselMintMaxFeeRate).toBe(7);
  });

  it('retains hydrated protections when a background refresh fails', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mocks.getSettings.mockRejectedValueOnce(new Error('background refresh failed'));
    await act(async () => { mocks.onStorage!(); });
    expect(getActiveSettings()).toEqual(enabled);
    expect(result.current.settings).toEqual(enabled);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears settings immediately on lock and ignores a stale pre-lock reply', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let resolveRead!: (settings: AppSettings) => void;
    mocks.getSettings.mockImplementationOnce(() => new Promise<AppSettings>(resolve => { resolveRead = resolve; }));
    let pendingRead!: Promise<void>;
    act(() => { pendingRead = result.current.refreshSettings(); });
    act(() => mocks.onLock!({ data: { locked: true } }));
    expect(getActiveSettings()).toEqual(DEFAULT_SETTINGS);
    await act(async () => { resolveRead(enabled); await pendingRead; });
    expect(getActiveSettings()).toEqual(DEFAULT_SETTINGS);
    expect(result.current.isLoading).toBe(false);
  });
});
