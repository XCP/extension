import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { classifyProviderError } from '@/core/rpcErrors';
import { findPendingApproval } from '@/platform/provider/approvalFlow';

/**
 * An approval whose window never opened must end, not sit pending.
 *
 * The popup module is real here: `chrome.windows.getCurrent()` rejects with "No current window"
 * when the browser has no normal window to report (every window closed while the extension keeps
 * running, as on macOS), and `openPopupWindow` lets that rejection through.
 */

vi.mock('@/services/eventEmitterService', () => ({
  eventEmitterService: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));
vi.mock('@/platform/fathom', () => ({
  sanitizePath: vi.fn((path: string) => path),
  analytics: { track: vi.fn().mockResolvedValue(undefined), page: vi.fn().mockResolvedValue(undefined) },
}));

import { ApprovalService } from '../approvalService';

let sessionData: Record<string, unknown> = {};
const storage = {
  get: vi.fn(async (key?: string) =>
    typeof key === 'string' && key in sessionData ? { [key]: sessionData[key] } : {}),
  set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(sessionData, items); }),
};

const options = {
  id: 'connect-1', origin: 'https://test.com', method: 'xcp_requestAccounts',
  params: [], type: 'connection' as const,
  metadata: { domain: 'test.com', title: 'Connection Request', description: 'Site wants to connect' },
};

describe('ApprovalService when the approval window cannot be opened', () => {
  let service: ApprovalService;
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => { unhandled.push(reason); };

  beforeEach(async () => {
    sessionData = {};
    unhandled.length = 0;
    process.on('unhandledRejection', onUnhandled);
    global.chrome = {
      storage: { local: storage, session: storage },
      action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
      windows: {
        getCurrent: vi.fn().mockRejectedValue(new Error('No current window')),
        create: vi.fn().mockResolvedValue({ id: 12345 }),
        remove: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      tabs: { query: vi.fn().mockResolvedValue([]), update: vi.fn() },
      runtime: { id: 'test', getURL: (path: string) => `chrome-extension://test/${path}` },
    } as any;
    (global as any).browser = fakeBrowser;
    service = new ApprovalService();
    await service.initialize();
  });

  afterEach(async () => {
    await service.destroy();
    process.off('unhandledRejection', onUnhandled);
    vi.useRealTimers();
  });

  it('rejects the request with a code the site can read', async () => {
    const error = await service.requestApproval(options).catch((e: unknown) => e);

    expect(classifyProviderError(error).code).toBe(4001);
  });

  it('leaves nothing pending: not in memory, not in storage, not on the badge', async () => {
    await service.requestApproval(options).catch(() => {});

    expect(service.hasPendingApproval()).toBe(false);
    expect(await findPendingApproval()).toBeNull();
    expect(vi.mocked(chrome.action.setBadgeText).mock.calls.at(-1)?.[0]).toEqual({ text: '' });
  });

  it('does not reject an abandoned promise when the timeout would have fired', async () => {
    vi.useFakeTimers();
    await service.requestApproval(options, 1_000).catch(() => {});
    await vi.advanceTimersByTimeAsync(2_000);
    vi.useRealTimers();
    // Let any rejection reach the process-level handler.
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(unhandled).toEqual([]);
  });

  it('leaves a newer request alone when an older one fails to open late', async () => {
    let failFirst!: (error: Error) => void;
    vi.mocked(chrome.windows.getCurrent)
      .mockReturnValueOnce(new Promise((_, reject) => { failFirst = reject; }) as never)
      .mockResolvedValue({ id: 1, width: 1000, height: 800, top: 0, left: 0 } as never);

    const first = service.requestApproval(options).catch((e: unknown) => e);
    await vi.waitFor(() => expect(chrome.windows.getCurrent).toHaveBeenCalledTimes(1));
    const second = service.requestApproval({ ...options, id: 'connect-2' });
    second.catch(() => {});
    await vi.waitFor(() => expect(chrome.windows.onRemoved.addListener).toHaveBeenCalledTimes(1));

    failFirst(new Error('No current window'));
    await first;

    expect(service.getCurrentApproval()?.id).toBe('connect-2');
    expect(chrome.windows.onRemoved.removeListener).not.toHaveBeenCalled();
    // Closing the newer request's window still ends it.
    const listener = vi.mocked(chrome.windows.onRemoved.addListener).mock.calls[0]![0];
    listener(12345);
    await expect(second).rejects.toThrow('User closed the window');
  });

  it('lets the next request open normally once a window exists again', async () => {
    await service.requestApproval(options).catch(() => {});
    vi.mocked(chrome.windows.getCurrent).mockResolvedValue({ id: 1, width: 1000, height: 800, top: 0, left: 0 } as never);

    const next = service.requestApproval({ ...options, id: 'connect-2' });
    next.catch(() => {});
    await vi.waitFor(() => expect(chrome.windows.create).toHaveBeenCalledTimes(1));
    expect(service.getCurrentApproval()?.id).toBe('connect-2');
    service.rejectApproval('connect-2');
    await expect(next).rejects.toThrow();
  });
});
