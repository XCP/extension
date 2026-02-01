/**
 * ApprovalService Unit Tests
 * 
 * Tests the user approval workflow management functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

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
vi.mock('@/utils/fathom', () => ({
  sanitizePath: vi.fn((path: string) => path),
  analytics: {
    track: vi.fn().mockResolvedValue(undefined),
    page: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock popup utility
vi.mock('@/utils/popup', () => ({
  openPopupWindow: vi.fn().mockResolvedValue({
    id: 12345,
    close: vi.fn().mockResolvedValue(undefined),
  }),
  focusPopupWindow: vi.fn().mockResolvedValue(undefined),
}));

// Now import the service
import { ApprovalService } from '../approvalService';

// Mock chrome APIs
const mockStorage = {
  get: vi.fn(),
  set: vi.fn(),
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

  afterEach(async () => {
    await approvalService.destroy();
  });

  describe('requestApproval', () => {
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

      // Resolve the approval
      approvalService.resolveApproval('test-approve', { approved: true });

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

      // Reject the approval
      approvalService.rejectApproval('test-reject', 'User denied');

      await expect(approvalPromise).rejects.toThrow('User denied');
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

      // Resolve it
      const resolved = approvalService.resolveApproval('test-resolve', { approved: true });
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

      // Resolve with approved: false
      const resolved = approvalService.resolveApproval('test-reject', { approved: false });
      expect(resolved).toBe(true);

      // Promise should reject
      await expect(approvalPromise).rejects.toThrow('User denied the request');
    });

    it('should return false for non-existent request', () => {
      // No pending approval, so resolving should return false
      const resolved = approvalService.resolveApproval('non-existent', { approved: true });
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
      approvalPromise.catch(() => {});

      // There should be a pending approval
      expect(approvalService.hasPendingApproval()).toBe(true);

      // Resolve to clear
      approvalService.resolveApproval('badge-test', { approved: true });

      // Should be cleared
      expect(approvalService.hasPendingApproval()).toBe(false);
    });
  });

  describe('state persistence', () => {
    it('should initialize fresh on restart (no state persistence for in-flight requests)', async () => {
      // Reinitialize service
      await approvalService.destroy();
      approvalService = new ApprovalService();
      await approvalService.initialize();

      // Should have no pending approval after restart
      expect(approvalService.hasPendingApproval()).toBe(false);
      expect(approvalService.getCurrentApproval()).toBeNull();
    });
  });

});