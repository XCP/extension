import { DEFAULT_SETTINGS, type AppSettings } from '@/utils/storage/settingsStorage';

/**
 * Create test settings by merging with defaults
 * This ensures tests only override what they need and stay in sync with defaults
 */
export function createTestSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
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
    autoLockTimer: '15m',
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
