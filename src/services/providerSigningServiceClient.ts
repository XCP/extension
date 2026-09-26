/**
 * The provider signing service as seen from the popup and sidepanel: its name and remote-call
 * policy, and a proxy that forwards calls to the background.
 *
 * Kept apart from providerSigningService.ts so the approval screens get the proxy without bundling
 * the implementation (PSBT decoding, signing plans, the wallet service). The background registers
 * the real service against this same policy, so the two sides cannot drift.
 */
import { defineProxyService, type ProxyServicePolicy } from '@/platform/proxy';
import type { ProviderSigningService } from '@/services/providerSigningService';

export type { ProviderSigningReview } from '@/services/providerSigningService';

export const PROVIDER_SIGNING_SERVICE_NAME = 'ProviderSigningService';

export const PROVIDER_SIGNING_SERVICE_POLICY: ProxyServicePolicy<ProviderSigningService> = {
  methods: { getRequest: 'read', getReview: 'read', approveAndSign: 'command', reject: 'command' },
};

/** A caller-side proxy. It is never registered, so its factory never runs. */
export const [, getProviderSigningServiceClient] = defineProxyService<ProviderSigningService>(
  PROVIDER_SIGNING_SERVICE_NAME,
  () => { throw new Error('ProviderSigningService is registered only in the background'); },
  PROVIDER_SIGNING_SERVICE_POLICY,
);
