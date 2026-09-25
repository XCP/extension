/**
 * The provider service as seen from outside the background: its name and remote-call policy, and a
 * proxy that forwards calls to the worker.
 *
 * Kept apart from providerService.ts so the content script, injected into every page, gets the
 * proxy without bundling the implementation (content scripts cannot be code-split, so even a
 * dynamic import of providerService.ts inlined all of it). The background registers the real
 * service against this same policy, so the two sides cannot drift.
 */
import { defineProxyService, type ProxyServicePolicy } from '@/platform/proxy';
import type { ProviderService } from '@/services/providerService';

export const PROVIDER_SERVICE_NAME = 'ProviderService';

export const PROVIDER_SERVICE_POLICY: ProxyServicePolicy<ProviderService> = {
  methods: {
    handleRequest: 'command', isConnected: 'read', disconnect: 'command',
    getCurrentApproval: 'read', getRequestStats: 'read',
  },
  contentScript: 'provider',
};

/** A caller-side proxy. It is never registered, so its factory never runs. */
export const [, getProviderServiceClient] = defineProxyService<ProviderService>(
  PROVIDER_SERVICE_NAME,
  () => { throw new Error('ProviderService is registered only in the background'); },
  PROVIDER_SERVICE_POLICY,
);
