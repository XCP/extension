import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@/core/rpcErrors';
import { markServicesReady } from '@/services/core/serviceReadiness';
import { defineProxyService, disconnectAllPorts, isBackgroundScript } from '../proxy';

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
    sender: { id: 'test-extension-id', url: 'chrome-extension://test-extension-id/popup.html' },
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
    _fireMessage: (msg: any) => messageListeners.forEach(fn => { fn(msg); }),
    _fireDisconnect: () => disconnectListeners.forEach(fn => { fn(); }),
  };
}

let onConnectListeners: ((port: any) => void)[] = [];

const mockChrome = {
  extension: { getBackgroundPage: vi.fn<() => object | undefined>() },
  runtime: {
    id: 'test-extension-id',
    getURL: (path: string) => `chrome-extension://test-extension-id/${path}`,
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
    mockChrome.extension.getBackgroundPage.mockReset();
    mockChrome.runtime.id = 'test-extension-id';
    // These exercise dispatch, not startup: the barrier holds every call until the background says
    // it has finished initialising, so a test standing in for that background must say so.
    markServicesReady();
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

  it('recognizes the actual Firefox MV2 background document', () => {
    const backgroundWindow = {};
    Object.defineProperty(global, 'window', { value: backgroundWindow, writable: true });
    mockChrome.extension.getBackgroundPage.mockReturnValue(backgroundWindow);
    expect(isBackgroundScript()).toBe(true);
  });

  it('does not treat an extension popup with access to the background page as the background', () => {
    Object.defineProperty(global, 'window', { value: {}, writable: true });
    mockChrome.extension.getBackgroundPage.mockReturnValue({});
    expect(isBackgroundScript()).toBe(false);
  });

  it('fails closed when a content context cannot access the background page', () => {
    Object.defineProperty(global, 'window', { value: {}, writable: true });
    mockChrome.extension.getBackgroundPage.mockImplementation(() => { throw new Error('API unavailable'); });
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
    throwCoded: () => void;
    handleRequest: (origin: string, method: string, params: unknown[]) => void;
  }

  let testServiceInstance: TestService;
  let register: () => TestService;
  let getService: () => TestService;
  let currentServiceName: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome.extension.getBackgroundPage.mockReset();
    onConnectListeners = [];
    mockChrome.runtime.lastError = null;
    currentServiceName = `TestService_${++testServiceCounter}`;

    testServiceInstance = {
      getValue: vi.fn(() => 42),
      setValue: vi.fn(),
      getAsync: vi.fn(() => Promise.resolve('async-result')),
      throwError: vi.fn(() => { throw new Error('Test error'); }),
      throwCoded: vi.fn(() => { throw new ProviderError(4001, 'rejected'); }),
      handleRequest: vi.fn(),
    };

    [register, getService] = defineProxyService(
      currentServiceName,
      () => testServiceInstance,
      { methods: { getValue: 'read', getAsync: 'read', setValue: 'command', throwError: 'command', throwCoded: 'command', handleRequest: 'command' } },
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

    it('registers and directly retrieves the service in a Firefox MV2 background document', () => {
      const backgroundWindow = {};
      Object.defineProperty(global, 'window', { value: backgroundWindow, writable: true });
      mockChrome.extension.getBackgroundPage.mockReturnValue(backgroundWindow);
      expect(register()).toBe(testServiceInstance);
      expect(getService()).toBe(testServiceInstance);
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
      onConnectListeners.forEach(fn => { fn(port); });

      port._fireMessage({ id: 1, methodName: 'getValue', args: [] });
      await new Promise(r => setTimeout(r, 0));

      expect(testServiceInstance.getValue).toHaveBeenCalled();
      expect(port.postMessage).toHaveBeenCalledWith({
        id: 1, success: true, result: ['value', 42], resultEncoding: 'xcp-json-v1',
      });
    });

    it('should handle method errors', async () => {
      register();

      const port = createMockPort(`proxy:${currentServiceName}`);
      onConnectListeners.forEach(fn => { fn(port); });

      port._fireMessage({ id: 1, methodName: 'throwError', args: [] });
      await new Promise(r => setTimeout(r, 0));

      expect(port.postMessage).toHaveBeenCalledWith({
        id: 1, success: false, error: { message: 'Test error', code: undefined },
      });
    });

    it('serializes the code only for deliberately-coded ProviderErrors', async () => {
      register();

      const port = createMockPort(`proxy:${currentServiceName}`);
      onConnectListeners.forEach(fn => { fn(port); });

      port._fireMessage({ id: 1, methodName: 'throwCoded', args: [] });
      await new Promise(r => setTimeout(r, 0));

      expect(port.postMessage).toHaveBeenCalledWith({
        id: 1, success: false, error: { message: 'rejected', code: 4001 },
      });
    });

    it('should handle non-existent methods', async () => {
      register();

      const port = createMockPort(`proxy:${currentServiceName}`);
      onConnectListeners.forEach(fn => { fn(port); });

      port._fireMessage({ id: 1, methodName: 'nonExistent', args: [] });
      await new Promise(r => setTimeout(r, 0));

      expect(port.postMessage).toHaveBeenCalledWith({
        id: 1, success: false, error: { message: `Method nonExistent not found on ${currentServiceName}` },
      });
    });

    it('should ignore ports for other services', () => {
      register();

      const port = createMockPort('proxy:OtherService');
      onConnectListeners.forEach(fn => { fn(port); });

      expect(port.onMessage.addListener).not.toHaveBeenCalled();
    });

    it('refuses a content script access to internal wallet RPC even with our extension ID', () => {
      register();
      const port = createMockPort(`proxy:${currentServiceName}`);
      Object.assign(port.sender, { url: 'https://site.example/', origin: 'https://site.example', frameId: 0 });
      onConnectListeners.forEach(fn => { fn(port); });
      expect(port.disconnect).toHaveBeenCalledOnce();
      expect(port.onMessage.addListener).not.toHaveBeenCalled();
    });

    it('derives the provider origin from the top-level sender and strips claimed metadata', async () => {
      const handleRequest = vi.fn().mockResolvedValue([]);
      const disconnect = vi.fn();
      const name = `Origin_${++testServiceCounter}`;
      const [registerProvider] = defineProxyService(name, () => ({ handleRequest, disconnect }), {
        methods: { handleRequest: 'command', disconnect: 'command' }, contentScript: 'provider',
      });
      registerProvider();
      const port = createMockPort(`proxy:${name}`);
      Object.assign(port.sender, { url: 'https://site.example/path', origin: 'https://site.example', frameId: 0 });
      onConnectListeners.forEach(fn => { fn(port); });
      port._fireMessage({ id: 1, methodName: 'handleRequest', args: ['https://victim.example', 'xcp_accounts', [], { origin: 'spoofed' }] });
      port._fireMessage({ id: 2, methodName: 'disconnect', args: ['https://victim.example'] });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(handleRequest).toHaveBeenCalledExactlyOnceWith('https://site.example', 'xcp_accounts', []);
      expect(disconnect).not.toHaveBeenCalled();
      expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 2, success: false }));
    });

    it.each([
      { url: 'https://site.example', origin: 'https://site.example', frameId: 1 },
      { url: 'https://site.example', origin: 'null', frameId: 0 },
      { url: 'http://site.example', origin: 'http://site.example', frameId: 0 },
      { url: 'https://site.example', origin: 'https://other.example', frameId: 0 },
    ])('refuses an ineligible provider sender: %j', (sender) => {
      const name = `RejectedOrigin_${++testServiceCounter}`;
      const [registerProvider] = defineProxyService(name, () => ({ handleRequest: vi.fn() }), {
        methods: { handleRequest: 'command' }, contentScript: 'provider',
      });
      registerProvider();
      const port = createMockPort(`proxy:${name}`);
      Object.assign(port.sender, sender);
      onConnectListeners.forEach(fn => { fn(port); });
      expect(port.disconnect).toHaveBeenCalledOnce();
    });

    it('rejects malformed requests and inherited methods without invoking service code', async () => {
      register();
      const port = createMockPort(`proxy:${currentServiceName}`);
      onConnectListeners.forEach(fn => { fn(port); });
      port._fireMessage(null);
      port._fireMessage({ id: 1, methodName: 'setValue', args: 'not-an-array' });
      port._fireMessage({ id: 2, methodName: 'toString', args: [] });
      port._fireMessage({ id: 3, methodName: 'setValue', args: ['x'.repeat(1024 * 1024 + 4096)] });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(testServiceInstance.setValue).not.toHaveBeenCalled();
      for (const id of [1, 2, 3]) expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ id, success: false }));
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
          id: msg.id, success: false, error: { message: 'Service error', code: 4001 },
        }), 0);
      });

      const rejection = service.getValue();
      await expect(rejection).rejects.toThrow('Service error');
      // The code carried over the port is reconstructed onto the error.
      await expect(rejection).rejects.toMatchObject({ code: 4001 });
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

      const rejection = service.getValue();
      await expect(rejection).rejects.toThrow('Port disconnected');
      // Coded DISCONNECTED so the boundary surfaces it and the dApp SDK retries.
      await expect(rejection).rejects.toMatchObject({ code: 4900 });
    });

    it('does not replay non-idempotent provider methods on disconnect', async () => {
      const service = getService();

      // A retry (if it happened) would connect a second time.
      const secondPort = createMockPort(`proxy:${currentServiceName}`);
      let callCount = 0;
      mockChrome.runtime.connect.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? clientPort : secondPort;
      });
      clientPort.postMessage.mockImplementation(() => {
        setTimeout(() => clientPort._fireDisconnect(), 0);
      });
      secondPort.postMessage.mockImplementation(() => {
        setTimeout(() => secondPort._fireDisconnect(), 0);
      });

      // A signing request must NOT auto-retry across a disconnect (no duplicate popup).
      await expect(
        (service as any).handleRequest('https://dapp.com', 'xcp_signTransaction', [])
      ).rejects.toThrow('Port disconnected');
      expect(callCount).toBe(1);
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

    it('does not repeat a committed wallet mutation when its response is lost', async () => {
      let committedOperations = 0;
      clientPort.postMessage.mockImplementation(() => {
        committedOperations++;
        queueMicrotask(() => clientPort._fireDisconnect());
      });
      await expect(getService().setValue(123)).rejects.toMatchObject({ code: 4900 });
      expect(committedOperations).toBe(1);
      expect(mockChrome.runtime.connect).toHaveBeenCalledOnce();
    });

    it('does not treat the service as a promise or expose undeclared methods', () => {
      const service = getService();
      expect(Reflect.get(service, 'then')).toBeUndefined();
      expect(Reflect.get(service, 'constructor')).toBeUndefined();
      expect(Reflect.get(service, 'toString')).toBeUndefined();
      expect(mockChrome.runtime.connect).not.toHaveBeenCalled();
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
    }), { methods: { ping: 'read' } });

    const service = getService();
    service.ping(); // triggers port creation

    disconnectAllPorts();
    expect(port.disconnect).toHaveBeenCalled();
  });
});
