/**
 * ApprovalService - Manages user approval workflows
 * 
 * Extracted from ProviderService to handle:
 * - Approval queue management
 * - Approval window orchestration  
 * - User consent workflows
 * - Badge notifications
 * - Request lifecycle management
 */

import { BaseService } from '@/services/core/BaseService';
import { RequestManager } from '@/services/core/RequestManager';
import { eventEmitterService } from '@/services/eventEmitterService';
import { approvalQueue, getApprovalBadgeText } from '@/utils/provider/approvalQueue';
import type { ApprovalRequest } from '@/utils/provider/approvalQueue';
import { analytics } from '#analytics';

export interface ApprovalRequestOptions {
  id: string;
  origin: string;
  method: string;
  params: any[];
  type: 'connection' | 'signature' | 'compose' | 'transaction';
  metadata: {
    domain: string;
    title: string;
    description: string;
    warning?: boolean;
  };
}

export interface ApprovalResult {
  approved: boolean;
  updatedParams?: any;
}

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

    console.log(`Cleared ${requests.length} pending approval requests`);
  }

  /**
   * Ensure approval window is open and focused
   */
  private async ensureApprovalWindow(): Promise<void> {
    if (this.state.currentWindow) {
      try {
        // Try to focus existing window
        await browser.windows.update(this.state.currentWindow, { focused: true });
        return;
      } catch (error) {
        // Window might be closed, create new one
        this.state.currentWindow = null;
      }
    }

    // Create new approval window
    await this.createApprovalWindow();
  }

  /**
   * Create new approval window
   */
  private async createApprovalWindow(): Promise<void> {
    try {
      const window = await browser.windows.create({
        url: browser.runtime.getURL('/popup.html#/provider/approval-queue'),
        type: 'popup',
        width: 350,
        height: 600,
        focused: true,
      });

      if (window?.id) {
        this.state.currentWindow = window.id;

        // Monitor window close
        browser.windows.onRemoved.addListener((windowId) => {
          if (windowId === this.state.currentWindow) {
            this.state.currentWindow = null;
          }
        });
      }
    } catch (error) {
      console.error('Failed to create approval window:', error);
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
        color: text ? '#EF4444' : '#000000' 
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
    const hostname = new URL(options.origin).hostname;

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
    // Set up approval resolution handler
    eventEmitterService.on('resolve-pending-request', ({ requestId, approved, updatedParams }: any) => {
      if (approved) {
        this.resolveApproval(requestId, { approved: true, updatedParams });
      } else {
        this.rejectApproval(requestId, 'User denied the request');
      }
    });

    console.log('ApprovalService initialized');
  }

  protected async onDestroy(): Promise<void> {
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

    console.log('ApprovalService destroyed');
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

    console.log('ApprovalService state restored', {
      windowId: this.state.currentWindow,
      requestStats: this.state.requestStats.size,
    });
  }

  protected getStateVersion(): number {
    return ApprovalService.STATE_VERSION;
  }

}