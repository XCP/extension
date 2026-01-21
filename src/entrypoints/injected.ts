import { defineUnlistedScript } from '#imports';
import { MESSAGE_TARGETS, MESSAGE_TYPES } from '@/constants/messaging';

// =============================================================================
// Types
// =============================================================================

interface XcpWalletProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

// =============================================================================
// Constants
// =============================================================================

const REQUEST_TIMEOUT_MS = 60000;

// =============================================================================
// EventEmitter
// =============================================================================

class EventEmitter {
  private events = new Map<string, Set<Function>>();

  on(event: string, handler: Function): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(handler);
  }

  off(event: string, handler: Function): void {
    this.events.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    this.events.get(event)?.forEach(handler => {
      try {
        handler(...args);
      } catch (error) {
        console.error('Error in event handler:', error);
      }
    });
  }
}

// =============================================================================
// Provider Implementation
// =============================================================================

export default defineUnlistedScript(() => {
  // Prevent double injection
  if ((window as any).xcpwallet) {
    console.warn('XCP Wallet provider is already defined');
    return;
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const eventEmitter = new EventEmitter();
  const pendingRequests = new Map<number, PendingRequest>();
  let accounts: string[] = [];
  let nextRequestId = 0;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function formatErrorMessage(error: unknown): string {
    const message = error instanceof Error
      ? error.message
      : String(error || 'Unknown error');

    // Handle webext-bridge fingerprint errors
    if (message.includes('fingerprint')) {
      return 'Extension services not available. Please try reloading the extension.';
    }
    return message;
  }

  function updateAccounts(newAccounts: string[]): void {
    const changed = accounts.length !== newAccounts.length ||
                    accounts.some((a, i) => a !== newAccounts[i]);
    if (changed) {
      accounts = [...newAccounts];
      eventEmitter.emit('accountsChanged', [...accounts]);
    }
  }

  // ---------------------------------------------------------------------------
  // Message Handling
  // ---------------------------------------------------------------------------

  function handleResponse(id: number, data: any, error: any): void {
    const pending = pendingRequests.get(id);
    if (!pending) return;

    pendingRequests.delete(id);

    if (error) {
      pending.reject(new Error(formatErrorMessage(error?.message || error)));
      return;
    }

    // Update accounts state from account-related responses
    if (data?.method === 'xcp_requestAccounts' || data?.method === 'xcp_accounts') {
      if (Array.isArray(data.result)) {
        updateAccounts(data.result);
      }
    }

    pending.resolve(data?.result);
  }

  function handleEvent(eventName: string, data: any): void {
    if (eventName === 'accountsChanged') {
      updateAccounts(Array.isArray(data) ? data : []);
    } else if (eventName === 'disconnect') {
      accounts = [];
      eventEmitter.emit('disconnect', data);
    } else {
      eventEmitter.emit(eventName, Array.isArray(data) ? [...data] : data);
    }
  }

  window.addEventListener('message', (event) => {
    // Security: Only accept messages from same window and origin
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.target !== MESSAGE_TARGETS.INJECTED) return;

    try {
      if (event.data.type === MESSAGE_TYPES.RESPONSE) {
        handleResponse(event.data.id, event.data.data, event.data.error);
      } else if (event.data.type === MESSAGE_TYPES.EVENT) {
        handleEvent(event.data.event, event.data.data);
      }
    } catch (error) {
      console.error('Error in message handler:', error);
      const errorMsg = formatErrorMessage(error);
      for (const [id, pending] of pendingRequests.entries()) {
        pendingRequests.delete(id);
        pending.reject(new Error(errorMsg));
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Request Sending
  // ---------------------------------------------------------------------------

  function sendRequest(method: string, params?: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++nextRequestId;
      pendingRequests.set(id, { resolve, reject });

      window.postMessage({
        target: MESSAGE_TARGETS.CONTENT,
        type: MESSAGE_TYPES.REQUEST,
        id,
        data: { method, params }
      }, window.location.origin);

      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, REQUEST_TIMEOUT_MS);
    });
  }

  // ---------------------------------------------------------------------------
  // Provider Object
  // ---------------------------------------------------------------------------

  const xcpwallet: XcpWalletProvider = {
    request: async ({ method, params = [] }) => {
      if (typeof method !== 'string') {
        throw new Error('Method must be a string');
      }
      return sendRequest(method, params);
    },

    on: (event, handler) => eventEmitter.on(event, handler),
    removeListener: (event, handler) => eventEmitter.off(event, handler),
  };

  // ---------------------------------------------------------------------------
  // Inject and Announce
  // ---------------------------------------------------------------------------

  Object.defineProperty(window, 'xcpwallet', {
    value: xcpwallet,
    writable: false,
    configurable: false,
    enumerable: true
  });

  window.dispatchEvent(new Event('xcp-wallet#initialized'));
  console.log('XCP Wallet provider initialized');
});
