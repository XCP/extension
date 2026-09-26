import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

// The unit config with fuzz-specific overrides. Arrays merge by concatenation in mergeConfig,
// so `include` and `exclude` are replaced after the merge rather than merged.
const config = mergeConfig(baseConfig, defineConfig({
  test: {
    testTimeout: 30000, // Longer timeout for fuzz tests

    pool: 'threads', // Use threads instead of forks (faster, less memory)
    maxWorkers: 1,
    fileParallelism: false,

    // Prevent hanging in CI
    teardownTimeout: 10000,
  },
}));

config.test = {
  ...config.test,
  // Only run fuzz tests
  include: ['src/**/*.fuzz.test.ts'],
  exclude: ['**/node_modules/**', '**/.claude/worktrees/**'],
};

export default config;
