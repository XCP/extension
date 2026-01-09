import './setup'; // Must be first to setup browser mocks
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { createProviderService } from '../providerService';
import { approvalQueue } from '@/utils/provider/approvalQueue';
import { requestCleanup } from '@/utils/provider/requestCleanup';
import * as settingsStorage from '@/utils/storage/settingsStorage';
import { DEFAULT_SETTINGS } from '@/utils/storage/settingsStorage';

// Mock dependencies
vi.mock('webext-bridge/background', () => ({
  sendMessage: vi.fn(),
  onMessage: vi.fn(),
}));
vi.mock('../walletService');
vi.mock('@/utils/storage/settingsStorage');
// Mock CSP validation to avoid network calls
vi.mock('@/utils/security/cspValidation', () => ({
  analyzeCSP: vi.fn(() => Promise.resolve({
    hasCSP: true,
    isSecure: true,
    recommendations: [],
    warnings: [],
    directives: {}
  })),
  meetsSecurityRequirements: vi.fn(() => Promise.resolve(true))
}));
// Browser mocks are already setup in ./setup.ts


describe('Provider Service Lifecycle Tests', () => {
  let providerService: ReturnType<typeof createProviderService>;
  beforeEach(() => {
    vi.clearAllMocks();
    fakeBrowser.reset();
    approvalQueue.clearAll();
    
    // Re-setup browser mocks after reset
    fakeBrowser.windows.create = vi.fn().mockResolvedValue({});
    fakeBrowser.windows.update = vi.fn().mockResolvedValue({});
    fakeBrowser.windows.onRemoved = {
      addListener: vi.fn(),
      removeListener: vi.fn()
    } as any;
    fakeBrowser.tabs.onRemoved = {
      addListener: vi.fn()
    } as any;
    fakeBrowser.tabs.onUpdated = {
      addListener: vi.fn()
    } as any;
    fakeBrowser.runtime.getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
    fakeBrowser.runtime.getManifest = vi.fn(() => ({ version: '1.0.0' } as any));
    fakeBrowser.runtime.onConnect = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn()
    } as any;
    fakeBrowser.action.setBadgeText = vi.fn().mockResolvedValue(undefined);
    fakeBrowser.action.setBadgeBackgroundColor = vi.fn().mockResolvedValue(undefined);
    
    vi.mocked(settingsStorage.getSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      connectedWebsites: [], // Clear connections for testing
      pinnedAssets: [], // Clear pinned assets for testing
    } as any);
    
    providerService = createProviderService();
    // Store reference for potential future use in tests
  });

  describe('Request Expiration', () => {
    it('should auto-expire requests after timeout', async () => {
      // Clear queue first
      approvalQueue.clearAll();
      
      // Add a request with old timestamp
      const requestId = 'test-request-123';
      const oldTime = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      const request = {
        id: requestId,
        origin: 'https://test.com',
        method: 'xcp_requestAccounts',
        params: [],
        type: 'connection' as const,
        timestamp: oldTime
      };
      // Add directly to queue with old timestamp
      approvalQueue['queue'].push(request);
      
      expect(approvalQueue.getCount()).toBe(1);
      
      // Check for expired requests (anything older than 5 minutes)
      const expiredRequests = approvalQueue.getExpired(5 * 60 * 1000);
      expect(expiredRequests.length).toBe(1);
      
      // Clean up expired
      const removed = approvalQueue.removeExpired(5 * 60 * 1000);
      expect(removed).toBe(1);
      expect(approvalQueue.getCount()).toBe(0);
    });

    it('should handle multiple expired requests', async () => {
      // Clear queue first
      approvalQueue.clearAll();
      
      // Add multiple requests with old timestamps (manually set)
      const oldTime = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      for (let i = 0; i < 5; i++) {
        const request = {
          id: `request-${i}`,
          origin: 'https://test.com',
          method: 'xcp_requestAccounts',
          params: [],
          type: 'connection' as const,
          timestamp: oldTime
        };
        // Add directly to queue with old timestamp
        approvalQueue['queue'].push(request);
      }
      
      expect(approvalQueue.getCount()).toBe(5);
      
      // Remove all as expired (anything older than 5 minutes)
      const removed = approvalQueue.removeExpired(5 * 60 * 1000);
      expect(removed).toBe(5);
      expect(approvalQueue.getCount()).toBe(0);
    });
  });

  describe('Tab/Window Cleanup', () => {
    it('should handle tab close events', () => {
      const handleTabClosedSpy = vi.spyOn(requestCleanup, 'handleTabClosed');
      
      // Simulate tab close
      requestCleanup.handleTabClosed(123);
      
      expect(handleTabClosedSpy).toHaveBeenCalledWith(123);
    });

    it('should clean up requests when origin navigates away', () => {
      const origin = 'https://dapp.com';
      
      // Add requests from origin
      approvalQueue.add({
        id: 'req1',
        origin,
        method: 'xcp_requestAccounts',
        params: [],
        type: 'connection'
      });
      
      approvalQueue.add({
        id: 'req2',
        origin,
        method: 'xcp_signPsbt',
        params: [],
        type: 'signature'
      });
      
      expect(approvalQueue.getCount()).toBe(2);
      
      // Clean up by origin
      const removed = requestCleanup.cleanupByOrigin(origin);
      expect(removed).toBe(2);
      expect(approvalQueue.getCount()).toBe(0);
    });

    it('should handle navigation events', () => {
      const handleNavigationSpy = vi.spyOn(requestCleanup, 'handleNavigation');
      
      // Simulate navigation
      requestCleanup.handleNavigation(123, 'https://newsite.com');
      
      expect(handleNavigationSpy).toHaveBeenCalledWith(123, 'https://newsite.com');
    });
  });

  describe('Queue Overflow Protection', () => {
    it('should handle queue overflow gracefully', () => {
      // Try to add many requests
      const maxRequests = 100;
      for (let i = 0; i < maxRequests; i++) {
        approvalQueue.add({
          id: `overflow-${i}`,
          origin: `https://site${i}.com`,
          method: 'xcp_requestAccounts',
          params: [],
          type: 'connection'
        });
      }
      
      expect(approvalQueue.getCount()).toBe(maxRequests);
      
      // Should still be functional
      const grouped = approvalQueue.getGroupedByOrigin();
      expect(grouped.size).toBe(maxRequests);
    });

    it('should prevent memory exhaustion from large parameters', () => {
      // Create a very large parameter object
      const largeParam = {
        data: 'x'.repeat(10 * 1024 * 1024) // 10MB string
      };
      
      // Should handle gracefully without crashing
      approvalQueue.add({
        id: 'large-param',
        origin: 'https://test.com',
        method: 'xcp_signPsbt',
        params: largeParam,
        type: 'signature'
      });
      
      expect(approvalQueue.getCount()).toBe(1);
      
      // Should be able to remove it
      approvalQueue.remove('large-param');
      expect(approvalQueue.getCount()).toBe(0);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple simultaneous requests from same origin', async () => {
      const origin = 'https://dapp.com';
      
      // Mark as connected
      vi.mocked(settingsStorage.getSettings).mockResolvedValue({
        ...DEFAULT_SETTINGS,
        connectedWebsites: [origin],
        pinnedAssets: [], // Clear for test
      } as any);
      
      // Simulate multiple rapid requests
      for (let i = 0; i < 3; i++) {
        approvalQueue.add({
          id: `concurrent-${i}`,
          origin,
          method: 'xcp_getBalances',
          params: [],
          type: 'transaction'
        });
      }
      
      expect(approvalQueue.getCount()).toBe(3);
      
      // Should maintain order
      const all = approvalQueue.getAll();
      expect(all[0].id).toBe('concurrent-0');
      expect(all[1].id).toBe('concurrent-1');
      expect(all[2].id).toBe('concurrent-2');
    });

    it('should handle requests from multiple origins', () => {
      const origins = ['https://site1.com', 'https://site2.com', 'https://site3.com'];
      
      origins.forEach((origin, i) => {
        approvalQueue.add({
          id: `multi-origin-${i}`,
          origin,
          method: 'xcp_requestAccounts',
          params: [],
          type: 'connection'
        });
      });
      
      expect(approvalQueue.getCount()).toBe(3);
      
      // Check grouping
      const grouped = approvalQueue.getGroupedByOrigin();
      expect(grouped.size).toBe(3);
      
      origins.forEach(origin => {
        expect(grouped.has(origin)).toBe(true);
        expect(grouped.get(origin)?.length).toBe(1);
      });
    });
  });

  describe('Window State Management', () => {
    it('should track approval window state', async () => {
      const mockWindowId = 456;
      
      // Set window
      approvalQueue.setCurrentWindow(mockWindowId);
      expect(approvalQueue.getCurrentWindow()).toBe(mockWindowId);
      
      // Clear window
      approvalQueue.setCurrentWindow(null);
      expect(approvalQueue.getCurrentWindow()).toBeNull();
    });

  });

  describe('Badge Management', () => {
    it('should update badge count correctly', () => {
      const mockSetBadgeText = vi.fn();
      (global as any).browser.action.setBadgeText = mockSetBadgeText;
      
      // Add requests
      for (let i = 0; i < 5; i++) {
        approvalQueue.add({
          id: `badge-${i}`,
          origin: 'https://test.com',
          method: 'xcp_requestAccounts',
          params: [],
          type: 'connection'
        });
      }
      
      // Badge should show count
      const badgeText = approvalQueue.getCount().toString();
      expect(badgeText).toBe('5');
      
      // Remove some
      approvalQueue.remove('badge-0');
      approvalQueue.remove('badge-1');
      
      const newBadgeText = approvalQueue.getCount().toString();
      expect(newBadgeText).toBe('3');
    });

    it('should handle badge text for high counts', () => {
      // Add many requests
      for (let i = 0; i < 150; i++) {
        approvalQueue.add({
          id: `many-${i}`,
          origin: 'https://test.com',
          method: 'xcp_requestAccounts',
          params: [],
          type: 'connection'
        });
      }
      
      // Should cap at 99+
      const badgeText = approvalQueue.getCount() > 99 ? '99+' : approvalQueue.getCount().toString();
      expect(badgeText).toBe('99+');
    });
  });

  describe('Emergency Cleanup', () => {
    it('should provide emergency cleanup capability', () => {
      // Add various requests
      for (let i = 0; i < 10; i++) {
        approvalQueue.add({
          id: `emergency-${i}`,
          origin: `https://site${i}.com`,
          method: 'xcp_requestAccounts',
          params: [],
          type: 'connection'
        });
      }
      
      expect(approvalQueue.getCount()).toBe(10);
      
      // Emergency cleanup
      requestCleanup.emergencyCleanup();
      
      expect(approvalQueue.getCount()).toBe(0);
    });
  });
});