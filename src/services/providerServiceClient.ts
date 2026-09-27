/**
 * The provider service as seen from outside the background: its name and remote-call policy, and a
 * proxy that forwards calls to the worker.
 *
 * Kept apart from providerService.ts so the content script, injected into every page, gets the
 * proxy without bundling the implementation (content scripts cannot be code-split, so even a
 * dynamic import of providerService.ts inlined all of it). The background registers the real
 * service against this same policy, so the two sides cannot drift.
 */
import { defineProxyClient } from '@/platform/proxy/client';
import type { ProxyServicePolicy } from '@/platform/proxy/protocol';
import type { ProviderService } from '@/services/providerService';

export const PROVIDER_SERVICE_NAME = 'ProviderService';

export const PROVIDER_SERVICE_POLICY: ProxyServicePolicy<ProviderService> = {
  methods: { handleRequest: 'command', disconnect: 'command' },
  contentScript: 'provider',
};

/** A caller-side proxy. It has no implementation behind it, so calling it in the background throws. */
export const getProviderServiceClient = defineProxyClient<ProviderService>(PROVIDER_SERVICE_NAME, PROVIDER_SERVICE_POLICY);
