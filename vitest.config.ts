import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,

    // Exclude fuzz tests from default runs (run separately in nightly)
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.fuzz.test.ts',
    ],

    // Memory management for large test suites (Vitest 4 syntax)
    pool: 'forks', // Process isolation prevents memory buildup between tests
    // Vitest 4: maxForks/minForks replaced with maxWorkers
    maxWorkers: process.env.CI ? 1 : 4, // Single worker in CI to reduce memory pressure
    // Run test files sequentially in CI to prevent OOM
    fileParallelism: !process.env.CI,
    // Isolate test files to prevent shared state memory buildup
    isolate: true,
    // Retry failed tests (often memory-related crashes are transient)
    retry: process.env.CI ? 2 : 1, // More retries in CI
    // Sharding: use CLI --shard option (e.g., npx vitest --shard=1/3)
  },
});
