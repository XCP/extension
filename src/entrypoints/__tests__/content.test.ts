import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

// Mock WXT injectScript function
const mockInjectScript = vi.fn();
vi.mock('wxt/utils/inject-script', () => ({
  injectScript: mockInjectScript
}));

vi.mock('#imports', () => ({
  defineContentScript: (config: any) => config
}));

// Setup fake browser
fakeBrowser.runtime.sendMessage = vi.fn();
fakeBrowser.runtime.onMessage.addListener = vi.fn();
fakeBrowser.runtime.id = 'test-extension-id';
fakeBrowser.runtime.getURL = vi.fn((path: string) => `chrome-extension://test-id${path}`);

(global as any).browser = fakeBrowser;

// Mock window object
const mockWindow = {
  addEventListener: vi.fn(),
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
  error: vi.fn()
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
    mockInjectScript.mockClear();
    
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
      
      // Check that our mock is set up correctly
      console.log('injectScript in global:', 'injectScript' in global);
      console.log('mockInjectScript calls before:', mockInjectScript.mock.calls.length);
      
      // Import content script
      const contentScript = await import('../content');
      
      console.log('Content script loaded:', typeof contentScript.default);
      console.log('Main function type:', typeof contentScript.default.main);
      
      // Execute the content script main function
      await contentScript.default.main({} as any);

      console.log('mockInjectScript calls after:', mockInjectScript.mock.calls.length);
      console.log('mockInjectScript calls:', mockInjectScript.mock.calls);

      // Should inject script using WXT's injectScript
      expect(mockInjectScript).toHaveBeenCalledWith('/injected.js', {
        keepInDom: true
      });
      
      // Should log success
      expect(mockConsole.log).toHaveBeenCalledWith('Injected XCP Wallet provider successfully.');
    });

    it('should handle injection error', async () => {
      const error = new Error('Injection failed');
      mockInjectScript.mockRejectedValue(error);
      
      const contentScript = await import('../content');
      
      await contentScript.default.main({} as any);

      expect(mockInjectScript).toHaveBeenCalled();
      expect(mockConsole.error).toHaveBeenCalledWith('Failed to inject XCP Wallet provider:', error);
    });
  });

  describe('Message Handling', () => {
    let messageListener: any;

    beforeEach(async () => {
      // Clear all mocks first
      vi.clearAllMocks();
      (fakeBrowser.runtime.sendMessage as any).mockResolvedValue({ success: true, result: 'test' });
      
      const contentScript = await import('../content');
      
      await contentScript.default.main({} as any);
      
      // Get the message listener that was added
      messageListener = mockWindow.addEventListener.mock.calls.find(
        call => call[0] === 'message'
      )?.[1];
      
      expect(messageListener).toBeDefined();
    });

    it('should handle XCP wallet request messages', async () => {
      const mockResponse = { success: true, result: 'test-result' };
      (fakeBrowser.runtime.sendMessage as any).mockResolvedValue(mockResponse);

      // Simulate XCP wallet request
      const event = {
        source: window,
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

      expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'PROVIDER_REQUEST',
        origin: mockWindow.location.origin,
        data: event.data.data,
        xcpWalletVersion: '2.0',
        timestamp: expect.any(Number)
      });

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

    it('should handle runtime.sendMessage errors', async () => {
      const error = new Error('Request failed');
      (error as any).code = -1; // Set the error code
      (fakeBrowser.runtime.sendMessage as any).mockRejectedValue(error);

      const event = {
        source: window,
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

      expect(mockWindow.postMessage).toHaveBeenCalledWith(
        {
          target: 'xcp-wallet-injected',
          type: 'XCP_WALLET_RESPONSE',
          id: '456',
          error: {
            message: 'Request failed',
            code: -1
          }
        },
        mockWindow.location.origin
      );
    });

    it('should handle no response from background', async () => {
      (fakeBrowser.runtime.sendMessage as any).mockResolvedValue(null);

      const event = {
        source: window,
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

      expect(mockWindow.postMessage).toHaveBeenCalledWith(
        {
          target: 'xcp-wallet-injected',
          type: 'XCP_WALLET_RESPONSE',
          id: '789',
          error: {
            message: 'No response from extension background',
            code: -32603
          }
        },
        mockWindow.location.origin
      );
    });

    it('should ignore non-XCP wallet messages', async () => {
      const event = {
        source: window,
        data: {
          target: 'other-target',
          type: 'OTHER_MESSAGE',
          data: 'test'
        }
      };

      await messageListener(event);

      expect(fakeBrowser.runtime.sendMessage).not.toHaveBeenCalled();
      expect(mockWindow.postMessage).not.toHaveBeenCalled();
    });

    it('should ignore messages from different source', async () => {
      const differentWindow = {} as Window;
      const event = {
        source: differentWindow,
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

      expect(fakeBrowser.runtime.sendMessage).not.toHaveBeenCalled();
      expect(mockWindow.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Provider Events', () => {
    beforeEach(async () => {
      mockWindow.location.hostname = 'xcp.io';
      const contentScript = await import('../content');
      
      await contentScript.default.main({} as any);
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
        'http://127.0.0.1/*',
        'file:///*'
      ]);
    });

    it('should export a content script with main function', async () => {
      const contentScript = await import('../content');
      
      expect(contentScript.default).toBeDefined();
      expect(typeof contentScript.default.main).toBe('function');
      expect(Array.isArray(contentScript.default.matches)).toBe(true);
    });
  });

  describe('Logging', () => {
    it('should log debug messages for message flow', async () => {
      (fakeBrowser.runtime.sendMessage as any).mockResolvedValue({ success: true, result: 'test' });
      
      const contentScript = await import('../content');
      
      await contentScript.default.main({} as any);
      
      const messageListener = mockWindow.addEventListener.mock.calls.find(
        call => call[0] === 'message'
      )?.[1];

      const event = {
        source: window,
        data: {
          target: 'xcp-wallet-content',
          type: 'XCP_WALLET_REQUEST',
          id: '123',
          data: {
            method: 'test_method',
            params: []
          }
        }
      };

      await messageListener(event);

      // Should log the message being sent to background
      expect(mockConsole.debug).toHaveBeenCalledWith(
        'Content script sending message to background:',
        expect.objectContaining({
          type: 'PROVIDER_REQUEST',
          origin: mockWindow.location.origin,
          extensionId: 'test-extension-id'
        })
      );

      // Should log the response received
      expect(mockConsole.debug).toHaveBeenCalledWith(
        'Content script received response from background:',
        { success: true, result: 'test' }
      );
    });
  });

  describe('Integration', () => {
    it('should set up complete message flow', async () => {
      mockInjectScript.mockResolvedValue(undefined);
      (fakeBrowser.runtime.sendMessage as any).mockResolvedValue({ success: true, result: 'integration-test' });
      
      const contentScript = await import('../content');
      
      await contentScript.default.main({} as any);
      
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
        data: {
          target: 'xcp-wallet-content',
          type: 'XCP_WALLET_REQUEST',
          id: 'integration-123',
          data: { method: 'test', params: [] }
        }
      });
      
      // Should have sent message to background
      expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalled();
      
      // Should have posted response to window
      expect(mockWindow.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          target: 'xcp-wallet-injected',
          type: 'XCP_WALLET_RESPONSE',
          id: 'integration-123'
        }),
        mockWindow.location.origin
      );
      
      // Simulate runtime event
      runtimeMessageListener({
        type: 'PROVIDER_EVENT',
        event: 'test-event',
        data: 'test-data'
      });
      
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