import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import removeConsole from 'vite-plugin-remove-console';
import pkg from './package.json';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  targetBrowsers: ['chrome', 'firefox'],
  webExt: {
    chromiumPort: 9222,
  },
  manifest: (env) => {
    const baseManifest = {
      name: `XCP Wallet v${pkg.version}`,
      web_accessible_resources: [
        {
          resources: ['injected.js'],
          matches: ['<all_urls>'],
        },
      ],
      permissions: [
        'sidePanel',
        'storage',
        'tabs',
        'alarms',
        'scripting', // Required for Trezor Connect to inject content scripts
      ],
      host_permissions: [
        '*://connect.trezor.io/9/*', // Required for Trezor Connect popup communication
        'http://localhost:21325/*', // Trezor Bridge for emulator testing
        'http://127.0.0.1:21325/*', // Trezor Bridge alternative address
      ],
    };

    // Firefox-specific: Add data collection consent (required for Firefox 140+)
    // This enables Firefox's built-in consent UI for analytics
    if (env.browser === 'firefox') {
      return {
        ...baseManifest,
        browser_specific_settings: {
          gecko: {
            id: 'wallet@xcpwallet.com',
            strict_min_version: '109.0',
            data_collection_permissions: {
              // technicalAndInteraction is opt-out by default in Firefox's UI
              // Users can toggle it during install or in about:addons
              optional: ['technicalAndInteraction'],
            },
          },
        },
      };
    }

    return baseManifest;
  },
  vite: (configEnv) => ({
    plugins: [
      ...(configEnv.mode === 'production' ? [removeConsole({ includes: ['log', 'error'] })] : []),
      tailwindcss(),
    ],
  }),
});
