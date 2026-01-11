/**
 * Vitest Configuration for Trezor Emulator Integration Tests
 *
 * These tests run against a real Trezor emulator and should only be run
 * when the emulator is available (via docker-compose.trezor.yml).
 *
 * Usage:
 *   1. Start emulator: docker-compose -f docker-compose.trezor.yml up -d
 *   2. Run tests: npm run test:emulator
 *   3. Stop emulator: docker-compose -f docker-compose.trezor.yml down
 */
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    // Longer timeouts for emulator communication
    testTimeout: 60000,
    hookTimeout: 60000,
    // Only include emulator tests
    include: ['**/*.emulator.test.ts'],
    // Run sequentially - emulator can only handle one test at a time
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    // Retry on transient failures
    retry: 2,
  },
});
