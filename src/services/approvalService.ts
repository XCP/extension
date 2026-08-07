/**
 * ApprovalService - Manages user approval workflows
 *
 * Handles one approval at a time. New requests reject any pending request.
 * Auto-rejects when user closes the popup window.
 *
 * A request outlives its worker. MV3 can stop the background while an approval screen is being
 * read, so the request is stored and the waiting caller is not — that promise cannot be restored,
 * and its port died with the same worker anyway. A restored request is therefore finished by a
 * completion handler rather than by answering anyone; see registerCompletionHandler.
 */

import { analytics } from '@/platform/fathom';
import { openPopupWindow, type PopupWindow } from '@/platform/popup';
import { BaseService } from '@/services/core/BaseService';
import { eventEmitterService } from '@/services/eventEmitterService';
import type { ApprovalRequest, ApprovalRequestOptions, ApprovalResult } from '@/types/provider';

export type { ApprovalRequestOptions, ApprovalResult };

interface PendingApproval extends ApprovalRequest {
  /** The caller waiting on this request. Absent once it has been restored from storage. */
  waiter?: {
    resolve: (value: any) => void;
    reject: (reason: Error) => void;
  };
}

interface ApprovalServiceState {
  currentWindow: number | null;
}

/** What is stored: the request, never the caller, which cannot outlive its worker anyway. */
interface PersistedState {
  currentWindow: number | null;
  pending: ApprovalRequest | null;
}

/** Finishes a request whose caller is gone, doing the work that caller would have done. */
export type CompletionHandler = (
  request: ApprovalRequest,
  result: ApprovalResult
) => Promise<void>;

export class ApprovalService extends BaseService {
  private pendingApproval: PendingApproval | null = null;
  private completionHandlers = new Map<ApprovalRequest['type'], CompletionHandler>();
  private popup: PopupWindow | null = null;
  private state: ApprovalServiceState = {
    currentWindow: null,
  };
  private windowRemovedListener: ((windowId: number) => void) | null = null;
  private resolveRequestHandler: ((data: any) => void) | null = null;

  private static readonly STATE_VERSION = 3;
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
        waiter: { resolve, reject },
      };
    });

    // Written before the popup opens, since the worker can stop the moment this call yields.
    await this.saveState();

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
   * Resolve the current pending approval.
   *
   * Returns false when nothing came of the call — the request is gone, or it was restored and its
   * type cannot finish without the caller — so the screen can say so rather than close on a click
   * that did nothing.
   */
  async resolveApproval(id: string, result: ApprovalResult): Promise<boolean> {
    if (!this.pendingApproval || this.pendingApproval.id !== id) {
      console.warn('[ApprovalService] No matching pending approval to resolve:', id);
      return false;
    }

    const approval = this.pendingApproval;
    this.pendingApproval = null;
    this.persist();
    this.updateBadge();

    if (approval.waiter) {
      if (result.approved) {
        approval.waiter.resolve(result);
      } else {
        approval.waiter.reject(new Error('User denied the request'));
      }
      return true;
    }

    // Restored, so there is nobody to answer. Refusing is still complete in itself.
    if (!result.approved) return true;

    const complete = this.completionHandlers.get(approval.type);
    if (!complete) {
      console.warn('[ApprovalService] Cannot complete a restored', approval.type, 'request');
      return false;
    }

    await complete(approval, result);
    return true;
  }

  /**
   * Register how to finish an approval of this type when its caller is gone.
   *
   * Only register one where the outcome is state the site can observe afterwards, as a connection
   * grant is. A signature or a transaction is not: its only product is an artifact for a caller
   * that no longer exists. A type left unregistered expires, which is the safe default.
   */
  registerCompletionHandler(type: ApprovalRequest['type'], handler: CompletionHandler): void {
    this.completionHandlers.set(type, handler);
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

    // Everything but the caller, which is neither the UI's business nor storable.
    const { waiter, ...request } = this.pendingApproval;
    return request;
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
    this.persist();
    approval.waiter?.reject(new Error(reason));
    this.updateBadge();
  }

  /**
   * Write the request through to storage without waiting, for the paths that cannot await — a
   * window-close listener, a timeout — where memory is already correct and storage catches up.
   */
  private persist(): void {
    void this.saveState().catch((error) => {
      console.error('[ApprovalService] Failed to persist approval state:', error);
    });
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
        return '/requests/connect/approve';
      case 'transaction':
        return '/requests/transaction/approve';
      case 'signature':
        return '/requests/signature/approve';
      case 'compose':
        return '/requests/compose/approve';
      default:
        return '/requests/connect/approve';
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
        void this.resolveApproval(requestId, { approved: true, updatedParams }).catch((error) => {
          console.error('[ApprovalService] Failed to resolve approval:', error);
        });
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

  protected getSerializableState(): PersistedState {
    // Always an object, never null: clearing a settled request is a write, not the absence of one.
    return {
      currentWindow: this.state.currentWindow,
      pending: this.getCurrentApproval(),
    };
  }

  protected hydrateState(state: PersistedState): void {
    // Don't restore window ID - it may be stale
    if (!state?.pending) return;

    // The timeout that would have rejected this died with its worker, so age is checked here
    // instead — otherwise a request could wait in storage indefinitely, then be completed by a
    // click on a screen left open long after the site stopped expecting an answer.
    const age = Date.now() - state.pending.timestamp;
    if (age > ApprovalService.REQUEST_TIMEOUT) {
      this.persist(); // drops the stale record
      return;
    }

    this.pendingApproval = state.pending;
    this.updateBadge();
    console.log('[ApprovalService] Restored a pending', state.pending.type, 'request');
  }

  protected getStateVersion(): number {
    return ApprovalService.STATE_VERSION;
  }
}

// Proxy for cross-context communication
import { defineProxyService } from '@/platform/proxy';

export const [registerApprovalService, getApprovalService] = defineProxyService(
  'ApprovalService',
  () => new ApprovalService()
);
