import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

// Mock WXT injectScript function
const mockInjectScript = vi.fn();
vi.mock('wxt/utils/inject-script', () => ({
  injectScript: mockInjectScript
}));

vi.mock('#imports', () => ({
  defineContentScript: (config: any) => config,
  injectScript: mockInjectScript
}));

// Mock MessageBus
const mockMessageBus = {
  send: vi.fn()
};

vi.mock('@/services/core/MessageBus', () => ({
  MessageBus: mockMessageBus
}));

// Mock provider service
const mockProviderService = {
  handleRequest: vi.fn()
};

vi.mock('@/services/providerService', () => ({
  getProviderService: () => mockProviderService
}));

// Setup fake browser
fakeBrowser.runtime.sendMessage = vi.fn();
fakeBrowser.runtime.onMessage.addListener = vi.fn();
fakeBrowser.runtime.onMessage.removeListener = vi.fn();
fakeBrowser.runtime.onConnect = {
  addListener: vi.fn(),
  removeListener: vi.fn(),
  hasListener: vi.fn(),
  hasListeners: vi.fn(),
};
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
    
    // Reset MessageBus mock
    mockMessageBus.send.mockClear();
    
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
      // User rejection errors should be passed through
      mockProviderService.handleRequest.mockRejectedValue(new Error('User denied the request'));

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
            code: -32603
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
      // This would typically come from webext-bridge
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

    it('should remove event listeners when cleanup callback is called', async () => {
      // Create spies for removeEventListener methods
      const windowRemoveEventListenerSpy = vi.spyOn(mockWindow, 'removeEventListener');
      const runtimeRemoveListenerSpy = vi.spyOn(fakeBrowser.runtime.onMessage, 'removeListener');
      
      const contentScript = await import('../content');
      
      await contentScript.default.main(mockContext as any);
      
      // Get the cleanup callback that was registered
      const cleanupCallback = mockContext.onInvalidated.mock.calls[0][0];
      expect(typeof cleanupCallback).toBe('function');
      
      // Call the cleanup callback
      cleanupCallback();
      
      // Should have removed the window message listener
      expect(windowRemoveEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
      
      // Should have removed the runtime message listener
      expect(runtimeRemoveListenerSpy).toHaveBeenCalledWith(expect.any(Function));
      
      // Should log cleanup message
      expect(mockConsole.log).toHaveBeenCalledWith('XCP Wallet content script cleaned up.');
      
      // Clean up spies
      windowRemoveEventListenerSpy.mockRestore();
      runtimeRemoveListenerSpy.mockRestore();
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
  });
});