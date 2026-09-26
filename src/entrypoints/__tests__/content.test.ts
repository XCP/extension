import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { EXTENSION_RESTARTED_MESSAGE, PROVIDER_ERROR_CODES, ProviderError, reloadRequiredError } from '@/core/rpcErrors';

const reloadRequired = reloadRequiredError();
const disconnectEvent = { target: 'xcp-wallet-injected', type: 'XCP_WALLET_EVENT', event: 'disconnect', data: reloadRequired };

/** Chrome clears runtime.id in a content script whose extension was reloaded or updated. */
function setContextValid(valid: boolean): void {
  const id = valid ? 'test-extension-id' : undefined;
  for (const runtime of [fakeBrowser.runtime, globalThis.chrome?.runtime]) {
    if (runtime) (runtime as { id?: string }).id = id;
  }
}

// Mock WXT injectScript function
const mockInjectScript = vi.fn();
vi.mock('wxt/utils/inject-script', () => ({
  injectScript: mockInjectScript
}));

vi.mock('#imports', () => ({
  defineContentScript: (config: any) => config,
  injectScript: mockInjectScript
}));

// Mock provider service
const mockProviderService = {
  handleRequest: vi.fn()
};

vi.mock('@/services/providerServiceClient', () => ({
  getProviderServiceClient: () => mockProviderService
}));

// Setup fake browser
fakeBrowser.runtime.sendMessage = vi.fn();
fakeBrowser.runtime.onMessage.addListener = vi.fn();
fakeBrowser.runtime.onMessage.removeListener = vi.fn();
Object.assign(fakeBrowser.runtime, {
  onConnect: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(),
    hasListeners: vi.fn(),
  },
});
fakeBrowser.runtime.connect = vi.fn();
fakeBrowser.runtime.id = 'test-extension-id';
fakeBrowser.runtime.getURL = vi.fn((path: string) => `chrome-extension://test-id${path}`);

(global as any).browser = fakeBrowser;

// Mock window object
const mockWindow = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  postMessage: vi.fn(),
  location: {
    origin: 'https://xcp.io',
    hostname: 'xcp.io'
  }
};

// Mock console
const mockConsole = {
  debug: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn()
};

// Mock context object for content script
const mockContext = {
  onInvalidated: vi.fn()
};

describe('Content Script', () => {
  const originalWindow = global.window;
  const originalConsole = global.console;

  beforeEach(() => {
    vi.clearAllMocks();
    setContextValid(true);

    // Setup global mocks
    global.window = mockWindow as any;
    global.console = mockConsole as any;
    (global as any).browser = fakeBrowser;
    
    // Reset browser mocks
    (fakeBrowser.runtime.sendMessage as any).mockClear();
    (fakeBrowser.runtime.onMessage.addListener as any).mockClear();
    if ((fakeBrowser.runtime.onMessage.removeListener as any).mockClear) {
      (fakeBrowser.runtime.onMessage.removeListener as any).mockClear();
    }
    (fakeBrowser.runtime.onConnect.addListener as any).mockClear();
    (fakeBrowser.runtime.onConnect.removeListener as any).mockClear();
    (fakeBrowser.runtime.connect as any).mockClear();
    mockInjectScript.mockClear();
    
    // Clear mock context
    mockContext.onInvalidated.mockClear();
    
    // Reset module cache to re-run content script
    vi.resetModules();
  });

  afterEach(() => {
    global.window = originalWindow;
    global.console = originalConsole;
    vi.clearAllMocks();
  });

  describe('Script Injection', () => {
    it('should inject provider script', async () => {
      mockInjectScript.mockResolvedValue(undefined);
      
      // Import content script
      const contentScript = await import('../content');
      
      // Execute the content script main function
      await contentScript.default.main(mockContext as any);

      // Should inject script using WXT's injectScript
      expect(mockInjectScript).toHaveBeenCalledWith('/injected.js', {
        keepInDom: true
      });
    });

    it('should handle injection error', async () => {
      const error = new Error('Injection failed');
      mockInjectScript.mockRejectedValue(error);
      
      const contentScript = await import('../content');
      
      await contentScript.default.main(mockContext as any);

      expect(mockInjectScript).toHaveBeenCalled();
      expect(mockConsole.error).toHaveBeenCalledWith('Failed to inject XCP Wallet provider:', error);
    });
  });

  describe('Message Handling', () => {
    let messageListener: any;

    beforeEach(async () => {
      // Clear all mocks first
      vi.clearAllMocks();
      // Mock providerService.handleRequest to return successful response
      mockProviderService.handleRequest.mockResolvedValue('test-result');
      
      const contentScript = await import('../content');
      
      await contentScript.default.main(mockContext as any);
      
      // Get the message listener that was added
      messageListener = mockWindow.addEventListener.mock.calls.find(
        call => call[0] === 'message'
      )?.[1];
      
      expect(messageListener).toBeDefined();
    });

    it('should handle XCP wallet request messages', async () => {
      const mockResult = 'test-result';
      mockProviderService.handleRequest.mockResolvedValue(mockResult);

      // Simulate XCP wallet request
      const event = {
        source: window,
        origin: mockWindow.location.origin,
        data: {
          target: 'xcp-wallet-content',
          type: 'XCP_WALLET_REQUEST',
          id: '123',
          data: {
            method: 'xcp_requestAccounts',
            params: []
          }
        }
      };

      await messageListener(event);

      expect(mockProviderService.handleRequest).toHaveBeenCalledWith(
        mockWindow.location.origin,
        'xcp_requestAccounts',
        []
      );

      // Should post response back
      expect(mockWindow.postMessage).toHaveBeenCalledWith(
        {
          target: 'xcp-wallet-injected',
          type: 'XCP_WALLET_RESPONSE',
          id: '123',
          data: {
            method: 'xcp_requestAccounts',
            result: 'test-result'
          }
        },
        mockWindow.location.origin
      );
    });

    it.each([null, [], { id: {} }, { id: 'x'.repeat(257) }])('ignores malformed page envelopes', async payload => {
      await messageListener({ source: window, origin: mockWindow.location.origin,
        data: payload && { target: 'xcp-wallet-content', type: 'XCP_WALLET_REQUEST', ...payload } });
      expect(mockProviderService.handleRequest).not.toHaveBeenCalled();
      expect(mockWindow.postMessage).not.toHaveBeenCalled();
    });

    it.each([null, { method: 123 }, { method: 'xcp_accounts', params: {} }])('rejects malformed method arguments before RPC', async data => {
      await messageListener({ source: window, origin: mockWindow.location.origin, data: {
        target: 'xcp-wallet-content', type: 'XCP_WALLET_REQUEST', id: 1, data,
      } });
      expect(mockProviderService.handleRequest).not.toHaveBeenCalled();
      expect(mockWindow.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        id: 1, error: expect.objectContaining({ message: expect.stringContaining('Invalid request') }),
      }), mockWindow.location.origin);
    });

    it('should handle providerService returning null', async () => {
      // Mock providerService.handleRequest to return null (simulating no response scenario)
      mockProviderService.handleRequest.mockResolvedValue(null);

      const event = {
        source: window,
        origin: mockWindow.location.origin,
        data: {
          target: 'xcp-wallet-content',
          type: 'XCP_WALLET_REQUEST',
          id: '456',
          data: {
            method: 'xcp_getBalance',
            params: ['bc1qtest']
          }
        }
      };

      await messageListener(event);

      // When providerService returns null, it's wrapped as a successful response with null result
      expect(mockWindow.postMessage).toHaveBeenCalledWith(
        {
          target: 'xcp-wallet-injected',
          type: 'XCP_WALLET_RESPONSE',
          id: '456',
          data: {
            method: 'xcp_getBalance',
            result: null
          }
        },
        mockWindow.location.origin
      );
    });



    it('should handle error from providerService with generic message', async () => {
      // Mock providerService.handleRequest to throw an internal error
      // Internal errors should NOT leak implementation details
      mockProviderService.handleRequest.mockRejectedValue(new Error('Internal database error'));

      const event = {
        source: window,
        origin: mockWindow.location.origin,
        data: {
          target: 'xcp-wallet-content',
          type: 'XCP_WALLET_REQUEST',
          id: '789',
          data: {
            method: 'xcp_requestAccounts',
            params: []
          }
        }
      };

      await messageListener(event);

      // Should return generic error message, not internal details
      expect(mockWindow.postMessage).toHaveBeenCalledWith(
        {
          target: 'xcp-wallet-injected',
          type: 'XCP_WALLET_RESPONSE',
          id: '789',
          error: {
            message: 'Request failed',
            code: -32603
          }
        },
        mockWindow.location.origin
      );
    });

    it('should pass through user-facing error messages', async () => {
      // A coded ProviderError is surfaced to the dApp with its code intact.
      mockProviderService.handleRequest.mockRejectedValue(
        new ProviderError(PROVIDER_ERROR_CODES.USER_REJECTED, 'User denied the request'));

      const event = {
        source: window,
        origin: mockWindow.location.origin,
        data: {
          target: 'xcp-wallet-content',
          type: 'XCP_WALLET_REQUEST',
          id: '790',
          data: {
            method: 'xcp_requestAccounts',
            params: []
          }
        }
      };

      await messageListener(event);

      // User-facing errors should pass through
      expect(mockWindow.postMessage).toHaveBeenCalledWith(
        {
          target: 'xcp-wallet-injected',
          type: 'XCP_WALLET_RESPONSE',
          id: '790',
          error: {
            message: 'User denied the request',
            code: 4001 // USER_REJECTED — carried from the ProviderError
          }
        },
        mockWindow.location.origin
      );
    });

    it('surfaces a coded sign cancellation so dApps can branch', async () => {
      // The wallet rejects a cancelled sign with a coded ProviderError; it must reach
      // the dApp intact with code 4001, not masked to a generic 'Request failed'.
      mockProviderService.handleRequest.mockRejectedValue(
        new ProviderError(PROVIDER_ERROR_CODES.USER_REJECTED, 'User cancelled transaction signing request'));

      const event = {
        source: window,
        origin: mockWindow.location.origin,
        data: {
          target: 'xcp-wallet-content',
          type: 'XCP_WALLET_REQUEST',
          id: '791',
          data: { method: 'xcp_signTransaction', params: ['00'] }
        }
      };

      await messageListener(event);

      expect(mockWindow.postMessage).toHaveBeenCalledWith(
        {
          target: 'xcp-wallet-injected',
          type: 'XCP_WALLET_RESPONSE',
          id: '791',
          error: {
            message: 'User cancelled transaction signing request',
            code: 4001
          }
        },
        mockWindow.location.origin
      );
    });

    it('should ignore non-XCP wallet messages', async () => {
      const event = {
        source: window,
        origin: mockWindow.location.origin,
        data: {
          target: 'other-target',
          type: 'OTHER_MESSAGE',
          data: 'test'
        }
      };

      await messageListener(event);

      expect(mockProviderService.handleRequest).not.toHaveBeenCalled();
      expect(mockWindow.postMessage).not.toHaveBeenCalled();
    });

    it('should ignore messages from different source', async () => {
      const differentWindow = {} as Window;
      const event = {
        source: differentWindow,
        origin: mockWindow.location.origin,
        data: {
          target: 'xcp-wallet-content',
          type: 'XCP_WALLET_REQUEST',
          id: '999',
          data: {
            method: 'xcp_requestAccounts',
            params: []
          }
        }
      };

      await messageListener(event);

      expect(mockProviderService.handleRequest).not.toHaveBeenCalled();
      expect(mockWindow.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Provider Events', () => {
    beforeEach(async () => {
      mockWindow.location.hostname = 'xcp.io';
      const contentScript = await import('../content');
      
      await contentScript.default.main(mockContext as any);
    });

    it('should forward provider events to page', () => {
      // Simulate receiving an event from background
      const eventData = {
        type: 'accountsChanged',
        accounts: ['bc1qnew']
      };

      // The content script should set up listener for provider events
      // In the extension this comes from the background as a PROVIDER_EVENT runtime message
      mockWindow.postMessage(
        {
          type: 'XCP_PROVIDER_EVENT',
          event: eventData
        },
        'https://xcp.io'
      );

      // Verify postMessage was called
      expect(mockWindow.postMessage).toHaveBeenCalled();
    });
  });


  describe('Content Script Configuration', () => {
    it('should have correct matches configuration', async () => {
      const contentScript = await import('../content');
      
      expect(contentScript.default.matches).toEqual([
        'https://*/*',
        'http://localhost/*',
        'http://127.0.0.1/*'
      ]);
      
      // excludeMatches removed - browser automatically excludes restricted schemes
      expect(contentScript.default.excludeMatches).toBeUndefined();
    });

    it('should export a content script with main function', async () => {
      const contentScript = await import('../content');
      
      expect(contentScript.default).toBeDefined();
      expect(typeof contentScript.default.main).toBe('function');
      expect(Array.isArray(contentScript.default.matches)).toBe(true);
    });
  });

  describe('Context Cleanup', () => {
    it('should register cleanup callback with onInvalidated', async () => {
      const contentScript = await import('../content');
      
      await contentScript.default.main(mockContext as any);
      
      // Should have registered a cleanup callback
      expect(mockContext.onInvalidated).toHaveBeenCalledWith(expect.any(Function));
      expect(mockContext.onInvalidated).toHaveBeenCalledTimes(1);
    });

    it('keeps answering the page but drops the runtime listener when the extension context dies', async () => {
      const windowRemoveEventListenerSpy = vi.spyOn(mockWindow, 'removeEventListener');
      const runtimeRemoveListenerSpy = vi.spyOn(fakeBrowser.runtime.onMessage, 'removeListener');

      const contentScript = await import('../content');

      await contentScript.default.main(mockContext as any);

      const cleanupCallback = mockContext.onInvalidated.mock.calls[0]![0];
      expect(typeof cleanupCallback).toBe('function');

      setContextValid(false);
      cleanupCallback();

      // The window listener stays: an orphan that stopped listening would leave the page hanging.
      expect(windowRemoveEventListenerSpy).not.toHaveBeenCalledWith('message', expect.any(Function));
      expect(runtimeRemoveListenerSpy).toHaveBeenCalledWith(expect.any(Function));
      expect(mockWindow.postMessage).toHaveBeenCalledWith(disconnectEvent, mockWindow.location.origin);

      windowRemoveEventListenerSpy.mockRestore();
      runtimeRemoveListenerSpy.mockRestore();
    });

    const accountsRequest = (id: number) => ({ source: window, origin: mockWindow.location.origin, data: {
      target: 'xcp-wallet-content', type: 'XCP_WALLET_REQUEST', id, data: { method: 'xcp_accounts', params: [] },
    } });

    it('keeps serving the page when the forgeable WXT hand-off event fires with the extension alive', async () => {
      mockProviderService.handleRequest.mockResolvedValueOnce([]);
      const contentScript = await import('../content');
      await contentScript.default.main(mockContext as any);
      const messageListener = mockWindow.addEventListener.mock.calls.find(call => call[0] === 'message')?.[1];

      mockContext.onInvalidated.mock.calls[0]![0](); // what a page dispatching the DOM event would cause
      await messageListener(accountsRequest(1));

      expect(mockProviderService.handleRequest).toHaveBeenCalledOnce();
      expect(mockWindow.postMessage).not.toHaveBeenCalledWith(disconnectEvent, expect.anything());
    });

    it('falls silent once a newer copy of itself owns the page', async () => {
      const contentScript = await import('../content');
      await contentScript.default.main(mockContext as any);
      const older = mockWindow.addEventListener.mock.calls.find(call => call[0] === 'message')?.[1];
      await contentScript.default.main(mockContext as any); // the newer copy, same isolated world

      await older(accountsRequest(2));
      expect(mockWindow.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), expect.anything());
    });

    it('tells a page that has used the provider that its bridge is gone, without waiting for its next request', async () => {
      vi.useFakeTimers();
      try {
        const contentScript = await import('../content');
        await contentScript.default.main(mockContext as any);
        const messageListener = mockWindow.addEventListener.mock.calls.find(call => call[0] === 'message')?.[1];
        mockProviderService.handleRequest.mockResolvedValueOnce([]);
        await messageListener({
          source: window, origin: mockWindow.location.origin,
          data: { target: 'xcp-wallet-content', type: 'XCP_WALLET_REQUEST', id: 1, data: { method: 'xcp_accounts', params: [] } },
        });
        mockWindow.postMessage.mockClear();
        setContextValid(false);
        await vi.advanceTimersByTimeAsync(2_000);
        expect(mockWindow.postMessage).toHaveBeenCalledExactlyOnceWith(disconnectEvent, mockWindow.location.origin);
      } finally {
        vi.useRealTimers();
      }
    });

    it('runs no timer and sends nothing to the background in a page that never uses the provider', async () => {
      vi.useFakeTimers();
      try {
        const contentScript = await import('../content');
        await contentScript.default.main(mockContext as any);
        expect(vi.getTimerCount()).toBe(0);
        expect(fakeBrowser.runtime.sendMessage).not.toHaveBeenCalled();
        setContextValid(false);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(mockWindow.postMessage).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Bridge liveness', () => {
    let messageListener: (event: unknown) => Promise<void>;
    const request = (id: number | string, method = 'xcp_accounts') => ({
      source: window,
      origin: mockWindow.location.origin,
      data: { target: 'xcp-wallet-content', type: 'XCP_WALLET_REQUEST', id, data: { method, params: [] } },
    });
    const reloadResponse = (id: number | string) => ({
      target: 'xcp-wallet-injected', type: 'XCP_WALLET_RESPONSE', id, error: reloadRequired,
    });

    beforeEach(async () => {
      const contentScript = await import('../content');
      await contentScript.default.main(mockContext as any);
      messageListener = mockWindow.addEventListener.mock.calls.find(call => call[0] === 'message')?.[1];
    });

    it('acknowledges receipt before the wallet answers', async () => {
      let answer: (value: unknown) => void = () => {};
      mockProviderService.handleRequest.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
      const pending = messageListener(request(1, 'xcp_signPsbt'));
      expect(mockWindow.postMessage).toHaveBeenCalledExactlyOnceWith(
        { target: 'xcp-wallet-injected', type: 'XCP_WALLET_ACK', id: 1 }, mockWindow.location.origin);
      answer('signed');
      await pending;
      expect(mockWindow.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
        type: 'XCP_WALLET_RESPONSE', id: 1, data: { method: 'xcp_signPsbt', result: 'signed' },
      }), mockWindow.location.origin);
    });

    it('answers at once with the typed reload error once the extension context is invalidated', async () => {
      setContextValid(false);
      await messageListener(request(2));
      expect(mockProviderService.handleRequest).not.toHaveBeenCalled();
      expect(mockWindow.postMessage).toHaveBeenCalledWith(reloadResponse(2), mockWindow.location.origin);
      expect(mockWindow.postMessage).toHaveBeenCalledWith(disconnectEvent, mockWindow.location.origin);
      // The page hears `disconnect` once, not once per request.
      await messageListener(request(3));
      expect(mockWindow.postMessage).toHaveBeenCalledWith(reloadResponse(3), mockWindow.location.origin);
      expect(mockWindow.postMessage.mock.calls.filter(([msg]) => msg.event === 'disconnect')).toHaveLength(1);
    });

    it('fails every request in flight when the context dies under them', async () => {
      mockProviderService.handleRequest.mockReturnValueOnce(new Promise(() => {})); // an open approval
      let failSecond: (error: unknown) => void = () => {};
      mockProviderService.handleRequest.mockReturnValueOnce(new Promise((_, reject) => { failSecond = reject; }));
      void messageListener(request(4, 'xcp_signPsbt'));
      // One at a time: vitest stalls concurrent dynamic imports of a mocked module.
      await vi.waitFor(() => expect(mockProviderService.handleRequest).toHaveBeenCalledTimes(1));
      const second = messageListener(request(5));
      await vi.waitFor(() => expect(mockProviderService.handleRequest).toHaveBeenCalledTimes(2));

      setContextValid(false);
      failSecond(new Error('Extension context invalidated.'));
      await second;

      expect(mockWindow.postMessage).toHaveBeenCalledWith(reloadResponse(4), mockWindow.location.origin);
      expect(mockWindow.postMessage).toHaveBeenCalledWith(reloadResponse(5), mockWindow.location.origin);
      expect(mockWindow.postMessage).toHaveBeenCalledWith(disconnectEvent, mockWindow.location.origin);
    });

    it('treats a service-worker restart as transient: surfaces a retryable 4900 and keeps the bridge', async () => {
      mockProviderService.handleRequest.mockRejectedValueOnce(
        new ProviderError(PROVIDER_ERROR_CODES.DISCONNECTED, EXTENSION_RESTARTED_MESSAGE));
      await messageListener(request(6, 'xcp_signPsbt'));
      expect(mockWindow.postMessage).toHaveBeenCalledWith({
        target: 'xcp-wallet-injected', type: 'XCP_WALLET_RESPONSE', id: 6,
        error: { code: 4900, message: EXTENSION_RESTARTED_MESSAGE },
      }, mockWindow.location.origin);
      expect(mockWindow.postMessage).not.toHaveBeenCalledWith(disconnectEvent, expect.anything());

      mockProviderService.handleRequest.mockResolvedValueOnce(['bc1qexample']);
      await messageListener(request(7));
      expect(mockWindow.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
        id: 7, data: { method: 'xcp_accounts', result: ['bc1qexample'] },
      }), mockWindow.location.origin);
    });
  });


  describe('Integration', () => {
    it('should set up complete message flow', async () => {
      mockInjectScript.mockResolvedValue(undefined);
      mockProviderService.handleRequest.mockResolvedValue('integration-test');
      
      const contentScript = await import('../content');
      
      await contentScript.default.main(mockContext as any);
      
      // Should inject script
      expect(mockInjectScript).toHaveBeenCalled();
      
      // Should set up window message listener
      expect(mockWindow.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
      
      // Should set up runtime message listener  
      expect(fakeBrowser.runtime.onMessage.addListener).toHaveBeenCalledWith(expect.any(Function));
      
      // Test complete flow
      const windowMessageListener = mockWindow.addEventListener.mock.calls.find(
        call => call[0] === 'message'
      )?.[1];
      
      const runtimeMessageListener = (fakeBrowser.runtime.onMessage.addListener as any).mock.calls[0][0];
      
      // Simulate window message
      await windowMessageListener({
        source: window,
        origin: mockWindow.location.origin,
        data: {
          target: 'xcp-wallet-content',
          type: 'XCP_WALLET_REQUEST',
          id: 'integration-123',
          data: { method: 'test', params: [] }
        }
      });
      
      // Should have sent message via providerService
      expect(mockProviderService.handleRequest).toHaveBeenCalled();
      
      // Should have posted response to window
      expect(mockWindow.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          target: 'xcp-wallet-injected',
          type: 'XCP_WALLET_RESPONSE',
          id: 'integration-123'
        }),
        mockWindow.location.origin
      );
      
      // Simulate runtime event with proper parameters
      const mockSendResponse = vi.fn();
      runtimeMessageListener(
        {
          type: 'PROVIDER_EVENT',
          origin: mockWindow.location.origin,
          event: 'test-event',
          data: 'test-data'
        },
        {}, // sender
        mockSendResponse
      );
      
      // Should have called sendResponse
      expect(mockSendResponse).toHaveBeenCalledWith({ received: true, event: 'test-event' });
      
      // Should forward event to window
      expect(mockWindow.postMessage).toHaveBeenCalledWith(
        {
          target: 'xcp-wallet-injected',
          type: 'XCP_WALLET_EVENT',
          event: 'test-event',
          data: 'test-data'
        },
        mockWindow.location.origin
      );
    });

    it('drops provider events addressed to another origin, or to none', async () => {
      mockInjectScript.mockResolvedValue(undefined);
      const contentScript = await import('../content');
      await contentScript.default.main(mockContext as any);
      const listeners = (fakeBrowser.runtime.onMessage.addListener as any).mock.calls;
      const runtimeMessageListener = listeners[listeners.length - 1][0];

      for (const origin of ['https://evil.example', undefined]) {
        mockWindow.postMessage.mockClear();
        const sendResponse = vi.fn();
        runtimeMessageListener(
          { type: 'PROVIDER_EVENT', origin, event: 'accountsChanged', data: ['bc1qsecret'] },
          {},
          sendResponse
        );
        expect(sendResponse).toHaveBeenCalledWith({ received: false });
        expect(mockWindow.postMessage).not.toHaveBeenCalledWith(
          expect.objectContaining({ event: 'accountsChanged' }),
          expect.anything()
        );
      }
    });
  });
});
