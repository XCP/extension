import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 30000, // Longer timeout for fuzz tests
    hookTimeout: 15000,

    // Only run fuzz tests
    include: ['**/*.fuzz.test.ts'],

    // Memory management for fuzz tests
    pool: 'threads', // Use threads instead of forks (faster, less memory)
    maxWorkers: 1,
    fileParallelism: false,
    isolate: true,
    retry: 0, // No retries for fuzz tests - they should pass or fail quickly

    // Prevent hanging in CI
    teardownTimeout: 10000,
  },
});
