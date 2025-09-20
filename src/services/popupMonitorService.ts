/**
 * Popup Monitor Service
 *
 * Monitors popup lifecycle events and handles cleanup for pending requests
 * when the popup closes unexpectedly (user closes it, walks away, etc.)
 */

import { eventEmitterService } from '@/services/eventEmitterService';
import { composeRequestStorage } from '@/utils/storage/composeRequestStorage';
import { signMessageRequestStorage } from '@/utils/storage/signMessageRequestStorage';

class PopupMonitorService {
  private popupPort: chrome.runtime.Port | null = null;
  private activeRequests = new Map<string, { type: 'compose' | 'sign', timestamp: number }>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  /**
   * Initialize the popup monitor
   */
  initialize(): void {
    // Listen for popup connections
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === 'popup-lifecycle') {
        this.handlePopupConnect(port);
      }
    });

    // Monitor for window/tab removal (popup closed)
    chrome.windows.onRemoved.addListener((windowId) => {
      this.handlePopupClosed('window-removed');
    });

    // Start periodic cleanup
    this.startPeriodicCleanup();
  }

  /**
   * Handle popup connection
   */
  private handlePopupConnect(port: chrome.runtime.Port): void {
    console.log('[PopupMonitor] Popup connected');
    this.popupPort = port;

    // Listen for disconnect (popup closed)
    port.onDisconnect.addListener(() => {
      console.log('[PopupMonitor] Popup disconnected');
      this.popupPort = null;
      this.handlePopupClosed('disconnect');
    });

    // Listen for messages from popup
    port.onMessage.addListener((msg) => {
      if (msg.type === 'request-active' && msg.requestId) {
        // Track active request
        this.activeRequests.set(msg.requestId, {
          type: msg.requestType,
          timestamp: Date.now()
        });
      } else if (msg.type === 'request-complete' && msg.requestId) {
        // Remove completed request
        this.activeRequests.delete(msg.requestId);
      }
    });
  }

  /**
   * Handle popup closed event
   */
  private async handlePopupClosed(reason: string): Promise<void> {
    console.log(`[PopupMonitor] Popup closed: ${reason}`);

    // Check for any active requests
    if (this.activeRequests.size > 0) {
      console.log(`[PopupMonitor] Found ${this.activeRequests.size} active requests`);

      // Give a short grace period (user might reopen quickly)
      setTimeout(() => {
        this.cancelAbandonedRequests();
      }, 5000); // 5 second grace period
    }
  }

  /**
   * Cancel requests that were abandoned when popup closed
   */
  private async cancelAbandonedRequests(): Promise<void> {
    // If popup reopened, skip cancellation
    if (this.popupPort) {
      console.log('[PopupMonitor] Popup reopened, skipping cancellation');
      return;
    }

    for (const [requestId, info] of this.activeRequests) {
      console.log(`[PopupMonitor] Cancelling abandoned request: ${requestId}`);

      // Emit cancellation event
      if (info.type === 'compose') {
        eventEmitterService.emit(`compose-cancel-${requestId}`, {
          reason: 'Popup closed unexpectedly'
        });
        // Clean up storage
        await composeRequestStorage.remove(requestId);
      } else if (info.type === 'sign') {
        eventEmitterService.emit(`sign-message-cancel-${requestId}`, {
          reason: 'Popup closed unexpectedly'
        });
        await signMessageRequestStorage.remove(requestId);
      }
    }

    // Clear tracked requests
    this.activeRequests.clear();
  }

  /**
   * Start periodic cleanup of stale requests
   */
  private startPeriodicCleanup(): void {
    // Clean up every 60 seconds
    this.cleanupTimer = setInterval(async () => {
      const now = Date.now();
      const STALE_THRESHOLD = 2 * 60 * 1000; // 2 minutes

      // Check tracked requests
      for (const [requestId, info] of this.activeRequests) {
        if (now - info.timestamp > STALE_THRESHOLD) {
          console.log(`[PopupMonitor] Cleaning up stale request: ${requestId}`);

          // Emit timeout event
          if (info.type === 'compose') {
            eventEmitterService.emit(`compose-cancel-${requestId}`, {
              reason: 'Request timeout - popup inactive'
            });
          } else if (info.type === 'sign') {
            eventEmitterService.emit(`sign-message-cancel-${requestId}`, {
              reason: 'Request timeout - popup inactive'
            });
          }

          this.activeRequests.delete(requestId);
        }
      }

      // Also clean up orphaned storage requests
      await this.cleanupOrphanedRequests();
    }, 60000); // Every 60 seconds
  }

  /**
   * Clean up orphaned requests in storage
   */
  private async cleanupOrphanedRequests(): Promise<void> {
    // Clean up compose requests
    const composeRequests = await composeRequestStorage.getAll();
    const now = Date.now();
    const MAX_AGE = 5 * 60 * 1000; // 5 minutes

    for (const request of composeRequests) {
      if (now - request.timestamp > MAX_AGE) {
        console.log(`[PopupMonitor] Removing orphaned compose request: ${request.id}`);
        await composeRequestStorage.remove(request.id);

        // Emit cancellation in case anyone is still listening
        eventEmitterService.emit(`compose-cancel-${request.id}`, {
          reason: 'Request expired'
        });
      }
    }

    // Clean up sign message requests
    const signRequests = await signMessageRequestStorage.getAll();
    for (const request of signRequests) {
      if (now - request.timestamp > MAX_AGE) {
        console.log(`[PopupMonitor] Removing orphaned sign request: ${request.id}`);
        await signMessageRequestStorage.remove(request.id);

        eventEmitterService.emit(`sign-message-cancel-${request.id}`, {
          reason: 'Request expired'
        });
      }
    }
  }

  /**
   * Register a request as active
   */
  registerActiveRequest(requestId: string, type: 'compose' | 'sign'): void {
    this.activeRequests.set(requestId, {
      type,
      timestamp: Date.now()
    });
  }

  /**
   * Mark a request as complete
   */
  markRequestComplete(requestId: string): void {
    this.activeRequests.delete(requestId);
  }

  /**
   * Clean up service
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.activeRequests.clear();
    this.popupPort = null;
  }
}

// Singleton instance
let popupMonitorInstance: PopupMonitorService | null = null;

export function getPopupMonitorService(): PopupMonitorService {
  if (!popupMonitorInstance) {
    popupMonitorInstance = new PopupMonitorService();
  }
  return popupMonitorInstance;
}