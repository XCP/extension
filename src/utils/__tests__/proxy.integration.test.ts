import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Chrome API for integration test
const mockChrome = {
  runtime: {
    id: 'test-extension-id',
    onMessage: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn(),
    lastError: null,
  },
};

Object.defineProperty(global, 'chrome', {
  value: mockChrome,
  writable: true,
});

describe('Proxy Service Integration', () => {
  interface TestWalletService {
    getBalance: (address: string) => Promise<number>;
    sendTransaction: (to: string, amount: number) => Promise<string>;
  }

  let mockWalletService: TestWalletService;
  let registerService: () => TestWalletService;
  let getService: () => TestWalletService;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset module to clear registeredServices set between tests
    vi.resetModules();

    // Re-import the module fresh
    const { defineProxyService } = await import('../proxy');

    // Create a mock service similar to what we have in the app
    mockWalletService = {
      getBalance: vi.fn().mockResolvedValue(100000000), // 1 BTC in satoshis
      sendTransaction: vi.fn().mockResolvedValue('abc123txhash'),
    };

    [registerService, getService] = defineProxyService(
      'WalletService',
      () => mockWalletService
    );
  });

  it('should work end-to-end like our actual services', async () => {
    // Mock service worker environment
    Object.defineProperty(global, 'self', {
      value: {},
      writable: true,
    });
    Object.defineProperty(global, 'window', {
      value: undefined,
      writable: true,
    });

    // Register the service (like in background.ts)
    const bgService = registerService();
    expect(bgService).toBe(mockWalletService);

    // Simulate getting the service from background context
    const serviceFromBackground = getService();
    expect(serviceFromBackground).toBe(mockWalletService);

    // Test that we can call methods
    const balance = await serviceFromBackground.getBalance('bc1q123...');
    expect(balance).toBe(100000000);
    expect(mockWalletService.getBalance).toHaveBeenCalledWith('bc1q123...');
  });

  it('should work from popup context with messaging', async () => {
    // Mock popup environment
    Object.defineProperty(global, 'window', {
      value: {},
      writable: true,
    });

    // First register in background (this would happen in background.ts)
    Object.defineProperty(global, 'self', {
      value: {},
      writable: true,
    });
    Object.defineProperty(global, 'window', {
      value: undefined,
      writable: true,
    });
    registerService();

    // Get message listener for testing
    const messageListener = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];

    // Switch back to popup environment
    Object.defineProperty(global, 'window', {
      value: {},
      writable: true,
    });

    // Mock sendMessage to simulate background response
    mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
      // Simulate the background script processing the message
      const mockSendResponse = vi.fn();

      messageListener(message, {}, mockSendResponse);

      // Get the response that was sent and pass it to the callback
      setTimeout(() => {
        const response = mockSendResponse.mock.calls[0]?.[0];
        if (response) {
          callback(response);
        }
      }, 0);
    });

    // Get service from popup context (should create proxy)
    const popupService = getService();
    expect(popupService).not.toBe(mockWalletService);

    // Call method through proxy
    const balance = await popupService.getBalance('bc1q456...');

    // Verify the method was called and returned the expected result
    expect(balance).toBe(100000000);
    expect(mockWalletService.getBalance).toHaveBeenCalledWith('bc1q456...');
  });

  it('should handle method with multiple parameters', async () => {
    // Setup background
    Object.defineProperty(global, 'self', {
      value: {},
      writable: true,
    });
    Object.defineProperty(global, 'window', {
      value: undefined,
      writable: true,
    });
    registerService();

    const messageListener = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];

    // Setup popup
    Object.defineProperty(global, 'window', {
      value: {},
      writable: true,
    });

    mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
      const mockSendResponse = vi.fn();
      messageListener(message, {}, mockSendResponse);

      setTimeout(() => {
        const response = mockSendResponse.mock.calls[0]?.[0];
        if (response) {
          callback(response);
        }
      }, 0);
    });

    const popupService = getService();
    const txHash = await popupService.sendTransaction('bc1q789...', 50000000);

    expect(txHash).toBe('abc123txhash');
    expect(mockWalletService.sendTransaction).toHaveBeenCalledWith('bc1q789...', 50000000);
  });
});