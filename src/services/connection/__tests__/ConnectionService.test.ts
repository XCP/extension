/**
 * ConnectionService Unit Tests
 * 
 * Tests the dApp connection and permission management functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectionService } from '../ConnectionService';
import type { ApprovalService } from '../../approval/ApprovalService';

// Mock dependencies
const mockApprovalService = {
  requestApproval: vi.fn(),
} as unknown as ApprovalService;

// Mock chrome storage
const mockStorage = {
  get: vi.fn(),
  set: vi.fn(),
};

// Setup global mocks
beforeEach(() => {
  vi.clearAllMocks();
  
  // Mock browser storage
  global.chrome = {
    storage: {
      local: mockStorage,
      session: mockStorage,
    },
  } as any;
  
  // Mock browser runtime
  (global as any).browser = {
    runtime: {
      getURL: vi.fn((path) => `chrome-extension://test/${path}`),
    },
    windows: {
      create: vi.fn(),
      update: vi.fn(),
    },
  } as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConnectionService', () => {
  let connectionService: ConnectionService;

  beforeEach(async () => {
    connectionService = new ConnectionService();
    
    // Mock initial storage state
    mockStorage.get.mockResolvedValue({
      settings: {
        connectedWebsites: [],
      }
    });
    
    await connectionService.initialize();
  });

  afterEach(async () => {
    await connectionService.destroy();
  });

  describe('hasPermission', () => {
    it('should return false for unknown origin', async () => {
      const hasPermission = await connectionService.hasPermission('https://unknown.com');
      expect(hasPermission).toBe(false);
    });

    it('should return true for connected origin', async () => {
      // Setup connected website
      mockStorage.get.mockResolvedValue({
        settings: {
          connectedWebsites: ['https://connected.com'],
        }
      });
      
      // Reinitialize to load new state
      await connectionService.destroy();
      connectionService = new ConnectionService();
      await connectionService.initialize();
      
      const hasPermission = await connectionService.hasPermission('https://connected.com');
      expect(hasPermission).toBe(true);
    });

    it('should handle storage errors gracefully', async () => {
      mockStorage.get.mockRejectedValue(new Error('Storage error'));
      
      const hasPermission = await connectionService.hasPermission('https://test.com');
      expect(hasPermission).toBe(false);
    });
  });

  describe('connect', () => {
    it('should successfully connect a new origin with user approval', async () => {
      // Mock approval service to approve connection
      mockApprovalService.requestApproval = vi.fn().mockResolvedValue(true);
      
      const result = await connectionService.connect(
        'https://newsite.com',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        'wallet-123'
      );
      
      expect(result).toEqual(['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa']);
      expect(mockApprovalService.requestApproval).toHaveBeenCalledWith({
        type: 'connection',
        origin: 'https://newsite.com',
        metadata: {
          domain: 'newsite.com',
          title: 'Connection Request',
          description: 'This site wants to connect to your wallet',
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          walletId: 'wallet-123',
        },
      });
      
      // Should save to storage
      expect(mockStorage.set).toHaveBeenCalledWith({
        settings: {
          connectedWebsites: ['https://newsite.com'],
        }
      });
    });

    it('should return existing connection if already connected', async () => {
      // Setup existing connection
      mockStorage.get.mockResolvedValue({
        settings: {
          connectedWebsites: ['https://existing.com'],
        }
      });
      
      await connectionService.destroy();
      connectionService = new ConnectionService();
      await connectionService.initialize();
      
      const result = await connectionService.connect(
        'https://existing.com',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        'wallet-123'
      );
      
      expect(result).toEqual(['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa']);
      expect(mockApprovalService.requestApproval).not.toHaveBeenCalled();
    });

    it('should reject connection when user denies approval', async () => {
      mockApprovalService.requestApproval = vi.fn().mockResolvedValue(false);
      
      await expect(connectionService.connect(
        'https://denied.com',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        'wallet-123'
      )).rejects.toThrow('User denied the connection request');
    });

    it('should validate origin format', async () => {
      await expect(connectionService.connect(
        'invalid-url',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        'wallet-123'
      )).rejects.toThrow('Invalid origin URL');
    });

    it('should validate address format', async () => {
      await expect(connectionService.connect(
        'https://valid.com',
        'invalid-address',
        'wallet-123'
      )).rejects.toThrow('Invalid Bitcoin address');
    });
  });

  describe('disconnect', () => {
    it('should successfully disconnect connected origin', async () => {
      // Setup connected website
      mockStorage.get.mockResolvedValue({
        settings: {
          connectedWebsites: ['https://connected.com', 'https://other.com'],
        }
      });
      
      await connectionService.destroy();
      connectionService = new ConnectionService();
      await connectionService.initialize();
      
      await connectionService.disconnect('https://connected.com');
      
      // Should remove from storage
      expect(mockStorage.set).toHaveBeenCalledWith({
        settings: {
          connectedWebsites: ['https://other.com'],
        }
      });
    });

    it('should handle disconnecting non-connected origin gracefully', async () => {
      await connectionService.disconnect('https://notconnected.com');
      
      // Should not throw error
      expect(mockStorage.set).toHaveBeenCalledWith({
        settings: {
          connectedWebsites: [],
        }
      });
    });
  });

  describe('getConnectedWebsites', () => {
    it('should return list of connected sites', async () => {
      // Setup connected websites
      mockStorage.get.mockResolvedValue({
        settings: {
          connectedWebsites: ['https://site1.com', 'https://site2.com'],
        }
      });
      
      await connectionService.destroy();
      connectionService = new ConnectionService();
      await connectionService.initialize();
      
      const sites = await connectionService.getConnectedWebsites();
      expect(sites).toEqual(['https://site1.com', 'https://site2.com']);
    });

    it('should return empty array when no connections', async () => {
      const sites = await connectionService.getConnectedWebsites();
      expect(sites).toEqual([]);
    });
  });

  describe('state persistence', () => {
    it('should persist connections across service restarts', async () => {
      // Connect a site
      mockApprovalService.requestApproval = vi.fn().mockResolvedValue(true);
      await connectionService.connect(
        'https://persistent.com',
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        'wallet-123'
      );
      
      // Simulate service restart
      await connectionService.destroy();
      
      // Mock storage to return saved connections
      mockStorage.get.mockResolvedValue({
        settings: {
          connectedWebsites: ['https://persistent.com'],
        }
      });
      
      connectionService = new ConnectionService();
      await connectionService.initialize();
      
      // Should still have connection
      const hasPermission = await connectionService.hasPermission('https://persistent.com');
      expect(hasPermission).toBe(true);
    });
  });


  describe('rate limiting', () => {
    it('should enforce connection rate limits', async () => {
      // Make multiple rapid connection attempts
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          connectionService.connect(
            `https://site${i}.com`,
            '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
            'wallet-123'
          ).catch(error => error.message)
        );
      }
      
      const results = await Promise.all(promises);
      
      // Should have some rate limited requests
      const rateLimitedCount = results.filter(result => 
        typeof result === 'string' && result.includes('rate limit')
      ).length;
      
      expect(rateLimitedCount).toBeGreaterThan(0);
    });
  });
});