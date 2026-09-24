import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reusePopupWindow } from '@/platform/popup';

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

  it('points the existing window at the new route and focuses it', async () => {
    tabs.query.mockResolvedValue([{ id: 5, url: `${BASE}#/keychain/unlock` }]);
    const popup = await reusePopupWindow(77, '#/requests/connect/approve?requestId=r');
    expect(tabs.query).toHaveBeenCalledWith({ windowId: 77 });
    expect(tabs.update).toHaveBeenCalledWith(5, { url: `${BASE}#/requests/connect/approve?requestId=r`, active: true });
    expect(windows.update).toHaveBeenCalledWith(77, { focused: true });
    expect(popup?.id).toBe(77);
    await popup?.close();
    expect(windows.remove).toHaveBeenCalledWith(77);
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
