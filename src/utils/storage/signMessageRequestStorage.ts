/**
 * Storage for pending sign message requests from dApps
 *
 * When a dApp calls xcp_signMessage, we store the request parameters
 * here so the popup can retrieve them and pre-populate the sign message form.
 */

import { RequestStorage, BaseRequest } from './requestStorage';

/**
 * Sign message request from a dApp.
 */
export interface SignMessageRequest extends BaseRequest {
  message: string;
}

/**
 * Storage instance for sign message requests.
 */
export const signMessageRequestStorage = new RequestStorage<SignMessageRequest>({
  storageKey: 'pending_sign_message_requests',
  requestName: 'sign message request',
});
