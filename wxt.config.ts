import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

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
      name: 'XCP Wallet',
      web_accessible_resources: [
        {
          resources: ['injected.js'],
          // Mirror the content-script matches so injected.js isn't probeable on
          // pages where the provider is never injected (fingerprinting surface).
          matches: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
        },
      ],
      permissions: [
        'sidePanel',
        'storage',
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
            // storage.session, which holds the unlocked session key, was added in Firefox 115.
            strict_min_version: '115.0',
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
    plugins: [tailwindcss()],
    define: {
      // Enable Trezor test mode when TREZOR_TEST_MODE env var is set
      // This is used in CI to allow the extension to connect to the emulator via BridgeTransport
      // Note: Don't use JSON.stringify - we need actual boolean, not string "true"
      __TREZOR_TEST_MODE__: process.env.TREZOR_TEST_MODE === 'true',
    },
    build: {
      // Vite 8 minifies with Oxc/Rolldown. Keep production diagnostics out of the distributed
      // wallet bundle using its native equivalent of the former esbuild drop setting.
      rolldownOptions: configEnv.mode === 'production'
        ? { output: { minify: { compress: { dropConsole: true } } } }
        : undefined,
      // Crypto libraries (@noble/*, @scure/*) are ~500KB minified - this is expected
      // for a Bitcoin wallet. The warning threshold is raised to avoid noise.
      chunkSizeWarningLimit: 1500,
    },
  }),
});
