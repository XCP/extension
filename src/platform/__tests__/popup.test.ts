import { beforeEach, describe, expect, it, vi } from 'vitest';
import { awaitsContinuation, continuationUnlockPath, reusePopupWindow } from '@/platform/popup';

const BASE = 'chrome-extension://test/popup.html';

describe('reusePopupWindow', () => {
  const tabs = { query: vi.fn(), update: vi.fn() };
  const windows = { update: vi.fn(), remove: vi.fn() };

  beforeEach(() => {
    tabs.query.mockReset();
    tabs.update.mockReset().mockResolvedValue({});
    windows.update.mockReset().mockResolvedValue({});
    windows.remove.mockReset().mockResolvedValue(undefined);
    global.chrome = {
      ...global.chrome,
      runtime: { ...global.chrome?.runtime, getURL: vi.fn((path: string) => `chrome-extension://test/${path}`) },
      tabs, windows,
    } as unknown as typeof chrome; // Only the APIs this helper touches.
  });

  it('points the existing window at the new route in a new document and focuses it', async () => {
    tabs.query.mockResolvedValue([{ id: 5, url: `${BASE}#/keychain/unlock` }]);
    const popup = await reusePopupWindow(77, '#/requests/connect/approve?requestId=r');
    expect(tabs.query).toHaveBeenCalledWith({ windowId: 77 });
    expect(tabs.update).toHaveBeenCalledTimes(1);
    const [tabId, update] = tabs.update.mock.calls[0]!;
    expect(tabId).toBe(5);
    expect(update.active).toBe(true);
    // A hash-only change would keep the old document (and its pending navigations) alive.
    const url = new URL(update.url);
    expect(update.url.startsWith(`${BASE}?reuse=`)).toBe(true);
    expect(url.searchParams.get('reuse')).toMatch(/^[0-9a-f-]{36}$/);
    expect(url.hash).toBe('#/requests/connect/approve?requestId=r');
    expect(windows.update).toHaveBeenCalledWith(77, { focused: true });
    expect(popup?.id).toBe(77);
    await popup?.close();
    expect(windows.remove).toHaveBeenCalledWith(77);
  });

  it('never repeats the document URL, even for the same route', async () => {
    tabs.query.mockResolvedValue([{ id: 5 }]);
    await reusePopupWindow(77, '#/x');
    await reusePopupWindow(77, '#/x');
    const [first, second] = tabs.update.mock.calls.map(([, update]) => new URL(update.url).search);
    expect(first).not.toBe(second);
  });

  it('still reuses the window when the browser withholds tab URLs', async () => {
    tabs.query.mockResolvedValue([{ id: 5 }]);
    expect(await reusePopupWindow(77, '#/x')).not.toBeNull();
  });

  it('refuses a window that is showing something other than the wallet', async () => {
    tabs.query.mockResolvedValue([{ id: 5, url: 'https://example.com/' }]);
    expect(await reusePopupWindow(77, '#/x')).toBeNull();
    expect(tabs.update).not.toHaveBeenCalled();
  });

  it('returns null when the window is gone', async () => {
    tabs.query.mockRejectedValue(new Error('No window with id: 77'));
    expect(await reusePopupWindow(77, '#/x')).toBeNull();
    tabs.query.mockReset().mockResolvedValue([]);
    expect(await reusePopupWindow(77, '#/x')).toBeNull();
    expect(tabs.update).not.toHaveBeenCalled();
  });
});

describe('continuation unlock windows', () => {
  it('marks only the unlock window a request continues in', () => {
    const path = continuationUnlockPath('origin-unlock-1');
    expect(path.startsWith('?')).toBe(true);
    expect(awaitsContinuation(path)).toBe(true);
    expect(awaitsContinuation('')).toBe(false);
    expect(awaitsContinuation('?reuse=abc')).toBe(false);
  });
});
