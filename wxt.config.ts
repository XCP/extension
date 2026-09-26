import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { TREZOR_SUITE_ORIGINS } from './src/platform/suiteOrigins';

/** The `--mode`/`-m` value WXT was started with, in any of the spellings its CLI accepts. */
function cliMode(argv = process.argv): string | undefined {
  for (const [i, arg] of argv.entries()) {
    if (arg === '--mode' || arg === '-m') return argv[i + 1];
    if (arg.startsWith('--mode=')) return arg.slice('--mode='.length);
    if (arg.startsWith('-m=')) return arg.slice('-m='.length);
  }
  return undefined;
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  // An e2e build (`wxt build --mode e2e`) replaces the build in .output/chrome-mv3, which is what
  // the Playwright fixtures load; WXT would otherwise add a mode suffix to the directory. The
  // directory is resolved before the manifest callback sees `env.mode`, so it is read from argv.
  ...(cliMode() === 'e2e' ? { outDirTemplate: '{{browser}}-mv{{manifestVersion}}' } : {}),
  modules: ['@wxt-dev/module-react'],
  // Chrome only: the wallet is not built or distributed for any other browser.
  targetBrowsers: ['chrome'],
  webExt: {
    chromiumPort: 9222,
  },
  manifest: (env) => ({
    // Localized through public/_locales; Chrome picks the file by its own UI language.
    name: '__MSG_appName__',
    description: '__MSG_appDescription__',
    default_locale: 'en',
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
    ],
    // Trezor Connect 10 reads the Suite Web tab's URL to talk to it, which needs host access to
    // suite.trezor.io. It is optional so an update never disables the wallet for people who do
    // not use a Trezor: the wallet asks on the first Trezor click (src/platform/suiteAccess.ts).
    // `wxt build --mode e2e` grants it up front, because automation cannot answer Chrome's prompt.
    ...(env.mode === 'e2e'
      ? { host_permissions: TREZOR_SUITE_ORIGINS }
      : { optional_host_permissions: TREZOR_SUITE_ORIGINS }),
    externally_connectable: { matches: TREZOR_SUITE_ORIGINS },
  }),
  vite: (configEnv) => ({
    plugins: [tailwindcss()],
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
