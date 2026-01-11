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
      if (chrome?.action) {
        const remaining = approvalQueue.getCount();
        chrome.action.setBadgeText({
          text: remaining > 0 ? remaining.toString() : ''
        });
      }
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
    if (chrome?.action) {
      chrome.action.setBadgeText({ text: '' });
    }
  }
}

export const requestCleanup = new RequestCleanupManager();