import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import removeConsole from 'vite-plugin-remove-console';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react', '@wxt-dev/analytics/module'],
  manifest: {
    name: "XCP Wallet",
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
    optimizeDeps: {
      include: ['qrcode'],
    },
    build: {
      commonjsOptions: {
        // This forces transformation of mixed ESM/CJS modules
        transformMixedEsModules: true,
        include: [/node_modules/],
      },
    },
  }),
});
