import { PlaywrightTestConfig } from '@playwright/test';

/**
 * Common test configuration
 */
export const defaultTestConfig: Partial<PlaywrightTestConfig> = {
  timeout: 60000, // 60 seconds per test
  fullyParallel: false, // Run tests sequentially by default for extension tests
  retries: 0, // No retries in development
  workers: 1, // Single worker for extension tests
  use: {
    headless: false, // Extensions need headed mode
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
};

/**
 * Test categories for organizing tests
 */
export const TEST_CATEGORIES = {
  WALLET: 'wallet',
  TRANSACTION: 'transaction',
  SECURITY: 'security',
  UI: 'ui',
  INTEGRATION: 'integration',
  E2E: 'e2e',
} as const;

/**
 * Common test timeouts
 */
export const TIMEOUTS = {
  SHORT: 5000,
  MEDIUM: 10000,
  LONG: 30000,
  EXTRA_LONG: 60000,
} as const;

/**
 * Common wait intervals
 */
export const WAIT_INTERVALS = {
  ANIMATION: 500,
  NAVIGATION: 1000,
  NETWORK: 2000,
  BLOCKCHAIN: 5000,
} as const;

/**
 * Test data generators
 */
export function generateTestWalletName(): string {
  return `Test Wallet ${Date.now()}`;
}

export function generateTestAddress(): string {
  // Generate a random-looking but invalid address for testing
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let address = '1Test';
  for (let i = 0; i < 29; i++) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  return address;
}

export function generateTestAmount(): string {
  return (Math.random() * 0.001).toFixed(8);
}

/**
 * Environment-specific configuration
 */
export function getTestConfig(): any {
  const env = process.env.TEST_ENV || 'local';
  
  switch (env) {
    case 'ci':
      return {
        ...defaultTestConfig,
        retries: 1,
        workers: 2,
        use: {
          ...defaultTestConfig.use,
          headless: true,
        },
      };
    case 'debug':
      return {
        ...defaultTestConfig,
        timeout: 0, // No timeout in debug mode
        use: {
          ...defaultTestConfig.use,
          headless: false,
          launchOptions: {
            slowMo: 500, // Slow down actions for debugging
          },
        },
      };
    default:
      return defaultTestConfig;
  }
}