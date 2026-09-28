/**
 * The provider signing service as seen from the popup and sidepanel: its name and remote-call
 * policy, and a proxy that forwards calls to the background.
 *
 * Kept apart from providerSigningService.ts so the approval screens get the proxy without bundling
 * the implementation (PSBT decoding, signing plans, the wallet service). The background registers
 * the real service against this same policy, so the two sides cannot drift.
 */

import type { ProviderApprovalPolicy } from '@/core/bitcoin/providerApprovalPolicy';
import type { DecodedPsbtInfo } from '@/core/bitcoin/psbtApprovalDecoder';
import type { DecodedPsbtBundleInfo } from '@/core/bitcoin/psbtBundleApprovalDecoder';
import type { DecodedTransactionInfo } from '@/core/bitcoin/transactionApprovalDecoder';
import type { PairedGrant } from '@/core/pairedGrant';
import type { SignMessageRequest, SignPsbtRequest, SignPsbtsRequest, SignTransactionRequest } from '@/platform/provider/signFlow';
import { defineProxyClient } from '@/platform/proxy/client';
import type { ProxyServicePolicy } from '@/platform/proxy/protocol';
import type { ProviderSigningService } from '@/services/providerSigningService';

/** What an approval screen reviews: defined here, beside the proxy, so screens never import the service. */
export interface ReviewBase {
  reviewKey: string;
  policy: ProviderApprovalPolicy;
  fastestFee?: number;
  /**
   * The origin's paired grant when this request may continue after a switch to the active
   * address's Legacy/SegWit sibling. Lets the screen keep the review open; execution re-reads
   * the current grant and authorizes every signer against it. Included in reviewKey, so a grant
   * change invalidates an open review (review_changed) on purpose.
   */
  pairedGrant?: PairedGrant;
}
export type ProviderSigningReview = ReviewBase & (
  | { kind: 'sign-message'; request: SignMessageRequest }
  | { kind: 'sign-transaction'; request: SignTransactionRequest; decodedInfo: DecodedTransactionInfo }
  | { kind: 'sign-psbt'; request: SignPsbtRequest; decodedInfo: DecodedPsbtInfo }
  | { kind: 'sign-psbts'; request: SignPsbtsRequest; decodedInfo: DecodedPsbtBundleInfo }
);

export const PROVIDER_SIGNING_SERVICE_NAME = 'ProviderSigningService';

export const PROVIDER_SIGNING_SERVICE_POLICY: ProxyServicePolicy<ProviderSigningService> = {
  methods: { getRequest: 'read', getReview: 'read', approveAndSign: 'command', reject: 'command' },
};

/** A caller-side proxy. It has no implementation behind it, so calling it in the background throws. */
export const getProviderSigningServiceClient = defineProxyClient<ProviderSigningService>(PROVIDER_SIGNING_SERVICE_NAME, PROVIDER_SIGNING_SERVICE_POLICY);
