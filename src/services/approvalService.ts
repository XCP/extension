/**
 * ApprovalService - Manages user approval workflows
 *
 * Extracted from ProviderService to handle:
 * - Approval queue management
 * - Approval window orchestration
 * - User consent workflows
 * - Badge notifications
 * - Request lifecycle management
 *
 * ## Architecture Decision Records
 *
 * ### ADR-007: Distributed Request State (Intentional Design)
 *
 * **Context**: Request state is distributed across services:
 * - ApprovalService: Pending approval requests (via RequestManager)
 * - ConnectionService: Active connection state
 * - approvalQueue: UI queue for popup display
 *
 * **Decision**: Keep request state distributed by domain.
 *
 * **Rationale**:
 * - Separation of concerns: each service owns its domain state
 * - ApprovalService handles approval lifecycle
 * - ConnectionService handles connection persistence
 * - approvalQueue is a UI concern (badge count, popup display)
 * - MetaMask has similar separation (ApprovalController, ConnectionController)
 * - Consolidating would create a "god object" anti-pattern
 *
 * **Trade-offs**:
 * - Multiple places to look when debugging request flow
 * - Potential for state drift between services
 * - Mitigated by: event-driven communication, clear service boundaries
 *
 * **Alternative Considered**:
 * - Single centralized request store: Rejected due to tight coupling
 * - Redux-style global state: Overkill for extension scope
 */

import { BaseService } from '@/services/core/BaseService';
import { RequestManager } from '@/services/core/RequestManager';
import { eventEmitterService } from '@/services/eventEmitterService';
import { approvalQueue, getApprovalBadgeText } from '@/utils/provider/approvalQueue';
import type { ApprovalRequest, ApprovalRequestOptions, ApprovalResult } from '@/types/provider';
import { analytics } from '@/utils/fathom';

// Re-export types for backwards compatibility
export type { ApprovalRequestOptions, ApprovalResult };

interface ApprovalServiceState {
  currentWindow: number | null;
  requestStats: Map<string, { count: number; lastRequest: number }>;
}

interface SerializedApprovalState {
  currentWindow: number | null;
  requestStats: Array<{ origin: string; count: number; lastRequest: number }>;
}

export class ApprovalService extends BaseService {
  private requestManager: RequestManager;
  private state: ApprovalServiceState = {
    currentWindow: null,
    requestStats: new Map(),
  };
  private resolveRequestHandler: ((data: any) => void) | null = null;

  private static readonly STATE_VERSION = 1;
  private static readonly MAX_CONCURRENT_REQUESTS = 10;
  private static readonly REQUEST_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super('ApprovalService');
    this.requestManager = new RequestManager(
      ApprovalService.REQUEST_TIMEOUT,
      60000 // 1 minute cleanup interval
    );
  }

  /**
   * Request user approval for an operation
   */
  async requestApproval<T = boolean>(
    options: ApprovalRequestOptions,
    timeout: number = ApprovalService.REQUEST_TIMEOUT
  ): Promise<T> {
    const { id, origin, method, type } = options;

    // Check for too many concurrent requests
    if (this.requestManager.size() >= ApprovalService.MAX_CONCURRENT_REQUESTS) {
      throw new Error('Too many pending requests. Please wait.');
    }

    // Track request statistics
    this.updateRequestStats(origin);

    // Add to approval queue
    approvalQueue.add({
      id,
      origin,
      method,
      params: options.params,
      type,
      metadata: options.metadata,
    });

    // Create managed promise
    const promise = this.requestManager.createManagedPromise<T>(id, {
      origin,
      method,
      metadata: { type, domain: options.metadata.domain },
    });

    // Open or focus approval window
    await this.ensureApprovalWindow();

    // Update badge
    this.updateBadge();

    try {
      const result = await promise;

      // Track approval result
      await this.trackApprovalResult(options, true);

      return result;
    } catch (error) {
      // Remove from approval queue if still there
      approvalQueue.remove(id);

      // Track rejection
      await this.trackApprovalResult(options, false);

      throw error;
    } finally {
      // Update badge after completion
      this.updateBadge();
    }
  }

  /**
   * Resolve a pending approval request
   */
  resolveApproval(id: string, result: ApprovalResult): boolean {
    // Remove from approval queue
    const removed = approvalQueue.remove(id);

    // Resolve the managed promise
    const resolved = this.requestManager.resolve(id, result.approved ? result : false);

    // Update badge
    this.updateBadge();

    return removed && resolved;
  }

  /**
   * Reject a pending approval request
   */
  rejectApproval(id: string, reason: string = 'User denied the request'): boolean {
    // Remove from approval queue
    const removed = approvalQueue.remove(id);

    // Reject the managed promise
    const rejected = this.requestManager.reject(id, new Error(reason));

    // Update badge
    this.updateBadge();

    return removed && rejected;
  }

  /**
   * Get all pending approval requests
   */
  async getApprovalQueue(): Promise<ApprovalRequest[]> {
    return approvalQueue.getAll();
  }

  /**
   * Remove an approval request without resolving
   */
  async removeApprovalRequest(id: string): Promise<boolean> {
    // Remove from both queue and request manager
    const queueRemoved = approvalQueue.remove(id);
    const requestRemoved = this.requestManager.remove(id);

    // Update badge
    this.updateBadge();

    return queueRemoved || requestRemoved;
  }

  /**
   * Clear all pending requests
   */
  async clearAllRequests(reason: string = 'Service shutdown'): Promise<void> {
    // Clear approval queue
    const requests = approvalQueue.getAll();
    for (const request of requests) {
      approvalQueue.remove(request.id);
    }

    // Clear request manager
    this.requestManager.clear(true, reason);

    // Update badge
    this.updateBadge();

    console.log(`[ApprovalService] Cleared ${requests.length} pending approval requests`);
  }

  /**
   * Ensure approval window is open and focused
   */
  private async ensureApprovalWindow(): Promise<void> {
    // Step 1: Try to open the regular extension popup (preferred method)
    try {
      await chrome.action.openPopup();
      // Success - popup opened, we're done
      return;
    } catch (error) {
      // openPopup failed - could be already open, not supported, or other error
      // Don't try to parse error message, just move to fallback
    }

    // Step 2: Search for existing popup window
    try {
      const windows = await chrome.windows.getAll({ populate: true });

      // Find any window with our popup.html
      for (const window of windows) {
        if (window.tabs?.some(tab =>
          tab.url?.includes(chrome.runtime.id) &&
          tab.url?.includes('popup.html')
        )) {
          // Found existing popup window, focus it
          await chrome.windows.update(window.id!, { focused: true });

          // Try to navigate to approval queue
          chrome.runtime.sendMessage({
            type: 'NAVIGATE_TO_APPROVAL_QUEUE'
          }).catch(() => {
            // Popup might not be ready, that's ok
          });

          return;
        }
      }
    } catch (searchError) {
      console.error('[ApprovalService] Failed to search for popup:', searchError);
    }

    // Step 3: No popup found anywhere, create window as fallback
    console.log('[ApprovalService] No popup found, creating new window');
    await this.createPopupWindow();
  }

  /**
   * Create popup window as fallback
   */
  private async createPopupWindow(): Promise<void> {
    try {
      const window = await browser.windows.create({
        url: browser.runtime.getURL('/popup.html#/provider/approval-queue'),
        type: 'popup',
        width: 400,
        height: 600,
        focused: true,
      });

      if (window?.id) {
        this.state.currentWindow = window.id;
      }
    } catch (error) {
      console.error('[ApprovalService] Failed to create popup window:', error);
      throw new Error('Failed to open approval window');
    }
  }

  /**
   * Update extension badge with pending request count
   */
  private updateBadge(): void {
    const text = getApprovalBadgeText();

    if (browser.action) {
      browser.action.setBadgeText({ text });
      browser.action.setBadgeBackgroundColor({
        color: text ? '#3B82F6' : '#000000'
      });
    }
  }

  /**
   * Update request statistics for rate limiting awareness
   */
  private updateRequestStats(origin: string): void {
    const now = Date.now();
    const stats = this.state.requestStats.get(origin) || { count: 0, lastRequest: 0 };
    
    // Reset count if more than 1 hour since last request
    if (now - stats.lastRequest > 60 * 60 * 1000) {
      stats.count = 0;
    }

    stats.count++;
    stats.lastRequest = now;
    
    this.state.requestStats.set(origin, stats);
  }

  /**
   * Track approval result for analytics
   */
  private async trackApprovalResult(
    options: ApprovalRequestOptions,
    approved: boolean
  ): Promise<void> {
    const eventName = approved ? 'request_approved' : 'request_rejected';

    await analytics.track(eventName, { value: '1' });
  }

  /**
   * Get approval statistics
   */
  getApprovalStats(): {
    pendingCount: number;
    queueSize: number;
    requestsByOrigin: Record<string, { count: number; lastRequest: number }>;
    averageResponseTime: number;
  } {
    const requestsByOrigin: Record<string, { count: number; lastRequest: number }> = {};
    
    for (const [origin, stats] of Array.from(this.state.requestStats)) {
      requestsByOrigin[origin] = stats;
    }

    return {
      pendingCount: this.requestManager.size(),
      queueSize: approvalQueue.getAll().length,
      requestsByOrigin,
      averageResponseTime: 0, // Would need to track response times
    };
  }

  // BaseService implementation methods

  protected async onInitialize(): Promise<void> {
    // Set up approval resolution handler (store reference for cleanup)
    this.resolveRequestHandler = ({ requestId, approved, updatedParams }: any) => {
      if (approved) {
        this.resolveApproval(requestId, { approved: true, updatedParams });
      } else {
        this.rejectApproval(requestId, 'User denied the request');
      }
    };
    eventEmitterService.on('resolve-pending-request', this.resolveRequestHandler);

    console.log('[ApprovalService] Initialized');
  }

  protected async onDestroy(): Promise<void> {
    // Unregister event listener to prevent memory leak
    if (this.resolveRequestHandler) {
      eventEmitterService.off('resolve-pending-request', this.resolveRequestHandler);
      this.resolveRequestHandler = null;
    }

    // Clear all pending requests
    await this.clearAllRequests('Service shutting down');

    // Cleanup request manager
    this.requestManager.destroy();

    // Close approval window if open
    if (this.state.currentWindow) {
      try {
        await browser.windows.remove(this.state.currentWindow);
      } catch (error) {
        // Window might already be closed
      }
    }

    // Clear state
    this.state.requestStats.clear();
    this.state.currentWindow = null;

    console.log('[ApprovalService] Destroyed');
  }

  protected getSerializableState(): SerializedApprovalState | null {
    if (this.state.requestStats.size === 0 && !this.state.currentWindow) {
      return null;
    }

    return {
      currentWindow: this.state.currentWindow,
      requestStats: Array.from(this.state.requestStats.entries()).map(
        ([origin, stats]) => ({ origin, ...stats })
      ),
    };
  }

  protected hydrateState(state: SerializedApprovalState): void {
    // Restore window ID (but don't assume it's still valid)
    this.state.currentWindow = state.currentWindow;

    // Restore request statistics
    for (const { origin, count, lastRequest } of state.requestStats) {
      this.state.requestStats.set(origin, { count, lastRequest });
    }

    console.log('[ApprovalService] State restored', {
      windowId: this.state.currentWindow,
      requestStats: this.state.requestStats.size,
    });
  }

  protected getStateVersion(): number {
    return ApprovalService.STATE_VERSION;
  }
}

// Proxy for cross-context communication
import { defineProxyService } from '@/utils/proxy';

export const [registerApprovalService, getApprovalService] = defineProxyService(
  'ApprovalService',
  () => new ApprovalService()
);