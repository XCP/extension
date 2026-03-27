import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineProxyService, isBackgroundScript, disconnectAllPorts } from '../proxy';

// ---------------------------------------------------------------------------
// Mock Chrome API
// ---------------------------------------------------------------------------

type PortMessageListener = (msg: any) => void;
type PortDisconnectListener = () => void;

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
    // Test helpers
    _fireMessage: (msg: any) => messageListeners.forEach(fn => fn(msg)),
    _fireDisconnect: () => disconnectListeners.forEach(fn => fn()),
  };
}

let onConnectListeners: ((port: any) => void)[] = [];

const mockChrome = {
  runtime: {
    id: 'test-extension-id',
    onConnect: {
      addListener: vi.fn((fn: any) => onConnectListeners.push(fn)),
      removeListener: vi.fn(),
    },
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    connect: vi.fn(),
    sendMessage: vi.fn(),
    lastError: null as { message: string } | null,
  },
};

Object.defineProperty(global, 'chrome', { value: mockChrome, writable: true });

let testServiceCounter = 0;

// ---------------------------------------------------------------------------
// isBackgroundScript
// ---------------------------------------------------------------------------

describe('isBackgroundScript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome.runtime.id = 'test-extension-id';
  });

  it('should return false when chrome is undefined', () => {
    Object.defineProperty(global, 'chrome', { value: undefined, writable: true });
    expect(isBackgroundScript()).toBe(false);
    Object.defineProperty(global, 'chrome', { value: mockChrome, writable: true });
  });

  it('should return false when runtime.id is not available', () => {
    mockChrome.runtime.id = undefined as any;
    expect(isBackgroundScript()).toBe(false);
  });

  it('should return true in service worker context', () => {
    Object.defineProperty(global, 'self', { value: {}, writable: true });
    Object.defineProperty(global, 'window', { value: undefined, writable: true });
    expect(isBackgroundScript()).toBe(true);
  });

  it('should return false in popup/content script context', () => {
    Object.defineProperty(global, 'window', { value: {}, writable: true });
    expect(isBackgroundScript()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// defineProxyService
// ---------------------------------------------------------------------------

describe('defineProxyService', () => {
  interface TestService {
    getValue: () => number;
    setValue: (value: number) => void;
    getAsync: () => Promise<string>;
    throwError: () => void;
  }

  let testServiceInstance: TestService;
  let register: () => TestService;
  let getService: () => TestService;
  let currentServiceName: string;

  beforeEach(() => {
    vi.clearAllMocks();
    onConnectListeners = [];
    mockChrome.runtime.lastError = null;
    currentServiceName = `TestService_${++testServiceCounter}`;

    testServiceInstance = {
      getValue: vi.fn(() => 42),
      setValue: vi.fn(),
      getAsync: vi.fn(() => Promise.resolve('async-result')),
      throwError: vi.fn(() => { throw new Error('Test error'); }),
    };

    [register, getService] = defineProxyService(
      currentServiceName,
      () => testServiceInstance
    );
  });

  afterEach(() => {
    Object.defineProperty(global, 'self', { value: undefined, writable: true });
    Object.defineProperty(global, 'window', { value: undefined, writable: true });
  });

  // -------------------------------------------------------------------------
  // Background context
  // -------------------------------------------------------------------------

  describe('in background script context', () => {
    beforeEach(() => {
      Object.defineProperty(global, 'self', { value: {}, writable: true });
      Object.defineProperty(global, 'window', { value: undefined, writable: true });
    });

    it('should register service and add onConnect listener', () => {
      const service = register();
      expect(service).toBe(testServiceInstance);
      expect(mockChrome.runtime.onConnect.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should return actual service instance when getting service', () => {
      register();
      expect(getService()).toBe(testServiceInstance);
    });

    it('should throw when getting service before registration', () => {
      expect(() => getService()).toThrow('registerService has not been called');
    });

    it('should handle incoming port messages', async () => {
      register();

      const port = createMockPort(`proxy:${currentServiceName}`);
      onConnectListeners.forEach(fn => fn(port));

      port._fireMessage({ id: 1, methodName: 'getValue', args: [] });
      await new Promise(r => setTimeout(r, 0));

      expect(testServiceInstance.getValue).toHaveBeenCalled();
      expect(port.postMessage).toHaveBeenCalledWith({ id: 1, success: true, result: 42 });
    });

    it('should handle method errors', async () => {
      register();

      const port = createMockPort(`proxy:${currentServiceName}`);
      onConnectListeners.forEach(fn => fn(port));

      port._fireMessage({ id: 1, methodName: 'throwError', args: [] });
      await new Promise(r => setTimeout(r, 0));

      expect(port.postMessage).toHaveBeenCalledWith({
        id: 1, success: false, error: 'Test error',
      });
    });

    it('should handle non-existent methods', async () => {
      register();

      const port = createMockPort(`proxy:${currentServiceName}`);
      onConnectListeners.forEach(fn => fn(port));

      port._fireMessage({ id: 1, methodName: 'nonExistent', args: [] });
      await new Promise(r => setTimeout(r, 0));

      expect(port.postMessage).toHaveBeenCalledWith({
        id: 1, success: false, error: `Method nonExistent not found on ${currentServiceName}`,
      });
    });

    it('should ignore ports for other services', () => {
      register();

      const port = createMockPort('proxy:OtherService');
      onConnectListeners.forEach(fn => fn(port));

      expect(port.onMessage.addListener).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Client context (popup / content script)
  // -------------------------------------------------------------------------

  describe('in popup/content script context', () => {
    let clientPort: ReturnType<typeof createMockPort>;

    beforeEach(() => {
      Object.defineProperty(global, 'window', { value: {}, writable: true });

      clientPort = createMockPort(`proxy:${currentServiceName}`);
      mockChrome.runtime.connect.mockReturnValue(clientPort);
    });

    it('should return proxy object', () => {
      const service = getService();
      expect(service).not.toBe(testServiceInstance);
      expect(typeof service.getValue).toBe('function');
    });

    it('should connect port and send message on method call', async () => {
      const service = getService();

      // Simulate background responding
      clientPort.postMessage.mockImplementation((msg: any) => {
        setTimeout(() => clientPort._fireMessage({ id: msg.id, success: true, result: 42 }), 0);
      });

      const result = await service.getValue();

      expect(mockChrome.runtime.connect).toHaveBeenCalledWith({
        name: `proxy:${currentServiceName}`,
      });
      expect(result).toBe(42);
    });

    it('should pass arguments correctly', async () => {
      const service = getService();

      clientPort.postMessage.mockImplementation((msg: any) => {
        setTimeout(() => clientPort._fireMessage({ id: msg.id, success: true, result: null }), 0);
      });

      await service.setValue(123);

      expect(clientPort.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ methodName: 'setValue', args: [123] })
      );
    });

    it('should handle service errors from background', async () => {
      const service = getService();

      clientPort.postMessage.mockImplementation((msg: any) => {
        setTimeout(() => clientPort._fireMessage({
          id: msg.id, success: false, error: 'Service error',
        }), 0);
      });

      await expect(service.getValue()).rejects.toThrow('Service error');
    });

    it('should reject pending calls on port disconnect', async () => {
      const service = getService();

      // Both attempts disconnect immediately — no response ever comes
      const secondPort = createMockPort(`proxy:${currentServiceName}`);
      let callCount = 0;
      mockChrome.runtime.connect.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? clientPort : secondPort;
      });

      // Don't respond — let both ports disconnect
      clientPort.postMessage.mockImplementation(() => {
        setTimeout(() => clientPort._fireDisconnect(), 0);
      });
      secondPort.postMessage.mockImplementation(() => {
        setTimeout(() => secondPort._fireDisconnect(), 0);
      });

      await expect(service.getValue()).rejects.toThrow('Port disconnected');
    });

    it('should reconnect and retry once after disconnect', async () => {
      const service = getService();

      // First call: port disconnects immediately
      clientPort.postMessage.mockImplementation(() => {
        setTimeout(() => clientPort._fireDisconnect(), 0);
      });

      // Second port (after reconnect) succeeds
      const secondPort = createMockPort(`proxy:${currentServiceName}`);
      secondPort.postMessage.mockImplementation((msg: any) => {
        setTimeout(() => secondPort._fireMessage({ id: msg.id, success: true, result: 99 }), 0);
      });

      // After first port disconnects, connect returns second port
      let callCount = 0;
      mockChrome.runtime.connect.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? clientPort : secondPort;
      });

      const result = await service.getValue();
      expect(result).toBe(99);
      expect(mockChrome.runtime.connect).toHaveBeenCalledTimes(2);
    });

    it('should reuse existing port for multiple calls', async () => {
      const service = getService();

      clientPort.postMessage.mockImplementation((msg: any) => {
        setTimeout(() => clientPort._fireMessage({ id: msg.id, success: true, result: msg.methodName }), 0);
      });

      await Promise.all([service.getValue(), service.getAsync()]);
      expect(mockChrome.runtime.connect).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------
// disconnectAllPorts
// ---------------------------------------------------------------------------

describe('disconnectAllPorts', () => {
  it('should disconnect all cached ports', () => {
    Object.defineProperty(global, 'window', { value: {}, writable: true });

    const port = createMockPort('proxy:Test');
    mockChrome.runtime.connect.mockReturnValue(port);
    port.postMessage.mockImplementation((msg: any) => {
      setTimeout(() => port._fireMessage({ id: msg.id, success: true, result: 1 }), 0);
    });

    const [, getService] = defineProxyService(`DiscTest_${++testServiceCounter}`, () => ({
      ping: () => 1,
    }));

    const service = getService();
    service.ping(); // triggers port creation

    disconnectAllPorts();
    expect(port.disconnect).toHaveBeenCalled();
  });
});
