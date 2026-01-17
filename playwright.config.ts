import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  // Skip provider tests - webext-bridge initialization issues in test environment
  testIgnore: ['**/provider.spec.ts'],
  fullyParallel: false,
  
  // Retry flaky tests in CI only
  retries: isCI ? 2 : 0,
  
  // Use appropriate reporters
  reporter: isCI 
    ? [['list'], ['html'], ['github'], ['json', { outputFile: 'test-results.json' }]]
    : [['list'], ['html']],
  
  // Timeout settings
  timeout: 120000,
  globalTimeout: isCI ? 30 * 60 * 1000 : undefined, // 30 min limit in CI
  
  expect: {
    timeout: 10000,
  },
  
  use: {
    // Headless in CI, headed locally for debugging
    headless: isCI,
    viewport: { width: 350, height: 600 },
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    
    // Longer timeouts in CI (can be slower)
    actionTimeout: isCI ? 15000 : 10000,
    navigationTimeout: isCI ? 30000 : 15000,
  },
  
  // Prevent accidental test.only() in CI
  forbidOnly: isCI,
  
  // Output folder
  outputDir: 'test-results/',
});
