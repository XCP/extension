/**
 * The provider signing service as seen from the popup and sidepanel: its name and remote-call
 * policy, and a proxy that forwards calls to the background.
 *
 * Kept apart from providerSigningService.ts so the approval screens get the proxy without bundling
 * the implementation (PSBT decoding, signing plans, the wallet service). The background registers
 * the real service against this same policy, so the two sides cannot drift.
 */
import { defineProxyClient } from '@/platform/proxy/client';
import type { ProxyServicePolicy } from '@/platform/proxy/protocol';
import type { ProviderSigningService } from '@/services/providerSigningService';

export type { ProviderSigningReview } from '@/services/providerSigningService';

export const PROVIDER_SIGNING_SERVICE_NAME = 'ProviderSigningService';

export const PROVIDER_SIGNING_SERVICE_POLICY: ProxyServicePolicy<ProviderSigningService> = {
  methods: { getRequest: 'read', getReview: 'read', approveAndSign: 'command', reject: 'command' },
};

/** A caller-side proxy. It has no implementation behind it, so calling it in the background throws. */
export const getProviderSigningServiceClient = defineProxyClient<ProviderSigningService>(PROVIDER_SIGNING_SERVICE_NAME, PROVIDER_SIGNING_SERVICE_POLICY);
