import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

// CI sharding support: set VITEST_SHARD=1/3 for first of 3 shards
const shard = process.env.VITEST_SHARD || undefined;

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,

    // Memory management for large test suites (Vitest 4 syntax)
    pool: 'forks', // Process isolation prevents memory buildup between tests
    // Vitest 4: pool options are now top-level
    maxForks: process.env.CI ? 2 : 4, // Fewer workers in CI (shared resources)
    minForks: 1,
    // Isolate test files to prevent shared state memory buildup
    isolate: true,
    // Retry failed tests (often memory-related crashes are transient)
    retry: process.env.CI ? 2 : 1, // More retries in CI
    // Sharding for CI parallelization (e.g., VITEST_SHARD=1/3)
    shard,
  },
});
