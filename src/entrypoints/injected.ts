import { defineUnlistedScript } from '#imports';

// EIP-1193 style provider for XCP Wallet
interface XcpWalletProvider {
  isConnected: () => boolean;
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => void;
  removeListener: (event: string, handler: (...args: any[]) => void) => void;
  // Legacy aliases for compatibility
  enable: () => Promise<string[]>;
  send: (method: string, params?: any[]) => Promise<any>;
}

export default defineUnlistedScript(() => {
  // Check if already injected
  if ((window as any).xcpwallet) {
    console.warn('XCP Wallet provider is already defined');
    return;
  }

  // Event emitter for provider events
  class EventEmitter {
    private events: Map<string, Set<Function>> = new Map();

    on(event: string, handler: Function): void {
      if (!this.events.has(event)) {
        this.events.set(event, new Set());
      }
      this.events.get(event)!.add(handler);
    }

    off(event: string, handler: Function): void {
      const handlers = this.events.get(event);
      if (handlers) {
        handlers.delete(handler);
      }
    }

    emit(event: string, ...args: any[]): void {
      const handlers = this.events.get(event);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(...args);
          } catch (error) {
            console.error('Error in event handler:', error);
          }
        });
      }
    }

    removeAllListeners(event?: string): void {
      if (event) {
        this.events.delete(event);
      } else {
        this.events.clear();
      }
    }
  }

  const eventEmitter = new EventEmitter();
  let isConnected = false;
  let accounts: string[] = [];
  let requestId = 0;
  const pendingRequests = new Map<number, { resolve: Function; reject: Function }>();

  // Listen for responses from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data?.target === 'xcp-wallet-injected') {
      if (event.data.type === 'XCP_WALLET_RESPONSE') {
        const { id, data, error } = event.data;
        console.debug('Injected script received response:', { id, data, error });
        const pending = pendingRequests.get(id);
        
        if (pending) {
          pendingRequests.delete(id);
          if (error) {
            pending.reject(new Error(error.message));
          } else {
            // Update connection state based on responses
            if (data?.method === 'xcp_requestAccounts' || data?.method === 'xcp_accounts') {
              console.debug('Processing accounts response:', { method: data?.method, result: data?.result });
              if (Array.isArray(data.result) && data.result.length > 0) {
                isConnected = true;
                accounts = data.result;
                eventEmitter.emit('accountsChanged', accounts);
              }
            }
            console.debug('Resolving with result:', data?.result);
            pending.resolve(data?.result);
          }
        }
      } else if (event.data.type === 'XCP_WALLET_EVENT') {
        // Handle provider events from wallet
        const { event: eventName, data } = event.data;
        
        if (eventName === 'accountsChanged') {
          accounts = data || [];
          isConnected = accounts.length > 0;
        } else if (eventName === 'disconnect') {
          isConnected = false;
          accounts = [];
        }
        
        eventEmitter.emit(eventName, data);
      }
    }
  });

  // Send request to content script
  function sendRequest(method: string, params?: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      pendingRequests.set(id, { resolve, reject });
      
      window.postMessage({
        target: 'xcp-wallet-content',
        type: 'XCP_WALLET_REQUEST',
        id,
        data: { method, params }
      }, window.location.origin);
      
      // Timeout after 60 seconds
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 60000);
    });
  }

  // Create the provider object
  const xcpwallet: XcpWalletProvider = {
    // Connection state
    isConnected: () => isConnected,

    // EIP-1193 request method
    request: async ({ method, params = [] }): Promise<any> => {
      // Validate method
      if (typeof method !== 'string') {
        throw new Error('Method must be a string');
      }

      return sendRequest(method, params);
    },

    // Event handling
    on: (event: string, handler: (...args: any[]) => void) => {
      eventEmitter.on(event, handler);
    },

    removeListener: (event: string, handler: (...args: any[]) => void) => {
      eventEmitter.off(event, handler);
    },

    // Legacy method for compatibility
    enable: async () => {
      return sendRequest('xcp_requestAccounts', []);
    },

    // Legacy send method for compatibility
    send: async (method: string, params?: any[]) => {
      return sendRequest(method, params);
    }
  };

  // Inject the provider
  Object.defineProperty(window, 'xcpwallet', {
    value: xcpwallet,
    writable: false,
    configurable: false,
    enumerable: true
  });

  // Announce the provider
  window.dispatchEvent(new Event('xcp-wallet#initialized'));
  
  console.log('XCP Wallet provider initialized');
});