import { beforeAll, afterAll } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  debug: console.debug,
  info: console.info
};

// Suppress console output during tests
beforeAll(() => {
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  console.debug = () => {};
  console.info = () => {};
});

// Restore console after tests (optional, mainly for debugging)
afterAll(() => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.debug = originalConsole.debug;
  console.info = originalConsole.info;
});