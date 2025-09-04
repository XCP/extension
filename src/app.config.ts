import { defineAppConfig } from '@wxt-dev/analytics/config';
import { storage } from 'wxt/storage';
import { fathom } from '@/utils/analytics/providers/fathom';

export default defineAppConfig({
  analytics: {
    debug: process.env.NODE_ENV === 'development',
    // Store analytics consent in browser.storage.local with existing settings
    enabled: storage.defineItem('local:analyticsAllowed', {
      fallback: false, // Default to disabled for privacy
    }),
    // Generate a random user ID for privacy-preserving analytics
    userId: storage.defineItem('local:analytics-user-id', {
      init: () => crypto.randomUUID(),
    }),
    providers: [
      fathom({
        siteId: 'PEMZGNDB',
        domain: 'xcp-wallet.ext', // Virtual domain for the extension
      }),
    ],
  },
});