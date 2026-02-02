import { beforeAll, afterAll, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Mock @trezor/connect-webextension to prevent auto-initialization during import
// The module tries to use browser.runtime.onConnect.addListener which isn't implemented in fake-browser
vi.mock('@trezor/connect-webextension', () => ({
  default: {
    init: vi.fn().mockResolvedValue(undefined),
    getAddress: vi.fn().mockResolvedValue({ success: true, payload: { address: 'bc1q...', publicKey: '02...' } }),
    getPublicKey: vi.fn().mockResolvedValue({ success: true, payload: { xpub: 'xpub...' } }),
    signTransaction: vi.fn().mockResolvedValue({ success: true, payload: { serializedTx: '0x...' } }),
    signMessage: vi.fn().mockResolvedValue({ success: true, payload: { signature: 'sig' } }),
    dispose: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  DEVICE_EVENT: 'DEVICE_EVENT',
  DEVICE: {
    CONNECT: 'device-connect',
    DISCONNECT: 'device-disconnect',
  },
  UI_EVENT: 'UI_EVENT',
  UI: {
    REQUEST_PIN: 'ui-request_pin',
    REQUEST_PASSPHRASE: 'ui-request_passphrase',
    REQUEST_BUTTON: 'ui-request_button',
    REQUEST_CONFIRMATION: 'ui-request_confirmation',
  },
}));

// Configure testing-library with longer async timeouts for CI
configure({
  asyncUtilTimeout: 5000,
});

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
  
  // Global browser API mocks for tests
  if (!global.chrome) {
    global.chrome = {} as any;
  }
  
  // Add missing runtime API mocks needed by webext-bridge
  global.chrome.runtime = global.chrome.runtime || {};
  if (!global.chrome.runtime.onConnect) {
    Object.defineProperty(global.chrome.runtime, 'onConnect', {
      value: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
        hasListener: vi.fn(),
        hasListeners: vi.fn(),
      },
      writable: true,
      configurable: true
    });
  }
  global.chrome.runtime.connect = global.chrome.runtime.connect || vi.fn();
  
  // Ensure other common APIs are mocked
  global.chrome.alarms = global.chrome.alarms || {
    create: vi.fn(),
    clear: vi.fn().mockResolvedValue(true),
    onAlarm: {
      addListener: vi.fn(),
    },
  };
  
  global.chrome.storage = global.chrome.storage || {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
        hasListener: vi.fn(),
        hasListeners: vi.fn(),
      }
    },
    session: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
        hasListener: vi.fn(),
        hasListeners: vi.fn(),
      }
    },
  };
  
  // Also set up global.browser for compatibility
  (global as any).browser = global.chrome;
});

// Restore console after tests (optional, mainly for debugging)
afterAll(() => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.debug = originalConsole.debug;
  console.info = originalConsole.info;
});