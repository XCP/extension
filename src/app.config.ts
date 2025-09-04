import { defineAppConfig } from '@wxt-dev/analytics/config';
import { storage } from 'wxt/storage';
import { fathom } from '@/utils/analytics/providers/fathom';
import { getKeychainSettings } from '@/utils/storage/settingsStorage';

export default defineAppConfig({
  analytics: {
    debug: process.env.NODE_ENV === 'development',
    // Use the existing analyticsAllowed setting from your KeychainSettings
    enabled: {
      async getValue() {
        const settings = await getKeychainSettings();
        return settings.analyticsAllowed;
      },
      async setValue(value: boolean) {
        // This would need to be integrated with your settings update flow
        // For now, it's read-only from the existing settings
        console.warn('Analytics enabled state should be changed through Settings page');
      }
    },
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