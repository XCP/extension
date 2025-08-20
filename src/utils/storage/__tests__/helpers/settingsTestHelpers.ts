import { DEFAULT_KEYCHAIN_SETTINGS, type KeychainSettings } from '@/utils/storage';

/**
 * Create test settings by merging with defaults
 * This ensures tests only override what they need and stay in sync with defaults
 */
export function createTestSettings(overrides: Partial<KeychainSettings> = {}): KeychainSettings {
  return {
    ...DEFAULT_KEYCHAIN_SETTINGS,
    ...overrides,
  };
}

/**
 * Common test settings variations
 */
export const TEST_SETTINGS = {
  DEFAULT: createTestSettings(),
  
  // Extended timeout for timeout tests
  LONG_TIMEOUT: createTestSettings({
    autoLockTimeout: 15 * 60 * 1000, // 15 minutes
  }),
  
  // Development mode
  DEV_MODE: createTestSettings({
    transactionDryRun: true,
  }),
  
  // Minimal settings for testing edge cases
  MINIMAL: createTestSettings({
    pinnedAssets: [],
    connectedWebsites: [],
  }),
} as const;