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
    pool: 'forks',
    maxWorkers: 1, // Single worker to prevent OOM
    fileParallelism: false,
    isolate: true,
    retry: 2,
  },
});
