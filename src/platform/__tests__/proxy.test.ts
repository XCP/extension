import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HardwareWalletError } from '@/core/hardware/types';
import { EXTENSION_RELOAD_REQUIRED_MESSAGE, EXTENSION_RESTARTED_MESSAGE, ProviderError } from '@/core/rpcErrors';
import { recordProviderTab } from '@/platform/browser';
import { markServicesReady } from '@/services/core/serviceReadiness';
import {
  defineProxyService, disconnectAllPorts, isBackgroundScript, PORT_ACK_TIMEOUT_MS, PORT_HEARTBEAT_INTERVAL_MS,
  PORT_IDLE_RECONNECT_MS,
} from '../proxy';

vi.mock('@/platform/browser', () => ({ recordProviderTab: vi.fn(async () => {}) }));

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

    it('records which tab a provider port came from, so events reach only the tabs of its origin', () => {
      const name = `TabRecord_${++testServiceCounter}`;
      const [registerProvider] = defineProxyService(name, () => ({ handleRequest: vi.fn() }), {
        methods: { handleRequest: 'command' }, contentScript: 'provider',
      });
      registerProvider();
      const contentPort = createMockPort(`proxy:${name}`);
      Object.assign(contentPort.sender, { url: 'https://site.example/path', origin: 'https://site.example', frameId: 0, tab: { id: 7 } });
      const uiPort = createMockPort(`proxy:${name}`);
      Object.assign(uiPort.sender, { tab: { id: 8 } });
      const framePort = createMockPort(`proxy:${name}`);
      Object.assign(framePort.sender, { url: 'https://site.example/', origin: 'https://site.example', frameId: 1, tab: { id: 9 } });
      vi.mocked(recordProviderTab).mockClear();
      for (const port of [contentPort, uiPort, framePort]) onConnectListeners.forEach(fn => { fn(port); });
      expect(recordProviderTab).toHaveBeenCalledExactlyOnceWith(7, 'https://site.example');
    });

    it('keeps hardware metadata private to extension UI, preserving the public raw error', async () => {
      const failure = new HardwareWalletError('Original SDK evidence', 'DEVICE_BUSY', 'trezor', 'English hint');
      const handleRequest = vi.fn().mockRejectedValue(failure);
      const name = `HardwarePrivacy_${++testServiceCounter}`;
      const [registerProvider] = defineProxyService(name, () => ({ handleRequest }), {
        methods: { handleRequest: 'command' }, contentScript: 'provider',
      });
      registerProvider();
      const contentPort = createMockPort(`proxy:${name}`);
      Object.assign(contentPort.sender, { url: 'https://site.example/path', origin: 'https://site.example', frameId: 0 });
      const uiPort = createMockPort(`proxy:${name}`);
      for (const port of [contentPort, uiPort]) {
        onConnectListeners.forEach(fn => { fn(port); });
        port._fireMessage({ id: 1, methodName: 'handleRequest', args: ['https://site.example', 'xcp_signMessage', []] });
      }
      await new Promise(resolve => setTimeout(resolve, 0));
      const answer = (port: typeof contentPort) => port.postMessage.mock.calls.find(([msg]) => !msg.ack)?.[0].error;
      const contentError = answer(contentPort);
      const uiError = answer(uiPort);
      expect(contentError.message).toBe(failure.message);
      expect(contentError.hardware).toBeUndefined();
      expect(uiError.message).toBe(failure.message);
      expect(uiError.hardware).toEqual({ vendor: 'trezor', code: 'DEVICE_BUSY' });
      expect(uiError.hardware).not.toHaveProperty('userMessage');
      expect(handleRequest).toHaveBeenCalledTimes(2);
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

    it('answers a caller that did not ask for a receipt with exactly its reply, as before', async () => {
      // The trusted-UI RPC shape e2e helpers and older clients use: first message for the id is the answer.
      register();
      const port = createMockPort(`proxy:${currentServiceName}`);
      onConnectListeners.forEach(fn => { fn(port); });
      port._fireMessage({ id: 1, methodName: 'getValue', args: [] });
      await new Promise(r => setTimeout(r, 0));
      expect(port.postMessage.mock.calls).toEqual([
        [{ id: 1, success: true, result: ['value', 42], resultEncoding: 'xcp-json-v1' }],
      ]);
    });

    it('echoes a heartbeat at once, without dispatching anything or waiting on services', () => {
      register();
      const port = createMockPort(`proxy:${currentServiceName}`);
      onConnectListeners.forEach(fn => { fn(port); });
      port._fireMessage({ heartbeat: 3 });
      expect(port.postMessage).toHaveBeenCalledExactlyOnceWith({ heartbeat: 3 });
      expect(testServiceInstance.getValue).not.toHaveBeenCalled();
    });

    it('acknowledges receipt before the service answers when asked to', async () => {
      let finish: (value: string) => void = () => {};
      testServiceInstance.getAsync = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
      register();
      const port = createMockPort(`proxy:${currentServiceName}`);
      onConnectListeners.forEach(fn => { fn(port); });
      port._fireMessage({ id: 7, methodName: 'getAsync', args: [], ack: true });
      expect(port.postMessage).toHaveBeenCalledExactlyOnceWith({ id: 7, ack: true });
      await new Promise(r => setTimeout(r, 0));
      finish('done');
      await new Promise(r => setTimeout(r, 0));
      expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ id: 7, success: true }));
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

    it('returns one client with stable method functions, so React dependencies hold', () => {
      const first = getService();
      const second = getService();
      expect(second).toBe(first);
      expect(second.getValue).toBe(first.getValue);
      expect(first.getAsync).toBe(first.getAsync);
      expect(first.getAsync).not.toBe(first.getValue);
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
      await expect(rejection).rejects.toThrow(EXTENSION_RESTARTED_MESSAGE);
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
      ).rejects.toThrow(EXTENSION_RESTARTED_MESSAGE);
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

    describe('dead bridges fail fast', () => {
      afterEach(() => {
        vi.useRealTimers();
        mockChrome.runtime.id = 'test-extension-id';
        mockChrome.runtime.connect.mockReset();
      });

      it('refuses at once, without connecting, once the extension context is invalidated', async () => {
        mockChrome.runtime.id = undefined as any;
        await expect(getService().getValue()).rejects.toMatchObject({ code: 4900, message: EXTENSION_RELOAD_REQUIRED_MESSAGE });
        expect(mockChrome.runtime.connect).not.toHaveBeenCalled();
      });

      it('maps a connect that throws "Extension context invalidated" to the reload error', async () => {
        mockChrome.runtime.connect.mockImplementation(() => { throw new Error('Extension context invalidated.'); });
        await expect(getService().setValue(1)).rejects.toMatchObject({ code: 4900, message: EXTENSION_RELOAD_REQUIRED_MESSAGE });
        expect(mockChrome.runtime.connect).toHaveBeenCalledOnce();
      });

      it('fails in-flight calls with the reload error when the context dies under them', async () => {
        clientPort.postMessage.mockImplementation(() => {
          mockChrome.runtime.id = undefined as any;
          queueMicrotask(() => clientPort._fireDisconnect());
        });
        await expect(getService().getValue()).rejects.toMatchObject({ code: 4900, message: EXTENSION_RELOAD_REQUIRED_MESSAGE });
        expect(mockChrome.runtime.connect).toHaveBeenCalledOnce();
      });

      it('drops a port that never acknowledges and retries a read on a fresh one', async () => {
        vi.useFakeTimers();
        const fresh = createMockPort(`proxy:${currentServiceName}`);
        fresh.postMessage.mockImplementation((msg: any) => {
          queueMicrotask(() => fresh._fireMessage({ id: msg.id, ack: true }));
          queueMicrotask(() => fresh._fireMessage({ id: msg.id, success: true, result: 7 }));
        });
        mockChrome.runtime.connect.mockReturnValueOnce(clientPort).mockReturnValueOnce(fresh);
        const result = getService().getValue(); // clientPort swallows it: open, but nobody listening
        await vi.advanceTimersByTimeAsync(PORT_ACK_TIMEOUT_MS + 200);
        await expect(result).resolves.toBe(7);
        expect(clientPort.disconnect).toHaveBeenCalledOnce();
      });

      it('fails an unacknowledged command with a retryable 4900 instead of replaying it', async () => {
        vi.useFakeTimers();
        const settled = expect(getService().setValue(1)).rejects
          .toMatchObject({ code: 4900, message: EXTENSION_RESTARTED_MESSAGE });
        await vi.advanceTimersByTimeAsync(PORT_ACK_TIMEOUT_MS + 200);
        await settled;
        expect(clientPort.postMessage).toHaveBeenCalledOnce();
        expect(clientPort.disconnect).toHaveBeenCalledOnce();
      });

      it('lets an acknowledged call wait as long as it needs while the worker keeps answering', async () => {
        vi.useFakeTimers();
        let requestId = 0;
        let heartbeats = 0;
        clientPort.postMessage.mockImplementation((msg: any) => {
          if (msg.heartbeat !== undefined) {
            heartbeats++;
            queueMicrotask(() => clientPort._fireMessage({ heartbeat: msg.heartbeat }));
            return;
          }
          requestId = msg.id;
          queueMicrotask(() => clientPort._fireMessage({ id: msg.id, ack: true }));
        });
        const result = getService().setValue(1);
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
        clientPort._fireMessage({ id: requestId, success: true, result: 'approved' });
        await expect(result).resolves.toBe('approved');
        expect(clientPort.disconnect).not.toHaveBeenCalled();
        expect(heartbeats).toBe((10 * 60 * 1000) / PORT_HEARTBEAT_INTERVAL_MS);
        // Nothing pending, so the heartbeat stops: an idle worker is left free to sleep.
        await vi.advanceTimersByTimeAsync(PORT_HEARTBEAT_INTERVAL_MS * 4);
        expect(heartbeats).toBe((10 * 60 * 1000) / PORT_HEARTBEAT_INTERVAL_MS);
      });

      it('fails an acknowledged call with a retryable 4900 when the worker dies silently under it', async () => {
        vi.useFakeTimers();
        // Acks the request, then goes silent: a stopped worker whose port never reports onDisconnect.
        clientPort.postMessage.mockImplementation((msg: any) => {
          if (msg.id !== undefined) queueMicrotask(() => clientPort._fireMessage({ id: msg.id, ack: true }));
        });
        const settled = expect(getService().setValue(1)).rejects
          .toMatchObject({ code: 4900, message: EXTENSION_RESTARTED_MESSAGE });
        await vi.advanceTimersByTimeAsync(PORT_HEARTBEAT_INTERVAL_MS * 2 + 200);
        await settled;
        expect(clientPort.disconnect).toHaveBeenCalledOnce();
      });

      it('replaces an idle port instead of waiting out the ack timeout on it', async () => {
        vi.useFakeTimers();
        const fresh = createMockPort(`proxy:${currentServiceName}`);
        fresh.postMessage.mockImplementation((msg: any) => {
          queueMicrotask(() => fresh._fireMessage({ id: msg.id, success: true, result: 'fresh' }));
        });
        clientPort.postMessage.mockImplementation((msg: any) => {
          queueMicrotask(() => clientPort._fireMessage({ id: msg.id, success: true, result: 'first' }));
        });
        mockChrome.runtime.connect.mockReturnValueOnce(clientPort).mockReturnValueOnce(fresh);
        const service = getService();
        await expect(service.getValue()).resolves.toBe('first');
        await vi.advanceTimersByTimeAsync(PORT_IDLE_RECONNECT_MS);
        // clientPort's worker was stopped while idle; the next call must not be posted into it.
        await expect(service.getValue()).resolves.toBe('fresh');
        expect(clientPort.disconnect).toHaveBeenCalledOnce();
        expect(clientPort.postMessage).toHaveBeenCalledOnce();
      });

      it('treats a service that answers 4900 as an ordinary error, not a lost port', async () => {
        clientPort.postMessage.mockImplementation((msg: any) => {
          queueMicrotask(() => clientPort._fireMessage({
            id: msg.id, success: false, error: { message: 'Chain unavailable', code: 4900 },
          }));
        });
        await expect(getService().getValue()).rejects.toMatchObject({ code: 4900, message: 'Chain unavailable' });
        expect(clientPort.postMessage).toHaveBeenCalledOnce(); // not retried
        expect(clientPort.disconnect).not.toHaveBeenCalled();
      });

      it('resends even a command that was never posted, because the port was already dead', async () => {
        const fresh = createMockPort(`proxy:${currentServiceName}`);
        fresh.postMessage.mockImplementation((msg: any) => {
          queueMicrotask(() => fresh._fireMessage({ id: msg.id, success: true, result: 'ok' }));
        });
        clientPort.postMessage.mockImplementation(() => { throw new Error('Attempting to use a disconnected port object'); });
        mockChrome.runtime.connect.mockReturnValueOnce(clientPort).mockReturnValueOnce(fresh);
        await expect(getService().setValue(1)).resolves.toBe('ok');
        expect(fresh.postMessage).toHaveBeenCalledOnce();
      });

      it('reconnects after a service-worker restart (port disconnects, context stays valid)', async () => {
        const restarted = createMockPort(`proxy:${currentServiceName}`);
        restarted.postMessage.mockImplementation((msg: any) => {
          queueMicrotask(() => restarted._fireMessage({ id: msg.id, success: true, result: 1 }));
        });
        clientPort.postMessage.mockImplementation((msg: any) => {
          queueMicrotask(() => clientPort._fireMessage({ id: msg.id, success: true, result: 0 }));
        });
        mockChrome.runtime.connect.mockReturnValueOnce(clientPort).mockReturnValueOnce(restarted);
        const service = getService();
        await expect(service.setValue(1)).resolves.toBe(0);
        clientPort._fireDisconnect(); // the worker stopped while idle
        await expect(service.setValue(2)).resolves.toBe(1);
        expect(mockChrome.runtime.connect).toHaveBeenCalledTimes(2);
      });
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

  it('fails calls in flight on the closed port and reconnects for the next one (bfcache)', async () => {
    Object.defineProperty(global, 'window', { value: {}, writable: true });
    const frozen = createMockPort('proxy:Test');
    const restored = createMockPort('proxy:Test');
    restored.postMessage.mockImplementation((msg: any) => {
      queueMicrotask(() => restored._fireMessage({ id: msg.id, success: true, result: 2 }));
    });
    const name = `BfcacheTest_${++testServiceCounter}`;
    const ports = [frozen, restored];
    const connects = vi.fn((portName: string) => (portName === `proxy:${name}` ? ports.shift() : createMockPort(portName)));
    mockChrome.runtime.connect.mockReset();
    mockChrome.runtime.connect.mockImplementation(({ name: portName }: { name: string }) => connects(portName));
    const [, getService] = defineProxyService(name, () => ({
      approve: () => 1,
    }), { methods: { approve: 'command' } });
    const service = getService();
    const inFlight = service.approve();
    await Promise.resolve();
    // Chrome fires onDisconnect only on the far end, so a local disconnect must settle this itself.
    disconnectAllPorts();
    await expect(inFlight).rejects.toMatchObject({ code: 4900 });
    await expect(service.approve()).resolves.toBe(2);
    expect(connects.mock.calls.filter(([portName]) => portName === `proxy:${name}`)).toHaveLength(2);
  });
});
