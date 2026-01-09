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
  manifest: {
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
      'activeTab',
      'alarms',
    ],
  },
  vite: (configEnv) => ({
    plugins: [
      ...(configEnv.mode === 'production' ? [removeConsole({ includes: ['log', 'error'] })] : []),
      tailwindcss(),
    ],
  }),
});
