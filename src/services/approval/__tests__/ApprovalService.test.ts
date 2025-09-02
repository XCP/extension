/**
 * ApprovalService Unit Tests
 * 
 * Tests the user approval workflow management functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApprovalService } from '../ApprovalService';

// Mock RequestManager
const mockRequestManager = {
  createManagedPromise: vi.fn(),
  resolve: vi.fn(),
  reject: vi.fn(),
  getStats: vi.fn(),
  destroy: vi.fn(),
};

// Mock chrome APIs
const mockStorage = {
  get: vi.fn(),
  set: vi.fn(),
};

const mockWindows = {
  create: vi.fn(),
  update: vi.fn(),
};

// Setup global mocks
beforeEach(() => {
  vi.clearAllMocks();
  
  global.chrome = {
    storage: {
      local: mockStorage,
      session: mockStorage,
    },
  } as any;
  
  global.browser = {
    runtime: {
      getURL: vi.fn((path) => `chrome-extension://test/${path}`),
    },
    windows: mockWindows,
    action: {
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
    },
  } as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ApprovalService', () => {
  let approvalService: ApprovalService;

  beforeEach(async () => {
    // Mock RequestManager constructor
    vi.doMock('../../core/RequestManager', () => ({
      RequestManager: vi.fn().mockImplementation(() => mockRequestManager),
    }));
    
    const { ApprovalService } = await import('../ApprovalService');
    approvalService = new ApprovalService();
    
    // Mock initial storage state
    mockStorage.get.mockResolvedValue({});
    
    await approvalService.initialize();
  });

  afterEach(async () => {
    await approvalService.destroy();
    vi.doUnmock('../../core/RequestManager');
  });

  describe('requestApproval', () => {
    it('should create approval request for connection', async () => {
      // Mock successful promise resolution
      const mockPromise = Promise.resolve(true);
      mockRequestManager.createManagedPromise.mockReturnValue(mockPromise);
      
      // Mock window creation
      mockWindows.create.mockResolvedValue({ id: 123 });
      
      const approvalPromise = approvalService.requestApproval({
        type: 'connection',
        origin: 'https://test.com',
        metadata: {
          domain: 'test.com',
          title: 'Connection Request',
          description: 'Site wants to connect',
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          walletId: 'wallet-123',
        },
      });
      
      expect(mockRequestManager.createManagedPromise).toHaveBeenCalledWith(
        expect.stringMatching(/^connection-https:\/\/test\.com-\d+$/),
        expect.objectContaining({
          origin: 'https://test.com',
          method: 'connection',
          metadata: expect.objectContaining({
            domain: 'test.com',
          }),
        })
      );
      
      expect(mockWindows.create).toHaveBeenCalledWith({
        url: expect.stringContaining('/popup.html#/provider/approval-queue'),
        type: 'popup',
        width: 350,
        height: 600,
        focused: true,
      });
      
      // Should resolve the promise
      const result = await approvalPromise;
      expect(result).toBe(true);
    });

    it('should create approval request for transaction signing', async () => {
      const mockPromise = Promise.resolve(true);
      mockRequestManager.createManagedPromise.mockReturnValue(mockPromise);
      
      mockWindows.create.mockResolvedValue({ id: 456 });
      
      const approvalPromise = approvalService.requestApproval({
        type: 'transaction',
        origin: 'https://dapp.com',
        metadata: {
          domain: 'dapp.com',
          title: 'Sign Transaction',
          description: 'Sign a send transaction',
          rawTransaction: '0x123456...',
          fee: 1000,
        },
      });
      
      expect(mockRequestManager.createManagedPromise).toHaveBeenCalledWith(
        expect.stringMatching(/^transaction-https:\/\/dapp\.com-\d+$/),
        expect.objectContaining({
          origin: 'https://dapp.com',
          method: 'transaction',
        })
      );
      
      const result = await approvalPromise;
      expect(result).toBe(true);
    });

    it('should create approval request for message signing', async () => {
      const mockPromise = Promise.resolve('signature-result');
      mockRequestManager.createManagedPromise.mockReturnValue(mockPromise);
      
      mockWindows.create.mockResolvedValue({ id: 789 });
      
      const approvalPromise = approvalService.requestApproval({
        type: 'message',
        origin: 'https://auth.com',
        metadata: {
          domain: 'auth.com',
          title: 'Sign Message',
          description: 'Authenticate with signature',
          message: 'Please sign this message',
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        },
      });
      
      const result = await approvalPromise;
      expect(result).toBe('signature-result');
    });

    it('should focus existing window if approval already pending', async () => {
      // Mock existing window
      mockWindows.create
        .mockResolvedValueOnce({ id: 100 }) // First request creates window
        .mockResolvedValue({ id: 101 }); // Second request would create new
      
      mockWindows.update.mockResolvedValue({});
      
      const mockPromise1 = new Promise(resolve => setTimeout(() => resolve(true), 100));
      const mockPromise2 = Promise.resolve(false);
      
      mockRequestManager.createManagedPromise
        .mockReturnValueOnce(mockPromise1)
        .mockReturnValueOnce(mockPromise2);
      
      // Create first approval request
      const approval1 = approvalService.requestApproval({
        type: 'connection',
        origin: 'https://first.com',
        metadata: { domain: 'first.com', title: 'First', description: 'First request' },
      });
      
      // Create second approval request quickly
      const approval2 = approvalService.requestApproval({
        type: 'connection',
        origin: 'https://second.com',
        metadata: { domain: 'second.com', title: 'Second', description: 'Second request' },
      });
      
      // Should focus existing window instead of creating new one
      expect(mockWindows.update).toHaveBeenCalledWith(100, { focused: true });
      
      await Promise.all([approval1, approval2]);
    });

    it('should validate approval request parameters', async () => {
      await expect(approvalService.requestApproval({
        type: 'connection',
        // Missing origin
        metadata: { domain: 'test.com', title: 'Test', description: 'Test' },
      } as any)).rejects.toThrow('Origin is required');
      
      await expect(approvalService.requestApproval({
        // Missing type
        origin: 'https://test.com',
        metadata: { domain: 'test.com', title: 'Test', description: 'Test' },
      } as any)).rejects.toThrow('Approval type is required');
    });
  });

  describe('resolveApproval', () => {
    it('should resolve pending approval with success result', () => {
      const requestId = 'test-request-123';
      const result = { approved: true, data: 'success' };
      
      const resolved = approvalService.resolveApproval(requestId, result);
      
      expect(resolved).toBe(true);
      expect(mockRequestManager.resolve).toHaveBeenCalledWith(requestId, result);
    });

    it('should resolve pending approval with rejection', () => {
      const requestId = 'test-request-456';
      const result = { approved: false, reason: 'User denied' };
      
      const resolved = approvalService.resolveApproval(requestId, result);
      
      expect(resolved).toBe(true);
      expect(mockRequestManager.reject).toHaveBeenCalledWith(
        requestId, 
        new Error('User denied the request: User denied')
      );
    });

    it('should return false for non-existent request', () => {
      const resolved = approvalService.resolveApproval('non-existent', { approved: true });
      expect(resolved).toBe(false);
    });
  });

  describe('getApprovalQueue', () => {
    it('should return list of pending approvals', async () => {
      // Mock queue state
      const mockQueue = [
        {
          id: 'req1',
          origin: 'https://site1.com',
          type: 'connection',
          metadata: { domain: 'site1.com', title: 'Connect', description: 'Connection request' },
          timestamp: Date.now(),
        },
        {
          id: 'req2',
          origin: 'https://site2.com',
          type: 'transaction',
          metadata: { domain: 'site2.com', title: 'Sign', description: 'Transaction signing' },
          timestamp: Date.now(),
        },
      ];
      
      // Set up internal state (would normally be done by service)
      (approvalService as any).pendingApprovals = mockQueue;
      
      const queue = await approvalService.getApprovalQueue();
      expect(queue).toEqual(mockQueue);
    });

    it('should return empty array when no pending approvals', async () => {
      const queue = await approvalService.getApprovalQueue();
      expect(queue).toEqual([]);
    });
  });

  describe('removeApprovalRequest', () => {
    it('should remove approval request from queue', async () => {
      const requestId = 'test-request';
      
      const removed = await approvalService.removeApprovalRequest(requestId);
      
      expect(removed).toBe(true);
      expect(mockRequestManager.reject).toHaveBeenCalledWith(
        requestId,
        new Error('Request cancelled by user')
      );
    });
  });

  describe('badge management', () => {
    it('should update badge when approvals are pending', async () => {
      // Add some pending approvals
      (approvalService as any).pendingApprovals = [
        { id: 'req1', origin: 'https://test.com' },
        { id: 'req2', origin: 'https://other.com' },
      ];
      
      // Trigger badge update (internal method)
      await (approvalService as any).updateBadge();
      
      expect(global.browser.action.setBadgeText).toHaveBeenCalledWith({ text: '2' });
      expect(global.browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ 
        color: '#EF4444' 
      });
    });

    it('should clear badge when no approvals pending', async () => {
      (approvalService as any).pendingApprovals = [];
      
      await (approvalService as any).updateBadge();
      
      expect(global.browser.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
      expect(global.browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ 
        color: '#000000' 
      });
    });
  });

  describe('state persistence', () => {
    it('should restore pending approvals after service restart', async () => {
      // Mock saved state
      const savedState = {
        pendingApprovals: [
          {
            id: 'saved-req',
            origin: 'https://saved.com',
            type: 'connection',
            metadata: { domain: 'saved.com', title: 'Saved', description: 'Saved request' },
            timestamp: Date.now() - 30000, // 30 seconds ago
          },
        ],
        currentWindow: 123,
      };
      
      mockStorage.get.mockResolvedValue({ approvalServiceState: savedState });
      
      // Reinitialize service
      await approvalService.destroy();
      approvalService = new ApprovalService();
      await approvalService.initialize();
      
      const queue = await approvalService.getApprovalQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe('saved-req');
    });

    it('should clean up expired approvals on restart', async () => {
      const savedState = {
        pendingApprovals: [
          {
            id: 'expired-req',
            origin: 'https://expired.com',
            type: 'connection',
            metadata: { domain: 'expired.com', title: 'Expired', description: 'Expired request' },
            timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago (expired)
          },
          {
            id: 'valid-req',
            origin: 'https://valid.com',
            type: 'connection',
            metadata: { domain: 'valid.com', title: 'Valid', description: 'Valid request' },
            timestamp: Date.now() - 30000, // 30 seconds ago (valid)
          },
        ],
      };
      
      mockStorage.get.mockResolvedValue({ approvalServiceState: savedState });
      
      await approvalService.destroy();
      approvalService = new ApprovalService();
      await approvalService.initialize();
      
      const queue = await approvalService.getApprovalQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe('valid-req');
    });
  });

});