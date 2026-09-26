import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,

    // Unit tests live in src. The e2e directory holds Playwright specs (*.spec.ts), which vitest
    // must never collect, plus a few vitest suites that need a live service and skip without
    // their env flag: the Trezor emulator suite (`npm run test:emulator`) and the ZELD regtest
    // suites (`ZELD_REGTEST=1 npx vitest run e2e/zeld/...`).
    include: ['src/**/*.test.{ts,tsx}', 'e2e/**/*.test.ts'],
    // Fuzz tests run separately in the weekly workflow (vitest.fuzz.config.ts).
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/worktrees/**',
      '**/*.fuzz.test.ts',
    ],

    // Memory management for large test suites
    pool: 'forks', // Process isolation prevents memory buildup between tests
    maxWorkers: process.env.CI ? 1 : 4, // Single worker in CI to reduce memory pressure
    // Run test files sequentially in CI to prevent OOM
    fileParallelism: !process.env.CI,
    // Isolate test files to prevent shared state memory buildup
    isolate: true,
    // No retries: a test that passes only on a second attempt is flaky, and retrying hides it.
    retry: 0,
    // Sharding: use CLI --shard option (e.g., npx vitest --shard=1/3)
  },
});
