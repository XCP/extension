/**
 * Handles cleanup of orphaned provider requests
 */

import { approvalQueue } from './approvalQueue';

class RequestCleanupManager {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL = 30000; // 30 seconds
  private readonly REQUEST_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  
  /**
   * Start periodic cleanup of expired requests
   */
  startCleanup(): void {
    if (this.cleanupInterval) return;
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredRequests();
    }, this.CLEANUP_INTERVAL);
    
    // Also run cleanup immediately
    this.cleanupExpiredRequests();
  }
  
  /**
   * Stop cleanup process
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  /**
   * Clean up expired requests
   */
  private cleanupExpiredRequests(): void {
    const expiredCount = approvalQueue.removeExpired(this.REQUEST_TIMEOUT);
    if (expiredCount > 0) {
      console.log(`Cleaned up ${expiredCount} expired approval requests`);
      
      // Update badge if needed
      if (typeof browser !== 'undefined' && browser.action) {
        const remaining = approvalQueue.getCount();
        browser.action.setBadgeText({ 
          text: remaining > 0 ? remaining.toString() : '' 
        });
      }
    }
  }
  
  /**
   * Handle tab/window close events
   */
  handleTabClosed(tabId: number): void {
    // Get all requests and check if any are associated with this tab
    // This would require tracking tab IDs with requests
    console.log(`Tab ${tabId} closed, checking for orphaned requests`);
  }
  
  /**
   * Handle navigation events (user navigates away from dApp)
   */
  handleNavigation(tabId: number, url: string): void {
    try {
      const origin = new URL(url).origin;
      // Could implement logic to cancel pending requests from previous origin
      console.log(`Tab ${tabId} navigated to ${origin}`);
    } catch (e) {
      // Invalid URL, ignore
    }
  }
  
  /**
   * Clean up all requests from a specific origin
   */
  cleanupByOrigin(origin: string): number {
    return approvalQueue.clearByOrigin(origin);
  }
  
  /**
   * Emergency cleanup - remove all pending requests
   */
  emergencyCleanup(): void {
    approvalQueue.clearAll();
    
    // Clear badge
    if (typeof browser !== 'undefined' && browser.action) {
      browser.action.setBadgeText({ text: '' });
    }
  }
}

export const requestCleanup = new RequestCleanupManager();

// Set up automatic cleanup in background context
if (typeof browser !== 'undefined' && browser.tabs) {
  // Listen for tab close events
  browser.tabs.onRemoved.addListener((tabId) => {
    requestCleanup.handleTabClosed(tabId);
  });
  
  // Listen for navigation events
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.url) {
      requestCleanup.handleNavigation(tabId, tab.url);
    }
  });
  
  // Start periodic cleanup
  requestCleanup.startCleanup();
}