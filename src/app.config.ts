import { defineAppConfig } from 'wxt/utils/define-app-config';
import { fathom } from '@/utils/fathom';
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
    providers: [
      fathom({
        siteId: 'PEMZGNDB',
        domain: 'xcp-wallet.ext', // Virtual domain for the extension
      }),
    ],
  },
});