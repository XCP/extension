/**
 * MessageBus utilities for popup context
 *
 * Provides helpers for sending messages from popup to background
 * using webext-bridge for proper cross-context communication
 */

import { sendMessage } from 'webext-bridge/popup';

export class MessageBus {
  /**
   * Resolve a provider approval request
   * Sends the approval/rejection decision to the background script
   */
  static async resolveApprovalRequest(
    requestId: string,
    approved: boolean,
    updatedParams?: any
  ): Promise<void> {
    await sendMessage('resolve-provider-request', {
      type: 'RESOLVE_PROVIDER_REQUEST',
      requestId,
      approved,
      updatedParams
    }, 'background');
  }
}