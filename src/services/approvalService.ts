/**
 * ApprovalService - Manages user approval workflows
 *
 * Handles one approval at a time. New requests reject any pending request.
 * Auto-rejects when user closes the popup window.
 */

import { BaseService } from '@/services/core/BaseService';
import { eventEmitterService } from '@/services/eventEmitterService';
import { openPopupWindow, type PopupWindow } from '@/utils/popup';
import type { ApprovalRequest, ApprovalRequestOptions, ApprovalResult } from '@/types/provider';
import { analytics } from '@/utils/fathom';

export type { ApprovalRequestOptions, ApprovalResult };

interface PendingApproval {
  id: string;
  origin: string;
  method: string;
  type: ApprovalRequest['type'];
  params: any[];
  metadata: ApprovalRequestOptions['metadata'];
  timestamp: number;
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
}

interface ApprovalServiceState {
  currentWindow: number | null;
}

export class ApprovalService extends BaseService {
  private pendingApproval: PendingApproval | null = null;
  private popup: PopupWindow | null = null;
  private state: ApprovalServiceState = {
    currentWindow: null,
  };
  private windowRemovedListener: ((windowId: number) => void) | null = null;
  private resolveRequestHandler: ((data: any) => void) | null = null;

  private static readonly STATE_VERSION = 2;
  private static readonly REQUEST_TIMEOUT = 5 * 60 * 1000; // 5 minutes fallback

  constructor() {
    super('ApprovalService');
  }

  /**
   * Request user approval for an operation.
   * Only one approval can be pending at a time - new requests reject existing ones.
   */
  async requestApproval<T = boolean>(
    options: ApprovalRequestOptions,
    timeout: number = ApprovalService.REQUEST_TIMEOUT
  ): Promise<T> {
    const { id, origin, method, type, params, metadata } = options;

    // If there's already a pending approval, reject it
    if (this.pendingApproval) {
      console.log('[ApprovalService] Rejecting existing approval for new request');
      this.rejectCurrentApproval('Superseded by new request');
    }

    // Create the approval promise
    const promise = new Promise<T>((resolve, reject) => {
      this.pendingApproval = {
        id,
        origin,
        method,
        type,
        params,
        metadata,
        timestamp: Date.now(),
        resolve,
        reject,
      };
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (this.pendingApproval?.id === id) {
        this.rejectCurrentApproval('Request timed out');
      }
    }, timeout);

    // Open approval popup
    await this.openApprovalPopup(type, id, origin);

    // Update badge
    this.updateBadge();

    try {
      const result = await promise;
      clearTimeout(timeoutId);
      await this.trackApprovalResult(options, true);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      await this.trackApprovalResult(options, false);
      throw error;
    } finally {
      this.updateBadge();
    }
  }

  /**
   * Resolve the current pending approval
   */
  resolveApproval(id: string, result: ApprovalResult): boolean {
    if (!this.pendingApproval || this.pendingApproval.id !== id) {
      console.warn('[ApprovalService] No matching pending approval to resolve:', id);
      return false;
    }

    const approval = this.pendingApproval;
    this.pendingApproval = null;

    if (result.approved) {
      approval.resolve(result);
    } else {
      approval.reject(new Error('User denied the request'));
    }

    this.updateBadge();
    return true;
  }

  /**
   * Reject the current pending approval
   */
  rejectApproval(id: string, reason: string = 'User denied the request'): boolean {
    if (!this.pendingApproval || this.pendingApproval.id !== id) {
      console.warn('[ApprovalService] No matching pending approval to reject:', id);
      return false;
    }

    this.rejectCurrentApproval(reason);
    return true;
  }

  /**
   * Get the current pending approval (for UI to display)
   */
  getCurrentApproval(): ApprovalRequest | null {
    if (!this.pendingApproval) return null;

    return {
      id: this.pendingApproval.id,
      origin: this.pendingApproval.origin,
      method: this.pendingApproval.method,
      type: this.pendingApproval.type,
      params: this.pendingApproval.params,
      timestamp: this.pendingApproval.timestamp,
      metadata: this.pendingApproval.metadata,
    };
  }

  /**
   * Check if there's a pending approval
   */
  hasPendingApproval(): boolean {
    return this.pendingApproval !== null;
  }

  /**
   * Clear any pending approval
   */
  async clearAllRequests(reason: string = 'Service shutdown'): Promise<void> {
    if (this.pendingApproval) {
      this.rejectCurrentApproval(reason);
    }
    await this.closePopup();
  }

  // Private methods

  private rejectCurrentApproval(reason: string): void {
    if (!this.pendingApproval) return;

    const approval = this.pendingApproval;
    this.pendingApproval = null;
    approval.reject(new Error(reason));
    this.updateBadge();
  }

  private async openApprovalPopup(
    type: ApprovalRequest['type'],
    requestId: string,
    origin: string
  ): Promise<void> {
    // Close existing popup if any
    await this.closePopup();

    // Determine the route based on approval type
    const route = this.getRouteForType(type);
    const params = new URLSearchParams({
      requestId,
      origin,
    });

    // Open centered popup window
    this.popup = await openPopupWindow(`#${route}?${params.toString()}`);
    this.state.currentWindow = this.popup.id;

    // Listen for window close to auto-reject
    this.setupWindowCloseListener(this.popup.id);
  }

  private getRouteForType(type: ApprovalRequest['type']): string {
    switch (type) {
      case 'connection':
        return '/provider/approve-connection';
      case 'transaction':
        return '/provider/approve-transaction';
      case 'signature':
        return '/provider/approve-signature';
      case 'compose':
        return '/provider/approve-compose';
      default:
        return '/provider/approve-connection';
    }
  }

  private setupWindowCloseListener(windowId: number): void {
    // Remove any existing listener
    this.removeWindowCloseListener();

    // Create new listener
    this.windowRemovedListener = (removedWindowId: number) => {
      if (removedWindowId === windowId) {
        console.log('[ApprovalService] Popup window closed by user');
        this.rejectCurrentApproval('User closed the window');
        this.removeWindowCloseListener();
        this.popup = null;
        this.state.currentWindow = null;
      }
    };

    chrome.windows.onRemoved.addListener(this.windowRemovedListener);
  }

  private removeWindowCloseListener(): void {
    if (this.windowRemovedListener) {
      chrome.windows.onRemoved.removeListener(this.windowRemovedListener);
      this.windowRemovedListener = null;
    }
  }

  private async closePopup(): Promise<void> {
    this.removeWindowCloseListener();

    if (this.popup) {
      await this.popup.close();
      this.popup = null;
    }

    this.state.currentWindow = null;
  }

  private updateBadge(): void {
    const text = this.pendingApproval ? '1' : '';

    if (chrome.action) {
      chrome.action.setBadgeText({ text });
      chrome.action.setBadgeBackgroundColor({
        color: text ? '#3B82F6' : '#000000'
      });
    }
  }

  private async trackApprovalResult(
    options: ApprovalRequestOptions,
    approved: boolean
  ): Promise<void> {
    const eventName = approved ? 'request_approved' : 'request_rejected';
    await analytics.track(eventName);
  }

  // BaseService implementation

  protected async onInitialize(): Promise<void> {
    // Set up approval resolution handler
    this.resolveRequestHandler = ({ requestId, approved, updatedParams }: any) => {
      if (approved) {
        this.resolveApproval(requestId, { approved: true, updatedParams });
      } else {
        this.rejectApproval(requestId, 'User denied the request');
      }
    };
    eventEmitterService.on('resolve-pending-request', this.resolveRequestHandler);

    console.log('[ApprovalService] Initialized (single-request mode)');
  }

  protected async onDestroy(): Promise<void> {
    // Unregister event listener
    if (this.resolveRequestHandler) {
      eventEmitterService.off('resolve-pending-request', this.resolveRequestHandler);
      this.resolveRequestHandler = null;
    }

    // Clear pending approval
    await this.clearAllRequests('Service shutting down');

    // Remove window listener
    this.removeWindowCloseListener();

    console.log('[ApprovalService] Destroyed');
  }

  protected getSerializableState(): { currentWindow: number | null } | null {
    return this.state.currentWindow ? { currentWindow: this.state.currentWindow } : null;
  }

  protected hydrateState(state: { currentWindow: number | null }): void {
    // Don't restore window ID - it may be stale
    console.log('[ApprovalService] State hydration skipped (fresh start)');
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
