import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineProxyService, isBackgroundScript } from '../proxy';

// Mock Chrome API
const mockChrome = {
  runtime: {
    id: 'test-extension-id',
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    sendMessage: vi.fn(),
    lastError: null,
  },
};

// Setup global chrome mock
Object.defineProperty(global, 'chrome', {
  value: mockChrome,
  writable: true,
});

describe('isBackgroundScript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chrome mock
    mockChrome.runtime.id = 'test-extension-id';
  });

  it('should return false when chrome is undefined', () => {
    Object.defineProperty(global, 'chrome', {
      value: undefined,
      writable: true,
    });

    expect(isBackgroundScript()).toBe(false);

    // Restore chrome
    Object.defineProperty(global, 'chrome', {
      value: mockChrome,
      writable: true,
    });
  });

  it('should return false when runtime.id is not available', () => {
    mockChrome.runtime.id = undefined as any;
    expect(isBackgroundScript()).toBe(false);
  });

  it('should return true in service worker context (V3)', () => {
    // Mock service worker environment (self exists, window doesn't)
    Object.defineProperty(global, 'self', {
      value: {},
      writable: true,
    });
    Object.defineProperty(global, 'window', {
      value: undefined,
      writable: true,
    });

    expect(isBackgroundScript()).toBe(true);
  });

  it('should return false in popup/content script context', () => {
    // Mock popup/content script environment (window exists)
    Object.defineProperty(global, 'window', {
      value: {},
      writable: true,
    });

    expect(isBackgroundScript()).toBe(false);
  });
});

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

  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;

    // Create a test service
    testServiceInstance = {
      getValue: vi.fn(() => 42),
      setValue: vi.fn(),
      getAsync: vi.fn(() => Promise.resolve('async-result')),
      throwError: vi.fn(() => {
        throw new Error('Test error');
      }),
    };

    // Define the proxy service
    [register, getService] = defineProxyService(
      'TestService',
      () => testServiceInstance
    );
  });

  afterEach(() => {
    // Clean up global mocks
    Object.defineProperty(global, 'self', {
      value: undefined,
      writable: true,
    });
    Object.defineProperty(global, 'window', {
      value: undefined,
      writable: true,
    });
  });

  describe('in background script context', () => {
    beforeEach(() => {
      // Mock service worker environment
      Object.defineProperty(global, 'self', {
        value: {},
        writable: true,
      });
      Object.defineProperty(global, 'window', {
        value: undefined,
        writable: true,
      });
    });

    it('should register service and return instance', () => {
      const service = register();
      expect(service).toBe(testServiceInstance);
      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('should return actual service instance when getting service', () => {
      register();
      const service = getService();
      expect(service).toBe(testServiceInstance);
    });

    it('should throw error when getting service before registration', () => {
      expect(() => getService()).toThrow(
        'Failed to get an instance of TestService: in background, but registerService has not been called'
      );
    });

    it('should handle incoming messages correctly', async () => {
      register();

      // Get the message listener that was registered
      const messageListener = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      const mockSendResponse = vi.fn();

      // Test successful method call
      messageListener(
        {
          serviceName: 'TestService',
          methodName: 'getValue',
          args: [],
        },
        {},
        mockSendResponse
      );

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(testServiceInstance.getValue).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        result: 42,
      });
    });

    it('should handle method errors correctly', async () => {
      register();

      const messageListener = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      const mockSendResponse = vi.fn();

      messageListener(
        {
          serviceName: 'TestService',
          methodName: 'throwError',
          args: [],
        },
        {},
        mockSendResponse
      );

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Test error',
      });
    });

    it('should handle non-existent methods', async () => {
      register();

      const messageListener = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      const mockSendResponse = vi.fn();

      messageListener(
        {
          serviceName: 'TestService',
          methodName: 'nonExistentMethod',
          args: [],
        },
        {},
        mockSendResponse
      );

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Method nonExistentMethod not found on TestService',
      });
    });

    it('should ignore messages for other services', () => {
      register();

      const messageListener = mockChrome.runtime.onMessage.addListener.mock.calls[0][0];
      const result = messageListener(
        {
          serviceName: 'OtherService',
          methodName: 'someMethod',
          args: [],
        },
        {},
        vi.fn()
      );

      expect(result).toBe(false);
    });
  });

  describe('in popup/content script context', () => {
    beforeEach(() => {
      // Mock popup/content script environment
      Object.defineProperty(global, 'window', {
        value: {},
        writable: true,
      });
    });

    it('should return proxy object', () => {
      const service = getService();
      expect(service).not.toBe(testServiceInstance);
      expect(typeof service.getValue).toBe('function');
    });

    it('should send messages when proxy methods are called', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          success: true,
          result: 42,
        });
      });

      const service = getService();
      const result = await service.getValue();

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        {
          serviceName: 'TestService',
          methodName: 'getValue',
          args: [],
        },
        expect.any(Function)
      );
      expect(result).toBe(42);
    });

    it('should handle sendMessage errors', async () => {
      mockChrome.runtime.lastError = { message: 'Connection error' };
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback(null);
      });

      const service = getService();
      await expect(service.getValue()).rejects.toThrow('Connection error');
    });

    it('should handle service errors from background', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          success: false,
          error: 'Service error',
        });
      });

      const service = getService();
      await expect(service.getValue()).rejects.toThrow('Service error');
    });

    it('should handle no response from background', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback(null);
      });

      const service = getService();
      await expect(service.getValue()).rejects.toThrow('No response from TestService.getValue');
    });

    it('should pass arguments correctly', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        callback({
          success: true,
          result: null,
        });
      });

      const service = getService();
      await service.setValue(123);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        {
          serviceName: 'TestService',
          methodName: 'setValue',
          args: [123],
        },
        expect.any(Function)
      );
    });
  });
});