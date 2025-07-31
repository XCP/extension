import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Run tests sequentially for extension stability
  reporter: [['list'], ['html']], // List for console output, HTML for detailed reports
  timeout: 60000, // 1 minute per test
  expect: {
    timeout: 10000, // 10 seconds for assertions
  },
  use: {
    headless: false, // Extensions need headed mode
    viewport: { width: 400, height: 600 }, // Extension popup size
    video: 'retain-on-failure', // Record video only on failure
    screenshot: 'only-on-failure', // Screenshot only on failure
  },
  // No projects, no global setup - just clean test execution
});
