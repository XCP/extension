import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onMessage } from 'webext-bridge/popup';
import { apiClient } from '@/core/api/client';
import { clearApiCache, fetchPoolQuote } from '@/core/counterparty/api';
import { type AppSettings, DEFAULT_SETTINGS, getActiveSettings, setSettingsProvider } from '@/core/settings';
import { watchKeychainRecord } from '@/platform/storage/walletStorage';
import { SettingsProvider, useSettings } from '../settings-context';

const service = vi.hoisted(() => ({ getSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock('@/services/walletService', () => ({ getWalletService: () => service }));
vi.mock('@/platform/fathom', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/platform/storage/walletStorage', () => ({ watchKeychainRecord: vi.fn(() => () => {}) }));
vi.mock('webext-bridge/popup', () => ({ onMessage: vi.fn(() => () => {}) }));
vi.mock('@/core/api/client', () => ({ apiClient: { get: vi.fn() } }));

const nodeA = 'https://node-a.example';
const nodeB = 'https://node-b.example';
const path = '/v2/pools/XCP/PEPECASH/quote';
let stored: AppSettings;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function quoteAt(base: string) {
  await fetchPoolQuote('XCP', 'PEPECASH', '100000000');
  expect(apiClient.get).toHaveBeenLastCalledWith(`${base}${path}`, { params: { quantity: '100000000' } });
}

function lock() {
  const callback = vi.mocked(onMessage).mock.calls.find(([name]) => name === 'keychainLocked')?.[1];
  if (!callback) throw new Error('Missing lock listener');
  callback({
    sender: { context: 'background', tabId: -1 },
    id: 'keychainLocked',
    timestamp: Date.now(),
    data: { locked: true },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearApiCache();
  setSettingsProvider(() => DEFAULT_SETTINGS);
  stored = { ...DEFAULT_SETTINGS, counterpartyApiBase: nodeA };
  service.getSettings.mockImplementation(async () => ({ ...stored }));
  service.updateSettings.mockImplementation(async (updates: Partial<AppSettings>) => {
    stored = { ...stored, ...updates };
  });
  vi.mocked(apiClient.get).mockResolvedValue({
    data: { result: { estimated_output: '1234', pool_output: '1234' } }, status: 200,
  } as never);
});

describe('foreground Core requests use confirmed settings', () => {
  it('publishes the loaded custom node before a child request and does not refetch on display changes', async () => {
    function Quote() {
      useEffect(() => { void fetchPoolQuote('XCP', 'PEPECASH', '100000000'); }, []);
      return null;
    }
    function Ready({ children }: { children: ReactNode }) {
      const { isLoading } = useSettings();
      return isLoading ? null : <>{children}<Quote /></>;
    }
    const { result } = renderHook(() => useSettings(), {
      wrapper: ({ children }) => <SettingsProvider><Ready>{children}</Ready></SettingsProvider>,
    });
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));
    expect(apiClient.get).toHaveBeenLastCalledWith(`${nodeA}${path}`, { params: { quantity: '100000000' } });
    const reads = service.getSettings.mock.calls.length;
    await act(async () => result.current.updateSettings({ language: 'ja', numberLocale: 'de-DE', fiat: 'jpy' }));
    expect(result.current.settings).toMatchObject({ language: 'ja', numberLocale: 'de-DE', fiat: 'jpy' });
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(service.getSettings).toHaveBeenCalledTimes(reads);
    expect(getActiveSettings().counterpartyApiBase).toBe(nodeA);
  });

  it('keeps the previous node and security flags while a save is pending, then publishes its success', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const save = deferred<void>();
    service.updateSettings.mockReturnValueOnce(save.promise);
    let saving!: Promise<void>;
    act(() => { saving = result.current.updateSettings({ counterpartyApiBase: nodeB, strictTransactionVerification: false }); });
    expect(result.current.settings.counterpartyApiBase).toBe(nodeB); // Existing optimistic UI.
    expect(getActiveSettings().strictTransactionVerification).toBe(true);
    await quoteAt(nodeA);
    await act(async () => { save.resolve(); await saving; });
    expect(getActiveSettings().strictTransactionVerification).toBe(false);
    await quoteAt(nodeB);
  });

  it('never publishes a failed optimistic custom-node or security-setting change', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const save = deferred<void>();
    service.updateSettings.mockReturnValueOnce(save.promise);
    let saving!: Promise<void>;
    act(() => { saving = result.current.updateSettings({ counterpartyApiBase: nodeB, strictTransactionVerification: false }); });
    await quoteAt(nodeA);
    await act(async () => { save.reject(new Error('Storage failed')); await expect(saving).rejects.toThrow('Storage failed'); });
    expect(result.current.settings.counterpartyApiBase).toBe(nodeA);
    expect(getActiveSettings().strictTransactionVerification).toBe(true);
    await quoteAt(nodeA);
  });

  it('uses a confirmed settings change from another surface without raising the loading flag', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      stored = { ...stored, counterpartyApiBase: nodeB };
      vi.mocked(watchKeychainRecord).mock.calls[0]![0]();
    });
    await waitFor(() => expect(getActiveSettings().counterpartyApiBase).toBe(nodeB));
    expect(result.current.isLoading).toBe(false);
    await quoteAt(nodeB);
  });

  it.each(['read', 'save'] as const)('resets on lock and ignores a pre-lock %s reply', async operation => {
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const pending = deferred<AppSettings | void>();
    let work!: Promise<void>;
    if (operation === 'read') {
      service.getSettings.mockReturnValueOnce(pending.promise);
      act(() => { work = result.current.refreshSettings(); });
    } else {
      service.updateSettings.mockReturnValueOnce(pending.promise);
      act(() => { work = result.current.updateSettings({ counterpartyApiBase: nodeB }); });
    }
    await act(async () => lock());
    await quoteAt(DEFAULT_SETTINGS.counterpartyApiBase);
    await act(async () => { pending.resolve({ ...stored, counterpartyApiBase: nodeB }); await work; });
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.current.isLoading).toBe(false);
    await quoteAt(DEFAULT_SETTINGS.counterpartyApiBase);
  });

  it('ignores an older read after a newer successful save', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const read = deferred<AppSettings>();
    service.getSettings.mockReturnValueOnce(read.promise);
    let loading!: Promise<void>;
    act(() => { loading = result.current.refreshSettings(); });
    await act(async () => result.current.updateSettings({ counterpartyApiBase: nodeB }));
    await act(async () => { read.resolve({ ...stored, counterpartyApiBase: nodeA }); await loading; });
    expect(result.current.settings.counterpartyApiBase).toBe(nodeB);
    expect(result.current.isLoading).toBe(false);
    await quoteAt(nodeB);
  });

  it('does not let a lock reset queued behind an old watcher read erase freshly loaded settings', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: SettingsProvider });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const oldRead = deferred<AppSettings>();
    service.getSettings.mockReturnValueOnce(oldRead.promise);
    act(() => { vi.mocked(watchKeychainRecord).mock.calls[0]![0](); });
    await waitFor(() => expect(service.getSettings).toHaveBeenCalledTimes(2));

    await act(async () => lock());
    stored = { ...stored, counterpartyApiBase: nodeB, language: 'ja' };
    await act(async () => result.current.refreshSettings());
    expect(result.current.settings).toMatchObject({ counterpartyApiBase: nodeB, language: 'ja' });
    await quoteAt(nodeB);

    await act(async () => {
      oldRead.resolve({ ...stored, counterpartyApiBase: nodeA, language: 'en' });
      await oldRead.promise;
    });
    expect(result.current.settings).toMatchObject({ counterpartyApiBase: nodeB, language: 'ja' });
    expect(result.current.isLoading).toBe(false);
    await quoteAt(nodeB);
  });

  it('survives StrictMode setup and drops settings on unmount without late restoration', async () => {
    const { result, unmount } = renderHook(() => useSettings(), {
      wrapper: ({ children }) => <StrictMode><SettingsProvider>{children}</SettingsProvider></StrictMode>,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await quoteAt(nodeA);
    const read = deferred<AppSettings>();
    service.getSettings.mockReturnValueOnce(read.promise);
    let loading!: Promise<void>;
    act(() => { loading = result.current.refreshSettings(); });
    unmount();
    read.resolve({ ...stored, counterpartyApiBase: nodeB });
    await loading;
    await quoteAt(DEFAULT_SETTINGS.counterpartyApiBase);
  });
});
