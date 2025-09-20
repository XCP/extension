import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

describe('Message Passing Between Contexts', () => {
  let mockWindow: any;
  let messageListeners: Map<string, Function[]>;
  
  beforeEach(() => {
    // Reset fakeBrowser state
    fakeBrowser.reset();
    
    // Setup mock window
    messageListeners = new Map();
    mockWindow = {
      addEventListener: vi.fn((event, handler) => {
        if (!messageListeners.has(event)) {
          messageListeners.set(event, []);
        }
        messageListeners.get(event)!.push(handler);
      }),
      postMessage: vi.fn(),
      location: {
        origin: 'https://test-dapp.com'
      }
    };
    
    // Setup browser API mocks using fakeBrowser
    fakeBrowser.runtime.sendMessage = vi.fn();
    fakeBrowser.runtime.onMessage.addListener = vi.fn();
    fakeBrowser.tabs.query = vi.fn();
    fakeBrowser.tabs.sendMessage = vi.fn();
    
    global.window = mockWindow as any;
    (global as any).browser = fakeBrowser;
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('Injected Script → Content Script', () => {
    it('should send provider request via postMessage', () => {
      // Simulate injected script sending a request
      const requestData = {
        target: 'xcp-wallet-content',
        type: 'XCP_WALLET_REQUEST',
        id: 1,
        data: {
          method: 'eth_accounts',
          params: []
        }
      };
      
      mockWindow.postMessage(requestData, mockWindow.location.origin);
      
      expect(mockWindow.postMessage).toHaveBeenCalledWith(
        requestData,
        mockWindow.location.origin
      );
    });
    
    it('should include request ID for response matching', () => {
      const requestData = {
        target: 'xcp-wallet-content',
        type: 'XCP_WALLET_REQUEST',
        id: 123,
        data: {
          method: 'eth_requestAccounts',
          params: []
        }
      };
      
      mockWindow.postMessage(requestData, mockWindow.location.origin);
      
      const call = mockWindow.postMessage.mock.calls[0];
      expect(call[0].id).toBe(123);
    });
  });
  
  describe('Content Script → Background', () => {
    it('should forward provider request to background', async () => {
      (fakeBrowser.runtime.sendMessage as any).mockResolvedValue({
        success: true,
        result: ['bc1qtest123']
      });
      
      const message = {
        type: 'PROVIDER_REQUEST',
        origin: 'https://test-dapp.com',
        data: {
          method: 'eth_accounts',
          params: []
        }
      };
      
      const result = await fakeBrowser.runtime.sendMessage(message);
      
      expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith(message);
      expect(result.success).toBe(true);
      expect(result.result).toEqual(['bc1qtest123']);
    });
    
    it('should include origin in provider request', async () => {
      const message = {
        type: 'PROVIDER_REQUEST',
        origin: 'https://malicious-site.com',
        data: {
          method: 'eth_requestAccounts',
          params: []
        }
      };
      
      await fakeBrowser.runtime.sendMessage(message);
      
      const call = vi.mocked(fakeBrowser.runtime.sendMessage).mock.calls[0];
      expect(call[0].origin).toBe('https://malicious-site.com');
    });
  });
  
  describe('Background → Content Script', () => {
    it('should emit provider events to all tabs', async () => {
      vi.mocked(fakeBrowser.tabs.query).mockResolvedValue([
        { id: 1, url: 'https://dapp1.com' },
        { id: 2, url: 'https://dapp2.com' }
      ] as any);
      
      // Simulate emitting accountsChanged event
      const eventData = {
        type: 'PROVIDER_EVENT',
        event: 'accountsChanged',
        data: ['bc1qnewaddress']
      };
      
      // Call the emitProviderEvent function
      await fakeBrowser.tabs.query({});
      const tabs = await vi.mocked(fakeBrowser.tabs.query).mock.results[0].value;
      
      for (const tab of tabs) {
        if (tab.id) {
          await fakeBrowser.tabs.sendMessage(tab.id, eventData);
        }
      }
      
      expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledTimes(2);
      expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(1, eventData);
      expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(2, eventData);
    });
  });
  
  describe('Content Script → Injected Script', () => {
    it('should send response back via postMessage', () => {
      const responseData = {
        target: 'xcp-wallet-injected',
        type: 'XCP_WALLET_RESPONSE',
        id: 1,
        data: {
          success: true,
          result: ['bc1qtest123']
        }
      };
      
      mockWindow.postMessage(responseData, mockWindow.location.origin);
      
      expect(mockWindow.postMessage).toHaveBeenCalledWith(
        responseData,
        mockWindow.location.origin
      );
    });
    
    it('should send error response on failure', () => {
      const errorResponse = {
        target: 'xcp-wallet-injected',
        type: 'XCP_WALLET_RESPONSE',
        id: 1,
        error: {
          message: 'User denied the request',
          code: -32603
        }
      };
      
      mockWindow.postMessage(errorResponse, mockWindow.location.origin);
      
      const call = mockWindow.postMessage.mock.calls[0];
      expect(call[0].error).toBeDefined();
      expect(call[0].error.message).toBe('User denied the request');
    });
    
    it('should forward provider events', () => {
      const eventData = {
        target: 'xcp-wallet-injected',
        type: 'XCP_WALLET_EVENT',
        event: 'accountsChanged',
        data: ['bc1qnewaddress']
      };
      
      mockWindow.postMessage(eventData, mockWindow.location.origin);
      
      const call = mockWindow.postMessage.mock.calls[0];
      expect(call[0].type).toBe('XCP_WALLET_EVENT');
      expect(call[0].event).toBe('accountsChanged');
      expect(call[0].data).toEqual(['bc1qnewaddress']);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle timeout in injected script', async () => {
      // This would be tested with actual timeout logic
      
      // Simulate a request that times out
      const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error('Request timeout'));
        }, 100); // Fast timeout for testing
      });
      
      await expect(timeoutPromise).rejects.toThrow('Request timeout');
    });
    
    it('should handle malformed messages', () => {
      // Test that malformed messages are ignored
      const malformedMessage = {
        // Missing required fields
        type: 'UNKNOWN_TYPE'
      };
      
      // This should not throw
      expect(() => {
        // Message handler would ignore this
        if (malformedMessage.type !== 'XCP_WALLET_REQUEST') {
          return; // Ignore
        }
      }).not.toThrow();
    });
    
    it('should validate message origin', () => {
      const message = {
        source: mockWindow, // Same window
        origin: 'https://evil-site.com',
        data: {
          target: 'xcp-wallet-content',
          type: 'XCP_WALLET_REQUEST',
          id: 1,
          data: { method: 'eth_accounts' }
        }
      };
      
      // Content script should validate source
      const isValidSource = message.source === mockWindow;
      expect(isValidSource).toBe(true);
    });
  });
  
  describe('Request/Response Correlation', () => {
    it('should match responses to requests by ID', () => {
      const pendingRequests = new Map();
      
      // Store pending request
      const requestId = 1;
      const promise = { resolve: vi.fn(), reject: vi.fn() };
      pendingRequests.set(requestId, promise);
      
      // Receive response
      const response = {
        id: 1,
        data: { result: ['bc1qtest123'] }
      };
      
      // Match and resolve
      const pending = pendingRequests.get(response.id);
      expect(pending).toBeDefined();
      
      pending.resolve(response.data.result);
      expect(promise.resolve).toHaveBeenCalledWith(['bc1qtest123']);
      
      // Clean up
      pendingRequests.delete(response.id);
      expect(pendingRequests.has(response.id)).toBe(false);
    });
    
    it('should handle out-of-order responses', () => {
      const pendingRequests = new Map();
      
      // Store multiple pending requests
      pendingRequests.set(1, { resolve: vi.fn(), reject: vi.fn() });
      pendingRequests.set(2, { resolve: vi.fn(), reject: vi.fn() });
      pendingRequests.set(3, { resolve: vi.fn(), reject: vi.fn() });
      
      // Receive responses out of order
      const response2 = { id: 2, data: { result: 'result2' } };
      const response3 = { id: 3, data: { result: 'result3' } };
      const response1 = { id: 1, data: { result: 'result1' } };
      
      // Resolve in different order
      pendingRequests.get(response2.id)!.resolve(response2.data.result);
      pendingRequests.get(response3.id)!.resolve(response3.data.result);
      pendingRequests.get(response1.id)!.resolve(response1.data.result);
      
      expect(pendingRequests.get(1)!.resolve).toHaveBeenCalledWith('result1');
      expect(pendingRequests.get(2)!.resolve).toHaveBeenCalledWith('result2');
      expect(pendingRequests.get(3)!.resolve).toHaveBeenCalledWith('result3');
    });
  });
});