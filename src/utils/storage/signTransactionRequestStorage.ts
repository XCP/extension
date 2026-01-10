/**
 * Storage for pending raw transaction signing requests from dApps
 *
 * When a dApp calls xcp_signTransaction, we store the request parameters
 * here so the popup can retrieve them and show the approval UI.
 */

import { RequestStorage, BaseRequest } from './requestStorage';

/**
 * Sign transaction request from a dApp.
 */
export interface SignTransactionRequest extends BaseRequest {
  rawTxHex: string;
}

/**
 * Storage instance for sign transaction requests.
 */
export const signTransactionRequestStorage = new RequestStorage<SignTransactionRequest>({
  storageKey: 'pending_sign_transaction_requests',
  requestName: 'sign transaction request',
});
