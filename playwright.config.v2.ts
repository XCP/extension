import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Run tests sequentially for extension tests
  reporter: [['list'], ['html']],
  retries: 1, // Allow one retry for flaky proxy service issues
  use: {
    headless: false, // Extensions need headed mode
    viewport: { width: 400, height: 600 }, // Extension popup size
    video: 'on-first-retry', // Record video on retry for debugging
    trace: 'on-first-retry', // Trace on retry
    launchOptions: {
      args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox'],
      timeout: 60000,
    },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global-setup-.*\.ts/,
    },
    {
      name: 'onboarding',
      testMatch: 'onboarding/*.spec.ts',
      use: { 
        userDataDir: 'userData/onboarding',
        // Fresh state - no storage
      },
    },
    {
      name: 'authenticated',
      testMatch: ['wallet-operations-v2.spec.ts', 'created/*.spec.ts'],
      use: {
        userDataDir: 'userData/created',
        // This will use the persisted state from setup
      },
      dependencies: ['setup'],
    },
  ],
  // Use our new global setup
  globalSetup: './e2e/global-setup-created-v2.ts',
  
  // Increase timeouts for extension tests
  timeout: 60000, // Test timeout
  expect: {
    timeout: 10000, // Assertion timeout
  },
});