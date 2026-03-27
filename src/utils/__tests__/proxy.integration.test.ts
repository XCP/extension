import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Chrome API for port-based integration test
// ---------------------------------------------------------------------------

type PortMessageListener = (msg: any) => void;
type PortDisconnectListener = () => void;
type OnConnectListener = (port: any) => void;

function createMockPort(name: string) {
  const messageListeners: PortMessageListener[] = [];
  const disconnectListeners: PortDisconnectListener[] = [];
  return {
    name,
    sender: { id: 'test-extension-id' },
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: {
      addListener: vi.fn((fn: PortMessageListener) => messageListeners.push(fn)),
      removeListener: vi.fn(),
    },
    onDisconnect: {
      addListener: vi.fn((fn: PortDisconnectListener) => disconnectListeners.push(fn)),
      removeListener: vi.fn(),
    },
    _fireMessage: (msg: any) => messageListeners.forEach(fn => fn(msg)),
    _fireDisconnect: () => disconnectListeners.forEach(fn => fn()),
  };
}

let onConnectListeners: OnConnectListener[] = [];

const mockChrome = {
  runtime: {
    id: 'test-extension-id',
    onConnect: {
      addListener: vi.fn((fn: OnConnectListener) => onConnectListeners.push(fn)),
      removeListener: vi.fn(),
    },
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    connect: vi.fn(),
    sendMessage: vi.fn(),
    lastError: null,
  },
};

Object.defineProperty(global, 'chrome', { value: mockChrome, writable: true });

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
    vi.resetModules();
    onConnectListeners = [];

    const { defineProxyService } = await import('../proxy');

    mockWalletService = {
      getBalance: vi.fn().mockResolvedValue(100000000),
      sendTransaction: vi.fn().mockResolvedValue('abc123txhash'),
    };

    [registerService, getService] = defineProxyService(
      'WalletService',
      () => mockWalletService
    );
  });

  it('should work end-to-end like our actual services', async () => {
    Object.defineProperty(global, 'self', { value: {}, writable: true });
    Object.defineProperty(global, 'window', { value: undefined, writable: true });

    const bgService = registerService();
    expect(bgService).toBe(mockWalletService);

    const serviceFromBackground = getService();
    expect(serviceFromBackground).toBe(mockWalletService);

    const balance = await serviceFromBackground.getBalance('bc1q123...');
    expect(balance).toBe(100000000);
    expect(mockWalletService.getBalance).toHaveBeenCalledWith('bc1q123...');
  });

  /**
   * Simulate the full flow: background registers service, then a popup/content
   * script calls a method through the port-based proxy.
   */
  function setupIntegration() {
    // Register in background context
    Object.defineProperty(global, 'self', { value: {}, writable: true });
    Object.defineProperty(global, 'window', { value: undefined, writable: true });
    registerService();

    // Switch to popup/content context
    Object.defineProperty(global, 'window', { value: {}, writable: true });

    // Wire up: when client connects, create a server-side port that dispatches
    // to the onConnect listeners (simulating Chrome's port plumbing)
    mockChrome.runtime.connect.mockImplementation(({ name }: { name: string }) => {
      const clientPort = createMockPort(name);
      const serverPort = createMockPort(name);

      // Client postMessage → server onMessage
      clientPort.postMessage.mockImplementation((msg: any) => {
        setTimeout(() => serverPort._fireMessage(msg), 0);
      });
      // Server postMessage → client onMessage
      serverPort.postMessage.mockImplementation((msg: any) => {
        setTimeout(() => clientPort._fireMessage(msg), 0);
      });

      // Notify background of new connection
      setTimeout(() => onConnectListeners.forEach(fn => fn(serverPort)), 0);

      return clientPort;
    });
  }

  it('should work from popup context with port messaging', async () => {
    setupIntegration();

    const popupService = getService();
    expect(popupService).not.toBe(mockWalletService);

    const balance = await popupService.getBalance('bc1q456...');
    expect(balance).toBe(100000000);
    expect(mockWalletService.getBalance).toHaveBeenCalledWith('bc1q456...');
  });

  it('should handle method with multiple parameters', async () => {
    setupIntegration();

    const popupService = getService();
    const txHash = await popupService.sendTransaction('bc1q789...', 50000000);

    expect(txHash).toBe('abc123txhash');
    expect(mockWalletService.sendTransaction).toHaveBeenCalledWith('bc1q789...', 50000000);
  });
});
