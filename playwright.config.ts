import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  // Only Playwright specs. The directory also holds a vitest file
  // (hardware/trezor-node-integration.test.ts, run by the trezor-emulator workflow), and
  // Playwright's default match picks up *.test.ts too — loading it crashes the runner before a
  // single spec runs, which `continue-on-error` in the nightly job then hid for months.
  testMatch: '**/*.spec.ts',
  fullyParallel: false,

  // Single worker for extension tests to avoid state conflicts
  workers: 1,

  // Retry flaky tests in CI only
  retries: isCI ? 2 : 0,
  
  // Use appropriate reporters
  reporter: isCI 
    ? [['list'], ['html'], ['github'], ['json', { outputFile: 'test-results.json' }]]
    : [['list'], ['html']],
  
  // Timeout settings
  timeout: 120000,
  // PR batches have their own 15-minute job limit. The nightly runs every file serially in one
  // invocation, so its global budget must cover the complete suite rather than stopping halfway.
  globalTimeout: isCI ? 100 * 60 * 1000 : undefined,
  
  expect: {
    timeout: 10000,
  },
  
  use: {
    // Headless in CI, headed locally for debugging
    headless: isCI,
    viewport: { width: 350, height: 600 },
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    trace: {
      mode: 'retain-on-failure',
      snapshots: { dom: true, aria: true, screen: true },
    },
    
    // Longer timeouts in CI (can be slower)
    actionTimeout: isCI ? 15000 : 10000,
    navigationTimeout: isCI ? 30000 : 15000,
  },
  
  // Prevent accidental test.only() in CI
  forbidOnly: isCI,
  
  // Output folder
  outputDir: 'test-results/',
});
