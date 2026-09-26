/**
 * ApprovalService Unit Tests
 * 
 * Tests the user approval workflow management functionality
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { classifyProviderError } from '@/core/rpcErrors';

// No RequestManager mock needed - new ApprovalService manages pending approval directly

// No approvalQueue mock needed - it's not used by the new ApprovalService

// Mock eventEmitterService
vi.mock('@/services/eventEmitterService', () => ({
  eventEmitterService: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

// Mock fathom analytics
vi.mock('@/platform/fathom', () => ({
  sanitizePath: vi.fn((path: string) => path),
  analytics: {
    track: vi.fn().mockResolvedValue(undefined),
    page: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock popup utility
vi.mock('@/platform/popup', () => ({
  openPopupWindow: vi.fn().mockResolvedValue({
    id: 12345,
    close: vi.fn().mockResolvedValue(undefined),
  }),
  focusPopupWindow: vi.fn().mockResolvedValue(undefined),
  reusePopupWindow: vi.fn().mockResolvedValue(null),
}));

import { openPopupWindow, reusePopupWindow } from '@/platform/popup';
// Now import the service
import { ApprovalService } from '../approvalService';

/**
 * requestApproval writes the record before the request is pending in memory, so registration is
 * no longer synchronous. Production cannot observe the gap — the popup opens after the write.
 */
async function whenPending(service: ApprovalService) {
  await vi.waitFor(() => expect(service.hasPendingApproval()).toBe(true));
}

// Mock chrome APIs
// Backed by an object rather than returning undefined: the approval record is written through to
// session storage before a request is pending anywhere else, so a stub that stores nothing fails
// every request.
let sessionData: Record<string, unknown> = {};

const mockStorage = {
  get: vi.fn(async (key?: string) =>
    typeof key === 'string' && key in sessionData ? { [key]: sessionData[key] } : {}
  ),
  set: vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(sessionData, items);
  }),
};

const mockWindows = {
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  get: vi.fn(),
  getAll: vi.fn(),
  getCurrent: vi.fn(),
  getLastFocused: vi.fn(),
  resetState: vi.fn(),
  onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
  onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
  onFocusChanged: { addListener: vi.fn(), removeListener: vi.fn() },
} as any;

// Setup global mocks
beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};

  // Reset mock windows functions
  mockWindows.create.mockReset();
  mockWindows.update.mockReset();
  mockWindows.getAll.mockReset();

  global.chrome = {
    storage: {
      local: mockStorage,
      session: mockStorage,
    },
    action: {
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
    },
    windows: {
      getAll: vi.fn().mockResolvedValue([]),
      getCurrent: vi.fn().mockResolvedValue({ id: 1, width: 1920, height: 1080, top: 0, left: 0 }),
      create: vi.fn().mockResolvedValue({ id: 12345 }),
      remove: vi.fn().mockResolvedValue(undefined),
      update: mockWindows.update,
      onRemoved: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    runtime: {
      id: 'test-extension-id',
      sendMessage: vi.fn(),
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    },
  } as any;

  (global as any).browser = fakeBrowser;

  // Setup specific mocks
  fakeBrowser.runtime.getURL = vi.fn((path) => `chrome-extension://test/${path}`);
  fakeBrowser.windows = mockWindows;
  fakeBrowser.action = {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  } as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ApprovalService', () => {
  let approvalService: ApprovalService;

  beforeEach(async () => {
    vi.clearAllMocks();

    approvalService = new ApprovalService();

    // Mock initial storage state
    mockStorage.get.mockResolvedValue({});

    await approvalService.initialize();
  });

  afterEach(() => {
    // Settle whatever a test left pending, so its rejection and timeout end with the test.
    const pending = approvalService.getCurrentApproval();
    if (pending) approvalService.rejectApproval(pending.id, 'Test finished');
  });

  describe('requestApproval', () => {
    const connectOptions = {
      id: 'unlocked-connect', origin: 'https://test.com', method: 'xcp_requestAccounts',
      params: [], type: 'connection' as const,
      metadata: { domain: 'test.com', title: 'Connection Request', description: 'Site wants to connect' },
    };

    it('continues in the window a locked request already opened', async () => {
      vi.mocked(reusePopupWindow).mockResolvedValueOnce({ id: 77, close: vi.fn() });
      const approval = approvalService.requestApproval(connectOptions, undefined, { reuseWindowId: 77 });
      approval.catch(() => {});
      await whenPending(approvalService);
      await vi.waitFor(() => expect(reusePopupWindow).toHaveBeenCalledWith(77,
        '#/requests/connect/approve?requestId=unlocked-connect&origin=https%3A%2F%2Ftest.com'));
      expect(openPopupWindow).not.toHaveBeenCalled();
      // Closing that window still cancels the request.
      expect(chrome.windows.onRemoved.addListener).toHaveBeenCalled();
      const listener = vi.mocked(chrome.windows.onRemoved.addListener).mock.calls.at(-1)![0];
      listener(77);
      await expect(approval).rejects.toThrow('User closed the window');
      // ...and the site hears it as a rejection, not a masked -32603.
      expect(classifyProviderError(await approval.catch((error: unknown) => error)))
        .toEqual({ code: 4001, message: 'User closed the window' });
    });

    it('reports the reuse to the caller', async () => {
      vi.mocked(reusePopupWindow).mockResolvedValueOnce({ id: 77, close: vi.fn() });
      const onReused = vi.fn();
      const approval = approvalService.requestApproval(connectOptions, undefined, { reuseWindowId: 77, onReused });
      approval.catch(() => {});
      await vi.waitFor(() => expect(onReused).toHaveBeenCalledTimes(1));
      approvalService.rejectApproval('unlocked-connect', 'test cleanup');
    });

    it('cancels at once when the window closes while it is being navigated', async () => {
      // The close listener is already attached when the navigation starts, so a close landing in
      // between still rejects rather than leaving the request to time out.
      vi.mocked(reusePopupWindow).mockImplementationOnce(async (windowId) => {
        const listener = vi.mocked(chrome.windows.onRemoved.addListener).mock.calls.at(-1)![0];
        listener(windowId);
        return null;
      });
      const onReused = vi.fn();
      const approval = approvalService.requestApproval(connectOptions, undefined, { reuseWindowId: 77, onReused });
      await expect(approval).rejects.toThrow('User closed the window');
      // Nothing is reopened for a request the user closed.
      expect(openPopupWindow).not.toHaveBeenCalled();
      expect(onReused).not.toHaveBeenCalled();
    });

    it('opens a new window when the window to continue in is gone', async () => {
      vi.mocked(reusePopupWindow).mockResolvedValueOnce(null);
      const approval = approvalService.requestApproval(connectOptions, undefined, { reuseWindowId: 77 });
      approval.catch(() => {});
      await whenPending(approvalService);
      await vi.waitFor(() => expect(openPopupWindow).toHaveBeenCalledTimes(1));
      approvalService.rejectApproval('unlocked-connect', 'test cleanup');
    });

    it('never tries to reuse a window when none was named', async () => {
      const approval = approvalService.requestApproval(connectOptions);
      approval.catch(() => {});
      await whenPending(approvalService);
      await vi.waitFor(() => expect(openPopupWindow).toHaveBeenCalledTimes(1));
      expect(reusePopupWindow).not.toHaveBeenCalled();
      approvalService.rejectApproval('unlocked-connect', 'test cleanup');
    });

    it('should create pending approval and open popup', async () => {
      // Start a request but don't await it
      const approvalPromise = approvalService.requestApproval({
        id: 'test-connection',
        origin: 'https://test.com',
        method: 'connection',
        params: [],
        type: 'connection',
        metadata: {
          domain: 'test.com',
          title: 'Connection Request',
          description: 'Site wants to connect',
        },
      });
      await whenPending(approvalService);

      // Add catch handler to prevent unhandled rejection
      approvalPromise.catch(() => {});

      // Verify approval is now pending
      expect(approvalService.hasPendingApproval()).toBe(true);
      const current = approvalService.getCurrentApproval();
      expect(current?.id).toBe('test-connection');
      expect(current?.origin).toBe('https://test.com');

      // Clean up
      approvalService.rejectApproval('test-connection', 'test cleanup');
    });

    it('should resolve when approval is granted', async () => {
      const approvalPromise = approvalService.requestApproval({
        id: 'test-approve',
        origin: 'https://dapp.com',
        method: 'connection',
        params: [],
        type: 'connection',
        metadata: {
          domain: 'dapp.com',
          title: 'Connect',
          description: 'Connect request',
        },
      });
      await whenPending(approvalService);

      // Resolve the approval
      await approvalService.resolveApproval('test-approve', { approved: true });

      const result = await approvalPromise;
      expect(result).toEqual({ approved: true });
    });

    it('should reject when approval is denied', async () => {
      const approvalPromise = approvalService.requestApproval({
        id: 'test-reject',
        origin: 'https://dapp.com',
        method: 'connection',
        params: [],
        type: 'connection',
        metadata: {
          domain: 'dapp.com',
          title: 'Connect',
          description: 'Connect request',
        },
      });
      await whenPending(approvalService);

      // Reject the approval
      approvalService.rejectApproval('test-reject', 'User denied');

      await expect(approvalPromise).rejects.toThrow('User denied');
    });

    it('tells the site 4001, with the reason, however an approval ends unapproved', async () => {
      // A plain Error reached the page masked as -32603 "Request failed".
      const ended = async (end: (id: string) => void, id: string) => {
        const approval = approvalService.requestApproval({
          id, origin: 'https://dapp.com', method: 'xcp_requestAccounts', params: [], type: 'connection',
          metadata: { domain: 'dapp.com', title: 'Connect', description: 'Connect request' },
        });
        await whenPending(approvalService);
        end(id);
        return classifyProviderError(await approval.catch((error: unknown) => error));
      };
      expect(await ended(id => approvalService.rejectApproval(id, 'User denied the request'), 'deny'))
        .toEqual({ code: 4001, message: 'User denied the request' });
      expect(await ended(id => { void approvalService.resolveApproval(id, { approved: false }); }, 'resolve-denied'))
        .toEqual({ code: 4001, message: 'User denied the request' });
    });

    it('should supersede existing pending approval with new request', async () => {
      // First request
      const firstPromise = approvalService.requestApproval({
        id: 'first-request',
        origin: 'https://first.com',
        method: 'connection',
        params: [],
        type: 'connection',
        metadata: { domain: 'first.com', title: 'First', description: 'First' },
      });
      await whenPending(approvalService);
      firstPromise.catch(() => {});

      expect(approvalService.getCurrentApproval()?.id).toBe('first-request');

      // Second request should supersede the first
      const secondPromise = approvalService.requestApproval({
        id: 'second-request',
        origin: 'https://second.com',
        method: 'connection',
        params: [],
        type: 'connection',
        metadata: { domain: 'second.com', title: 'Second', description: 'Second' },
      });
      await whenPending(approvalService);
      secondPromise.catch(() => {});

      // First should be rejected with "Superseded by new request"
      await expect(firstPromise).rejects.toThrow('Superseded by new request');

      // Second should be the current pending approval
      expect(approvalService.getCurrentApproval()?.id).toBe('second-request');

      // Clean up
      approvalService.rejectApproval('second-request', 'test cleanup');
    });
  });

  describe('resolveApproval', () => {
    it('should resolve pending approval with success result', async () => {
      // First create a pending approval
      const approvalPromise = approvalService.requestApproval({
        id: 'test-resolve',
        origin: 'https://test.com',
        method: 'connection',
        params: [],
        type: 'connection',
        metadata: { domain: 'test.com', title: 'Test', description: 'Test' },
      });
      await whenPending(approvalService);

      // Resolve it
      const resolved = await approvalService.resolveApproval('test-resolve', { approved: true });
      expect(resolved).toBe(true);

      // Promise should resolve
      const result = await approvalPromise;
      expect(result).toEqual({ approved: true });
    });

    it('should reject pending approval when approved: false', async () => {
      // First create a pending approval
      const approvalPromise = approvalService.requestApproval({
        id: 'test-reject',
        origin: 'https://test.com',
        method: 'connection',
        params: [],
        type: 'connection',
        metadata: { domain: 'test.com', title: 'Test', description: 'Test' },
      });
      await whenPending(approvalService);

      // Resolve with approved: false
      const resolved = await approvalService.resolveApproval('test-reject', { approved: false });
      expect(resolved).toBe(true);

      // Promise should reject
      await expect(approvalPromise).rejects.toThrow('User denied the request');
    });

    it('should return false for non-existent request', async () => {
      // No pending approval, so resolving should return false
      const resolved = await approvalService.resolveApproval('non-existent', { approved: true });
      expect(resolved).toBe(false);
    });
  });

  describe('getCurrentApproval', () => {
    it('should return null when no pending approval', () => {
      const current = approvalService.getCurrentApproval();
      expect(current).toBeNull();
    });

    it('should return current approval when one is pending', async () => {
      // Create a pending approval - don't await, just start it
      const approvalPromise = approvalService.requestApproval({
        id: 'test-request',
        origin: 'https://test.com',
        method: 'connection',
        type: 'connection',
        params: [],
        metadata: {
          domain: 'test.com',
          title: 'Test Connection',
          description: 'Test connection request',
        },
      });
      await whenPending(approvalService);

      // Add a catch handler to prevent unhandled rejection
      approvalPromise.catch(() => {});

      const current = approvalService.getCurrentApproval();
      expect(current).not.toBeNull();
      expect(current?.id).toBe('test-request');
      expect(current?.origin).toBe('https://test.com');

      // Clean up
      approvalService.rejectApproval('test-request', 'test cleanup');
    });
  });

  describe('badge management', () => {
    it('should update badge based on pending state', async () => {
      // Create a pending approval
      const approvalPromise = approvalService.requestApproval({
        id: 'badge-test',
        origin: 'https://test.com',
        method: 'connection',
        params: [],
        type: 'connection',
        metadata: { domain: 'test.com', title: 'Test', description: 'Test' },
      });
      await whenPending(approvalService);
      approvalPromise.catch(() => {});

      // There should be a pending approval
      expect(approvalService.hasPendingApproval()).toBe(true);

      // Resolve to clear
      await approvalService.resolveApproval('badge-test', { approved: true });

      // Should be cleared
      expect(approvalService.hasPendingApproval()).toBe(false);
    });
  });

  describe('state persistence', () => {
    it('should initialize fresh on restart (no state persistence for in-flight requests)', async () => {
      // A new worker: fresh instance, same (empty) storage
      approvalService = new ApprovalService();
      await approvalService.initialize();

      // Should have no pending approval after restart
      expect(approvalService.hasPendingApproval()).toBe(false);
      expect(approvalService.getCurrentApproval()).toBeNull();
    });

    it('reads the stored request once however often initialize is called', async () => {
      const service = new ApprovalService();
      mockStorage.get.mockClear();

      await Promise.all([service.initialize(), service.initialize()]);
      const reads = mockStorage.get.mock.calls.length;
      expect(reads).toBeGreaterThan(0);

      await service.initialize();
      expect(mockStorage.get).toHaveBeenCalledTimes(reads);
    });
  });

});
