/**
 * Storage for pending PSBT signing requests from dApps
 *
 * When a dApp calls xcp_signPsbt, we store the request parameters
 * here so the popup can retrieve them and show the approval UI.
 */

import { RequestStorage, BaseRequest } from './requestStorage';

/**
 * Sign PSBT request from a dApp.
 */
export interface SignPsbtRequest extends BaseRequest {
  psbtHex: string;
  signInputs?: Record<string, number[]>;
  sighashTypes?: number[];
}

/**
 * Storage instance for sign PSBT requests.
 */
export const signPsbtRequestStorage = new RequestStorage<SignPsbtRequest>({
  storageKey: 'pending_sign_psbt_requests',
  requestName: 'sign PSBT request',
});
