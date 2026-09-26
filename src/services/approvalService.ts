/**
 * ApprovalService - Manages user approval workflows
 *
 * Handles one approval at a time. New requests reject any pending request.
 * Auto-rejects when user closes the popup window.
 *
 * A request outlives its worker. MV3 can stop the background while an approval screen is being
 * read, so the request lives in approvalFlow — the same store the signing flows use — and the
 * waiting caller does not. That Promise cannot be restored, and its port died with the same worker
 * anyway. A request read back afterwards is therefore finished by a completion handler rather than
 * by answering anyone; see registerCompletionHandler.
 */

import { PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { analytics } from '@/platform/fathom';
import { openPopupWindow, type PopupWindow, reusePopupWindow } from '@/platform/popup';
import {
  beginApprovalFlow,
  findPendingApproval,
  recordApprovalOutcome,
} from '@/platform/provider/approvalFlow';
import type { ApprovalRequest, ApprovalRequestOptions, ApprovalResult } from '@/types/provider';

/** The screen every approval opens. Signing requests have their own screens and their own flow. */
const APPROVAL_ROUTE = '/requests/connect/approve';

export type { ApprovalRequestOptions, ApprovalResult };

interface PendingApproval extends ApprovalRequest {
  /** The caller waiting on this request. Absent once it has been restored from storage. */
  waiter?: {
    resolve: (value: any) => void;
    reject: (reason: Error) => void;
  };
}

/** Finishes a request whose caller is gone, doing the work that caller would have done. */
export type CompletionHandler = (
  request: ApprovalRequest,
  result: ApprovalResult
) => Promise<void>;

/** Where the approval screen opens. Not part of the stored request. */
export interface ApprovalPlacement {
  /**
   * An extension window already open for this same request — the unlock window a locked connect
   * opened — to continue in, rather than opening a second window. Ignored if it has closed.
   */
  reuseWindowId?: number;
  /** Called once the approval screen has actually been placed in `reuseWindowId`. */
  onReused?: () => void;
}

export class ApprovalService {
  private pendingApproval: PendingApproval | null = null;
  private completeOrphaned: CompletionHandler | null = null;
  private popup: PopupWindow | null = null;
  private windowRemovedListener: ((windowId: number) => void) | null = null;
  private initialization: Promise<void> | null = null;

  private static readonly REQUEST_TIMEOUT = 5 * 60 * 1000; // 5 minutes fallback

  /**
   * Pick up a request left behind by a previous worker. Called once by the background before it
   * serves anything; repeated calls share the first, and a failed one may be retried.
   */
  initialize(): Promise<void> {
    this.initialization ??= this.resumePendingApproval().catch((error: unknown) => {
      this.initialization = null;
      throw error;
    });
    return this.initialization;
  }

  /**
   * Request user approval for an operation.
   * Only one approval can be pending at a time - new requests reject existing ones.
   */
  async requestApproval<T = boolean>(
    options: ApprovalRequestOptions,
    timeout: number = ApprovalService.REQUEST_TIMEOUT,
    placement: ApprovalPlacement = {}
  ): Promise<T> {
    const { id, origin, method, type, params, metadata } = options;

    // If there's already a pending approval, reject it
    if (this.pendingApproval) {
      console.log('[ApprovalService] Rejecting existing approval for new request');
      this.rejectCurrentApproval('Superseded by new request');
    }

    const request: ApprovalRequest = {
      id,
      origin,
      method,
      type,
      params,
      metadata,
      timestamp: Date.now(),
    };

    // Stored before it is pending anywhere else. A decision arriving between the two would
    // otherwise record an outcome against a request that did not exist yet, and the pending record
    // would then be written over the top of it.
    await beginApprovalFlow(request);

    const promise = new Promise<T>((resolve, reject) => {
      this.pendingApproval = { ...request, waiter: { resolve, reject } };
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (this.pendingApproval?.id === id) {
        this.rejectCurrentApproval('Request timed out');
      }
    }, timeout);

    // Open approval popup
    await this.openApprovalPopup(type, id, origin, placement);

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
    this.updateBadge();

    if (approval.waiter) {
      await recordApprovalOutcome(id, result.approved ? 'completed' : 'cancelled', result);
      if (result.approved) {
        approval.waiter.resolve(result);
      } else {
        approval.waiter.reject(new ProviderError(PROVIDER_ERROR_CODES.USER_REJECTED, 'User denied the request'));
      }
      return true;
    }

    // Nobody is waiting. Refusing is still complete in itself.
    if (!result.approved) {
      await recordApprovalOutcome(id, 'cancelled', result);
      return true;
    }

    // The store drops a request once its TTL has passed, so one whose window closed while the
    // screen sat open is simply no longer there to complete.
    if (!(await findPendingApproval())) {
      console.warn('[ApprovalService] Refusing to complete an expired request:', id);
      return false;
    }

    if (!this.completeOrphaned) {
      console.warn('[ApprovalService] Cannot complete a restored', approval.type, 'request');
      return false;
    }

    await recordApprovalOutcome(id, 'completed', result);
    await this.completeOrphaned(approval, result);
    return true;
  }

  /**
   * Register how to finish an approval whose caller is gone.
   *
   * Sound only because the outcome of the one approval this service handles is state the site can
   * observe afterwards: the grant is stored, and the site reads it from accountsChanged or its next
   * request. Anything whose only product is an artifact for the caller must not be registered here
   * — unregistered means the request expires, which is the safe default.
   */
  registerCompletionHandler(handler: CompletionHandler): void {
    this.completeOrphaned = handler;
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

  // Private methods

  /**
   * Drop the pending approval, telling anyone waiting why.
   *
   * Called from paths that cannot await — a window-close listener, a timeout — so the record is
   * updated without waiting on it. Memory is already correct; storage catches up.
   *
   * Every way an approval ends without one (closed, timed out, superseded, denied) is a 4001 to
   * the site; as a plain Error it reached the page masked as -32603 "Request failed". The reasons
   * are this service's own fixed texts.
   */
  private rejectCurrentApproval(reason: string): void {
    if (!this.pendingApproval) return;

    const approval = this.pendingApproval;
    this.pendingApproval = null;
    void recordApprovalOutcome(approval.id, 'cancelled').catch((error) => {
      console.error('[ApprovalService] Failed to record approval outcome:', error);
    });
    approval.waiter?.reject(new ProviderError(PROVIDER_ERROR_CODES.USER_REJECTED, reason));
    this.updateBadge();
  }

  private async openApprovalPopup(
    type: ApprovalRequest['type'],
    requestId: string,
    origin: string,
    placement: ApprovalPlacement = {}
  ): Promise<void> {
    // Close existing popup if any
    await this.closePopup();

    // Determine the route based on approval type
    const route = APPROVAL_ROUTE;
    const params = new URLSearchParams({
      requestId,
      origin,
    });
    const path = `#${route}?${params.toString()}`;

    // Continue in the window the request is already using when it is still open.
    if (placement.reuseWindowId !== undefined) {
      // Listen before navigating. The window may be closed at any moment; a close landing between
      // the navigation and a listener attached afterwards would leave the request pending until it
      // timed out. reusePopupWindow then checks the window still exists, after the listener is on.
      this.setupWindowCloseListener(placement.reuseWindowId);
      const reused = await reusePopupWindow(placement.reuseWindowId, path);
      if (reused) {
        this.popup = reused;
        placement.onReused?.();
        return;
      }
      this.removeWindowCloseListener();
      // Closed while we were navigating it: the listener has already cancelled this request.
      if (this.pendingApproval?.id !== requestId) return;
    }

    // Open centered popup window
    this.popup = await openPopupWindow(path);

    // Listen for window close to auto-reject
    this.setupWindowCloseListener(this.popup.id);
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

  private async resumePendingApproval(): Promise<void> {
    // It has no waiter, so it can only be finished by a completion handler; the store has already
    // dropped it if its window passed.
    const pending = await findPendingApproval();
    if (pending) {
      const { status, result, ...request } = pending;
      this.pendingApproval = request;
      this.updateBadge();
      console.log('[ApprovalService] Resumed a pending', request.type, 'request');
    }

    console.log('[ApprovalService] Initialized (single-request mode)');
  }
}

// Proxy for cross-context communication
import { defineProxyService } from '@/platform/proxy';
import { APPROVAL_SERVICE_NAME, APPROVAL_SERVICE_POLICY } from '@/services/approvalServiceClient';

export const [registerApprovalService, getApprovalService] = defineProxyService(
  APPROVAL_SERVICE_NAME,
  () => new ApprovalService(),
  APPROVAL_SERVICE_POLICY,
);
