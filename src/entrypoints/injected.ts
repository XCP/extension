import { defineUnlistedScript } from '#imports';
import { MESSAGE_TARGETS, MESSAGE_TYPES } from '@/constants/messaging';
import { reloadRequiredError } from '@/core/rpcErrors';

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
  timers: ReturnType<typeof setTimeout>[];
  /** The content script confirmed receipt: from here on only the wallet decides when it ends. */
  acked: boolean;
}

type ProviderRpcError = Error & { code?: number; data?: unknown };

// =============================================================================
// Constants
// =============================================================================

const REQUEST_TIMEOUT_MS = 60_000;

/**
 * How long the content script has to acknowledge receipt of a request. It acks synchronously on
 * receipt, so missing it means nothing is relaying for this page: the bridge is dead and waiting
 * longer cannot help. Applies to every method, interactive ones included; after the ack an
 * interactive request may wait on the user as long as it needs.
 */
const ACK_TIMEOUT_MS = 5_000;

/** The 48px logo, inlined: an injected script has no extension URL a page may load. */
const XCP_WALLET_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAPnSURBVGhD7ZhJaBRBFIanJzF6UBGdRFHBm6KoRBA9qIgGJTloElFccMnFiDcPxhVNohET3MGTMS6IJl6yXFSECIKCZyUuKO5e0gF3ULOM/99VM5nuqerumUi81Ac/773q7ur3uruWmYjBYDAYDAZD9ljS+tKTX5YHMxKKOw1urJjd/l36oUB/o6Xrhfn0or9fIgwmsADcrAjmPMSbDrDNwwjoEXqqiHW3fxNNauz88jwrEm+EuwLqdRrdRKHfUBWKaHNaAvAtQCbfDumeWCqd6K0MRfyQsQskn4vkm+GuFS2+sLgNKKJVhHpYsRIkvxyGTyFM8qQIH1grrhsr4yR2QWkmyRO+1Rb0VS5CPcoCcOEyGD75MU5DePhpnBGuwEk+bt2AGzb5BIkiykSoJq0AmXwHlGnyCWxpmXwOkr8Od51oyRhOHjf9inCNAZw4H6YTSvsMJByk74XrPKEZwk1y0eqLVk743Bq3JyL5ASf59eKQklcQZxzOblOg8ZCKP1AJxsQ9EQ7ifQPFkC75N9ASdDIHtjBixWfB7uIBSROObZfJR5H8NbT5JV+DvGfCFuK6ubALoSc8oIBvolS4brwFqOZ58hriE3jMALY/1t0xAHsO4UZoN17mDh5LSZ7tOmpwbW3M7uhjX2yA5dsogXRFqKbw0AVU4wYvpO8C7S3QqZjd1m9PWs3kr6J5kziq5AjOr5W+C7R/gtkronAoZyEFX6TV0j15lWX1R6/A3SxalBxFktXS1/FV2lCELUD3ZpJEe3OY/BYRKalD8oel70fgvVIJW4B3tnGB2esyzFYRKWHyh6QfxHRpQ+EtQLe1qEOSylkA7ZdgKkSk5FgieZw7DmqGGnsKSrk5dIF2rkFnRZSGMjfvOrAHpkFEaXC+roQeQDkQiz8AbYN0HEfyPMdJHoar+1LGgNuUgxD3PZyJ5kFNEM9TcRJ9VUk/ibcALiZ3oNlOg5rEVpdFcDHTUY8b7qeDfrlAcXVfzDiFPikySloVb6GV6O+lCAdJey242VSY25BfEUE04Gb76KA/Loy3oEWMs4DJF6M/5TSeNohx4kcYLihdTkPmnEgkL1kAZZv8O4gLqDJ5opyFUop46jSEh98px1EqYWc6L9xzMfnnIlSj7RwXfoDh3ihsEadxTdogAxnN6xI+eX42z0SoRzdtJsE3PA2mDuJAVO1HcqH7uFm9CN3gev5GuCsiF5x5HkJc5RMPkvn8hLhXCkyeBBYwVHwKaEOSa6SfNdl+n/8CfqJDZjgK0L1lfnpDZjgK0P3HE/q/Hz+GYwxwz7MT4mTAgct78ifiBYwB/sozGAwGg8Fg+D9EIn8BnbIl6I1ut4oAAAAASUVORK5CYII=';

// Methods that open a popup for user approval: no injected-side response timeout once the
// content script has acknowledged them. The background's own timeout (10 min) is the safety net.
const INTERACTIVE_METHODS = new Set([
  'xcp_requestAccounts',
  'xcp_signTransaction',
  'xcp_signPsbt',
  'xcp_signPsbts',
  'xcp_signBitcoinPsbt',
  'xcp_signMessage',
]);

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
  /** Set once the page has been told the bridge is gone, so `disconnect` fires once, not per request. */
  let bridgeLost = false;
  const probes = new Map<number, () => void>();
  let nextProbeId = 0;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function formatErrorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : String(error || 'Unknown error');
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

  function toRpcError(error: any): ProviderRpcError {
    const rejection: ProviderRpcError = new Error(formatErrorMessage(error?.message || error));
    // Preserve the JSON-RPC error code so dApps can branch (e.g. 4001 = user rejected).
    if (error && typeof error === 'object' && typeof error.code === 'number') {
      rejection.code = error.code;
      if (error.data !== undefined) rejection.data = error.data;
    }
    return rejection;
  }

  function takePending(id: number): PendingRequest | undefined {
    const pending = pendingRequests.get(id);
    if (!pending) return undefined;
    pendingRequests.delete(id);
    pending.timers.forEach(clearTimeout);
    return pending;
  }

  /**
   * The bridge to the extension is gone for this page: fail what is waiting and say so once.
   * Requests the content script already acknowledged are left alone: it answers those itself,
   * including with the reload error if its extension goes away, and one may be an approval the
   * user is looking at right now.
   */
  function loseBridge(): void {
    const error = reloadRequiredError();
    for (const [id, pending] of pendingRequests) {
      if (!pending.acked) takePending(id)?.reject(toRpcError(error));
    }
    if (bridgeLost) return;
    bridgeLost = true;
    accounts = [];
    eventEmitter.emit('disconnect', toRpcError(error));
  }

  function handleAck(id: number): void {
    const pending = pendingRequests.get(id);
    if (!pending) return;
    pending.acked = true;
    clearTimeout(pending.timers[0]);
  }

  /** Run `then` once everything already in this window's message queue has been delivered. */
  function afterQueuedMessages(then: () => void): void {
    const id = ++nextProbeId;
    probes.set(id, then);
    window.postMessage({ target: MESSAGE_TARGETS.INJECTED, type: MESSAGE_TYPES.PROBE, id }, window.location.origin);
  }

  /**
   * The ack deadline passed. On a page that kept its main thread busy, the timer can run before
   * the request (or its ack) got its turn in the message queue, so drain the queue first. Two
   * rounds: the first lets a still-queued request reach the content script, whose ack then lands
   * in the queue ahead of the second probe.
   */
  function confirmAckMissing(id: number): void {
    afterQueuedMessages(() => afterQueuedMessages(() => {
      const pending = pendingRequests.get(id);
      if (pending && !pending.acked) loseBridge();
    }));
  }

  function handleResponse(id: number, data: any, error: any): void {
    const pending = takePending(id);
    if (!pending) return;

    if (error) {
      pending.reject(toRpcError(error));
      return;
    }
    bridgeLost = false;

    // Update accounts state from account-related responses
    if (data?.method === 'xcp_requestAccounts') {
      // New shape: { accounts: string[], proof: ... }
      const accts = data.result?.accounts ?? data.result;
      if (Array.isArray(accts)) updateAccounts(accts);
    } else if (data?.method === 'xcp_accounts') {
      if (Array.isArray(data.result)) updateAccounts(data.result);
    }

    pending.resolve(data?.result);
  }

  function handleEvent(eventName: string, data: any): void {
    if (eventName === 'accountsChanged') {
      updateAccounts(Array.isArray(data) ? data : []);
    } else if (eventName === 'disconnect') {
      if (data?.data?.reloadRequired === true) {
        loseBridge();
        return;
      }
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
      if (event.data.type === MESSAGE_TYPES.ACK) {
        handleAck(event.data.id);
      } else if (event.data.type === MESSAGE_TYPES.PROBE) {
        const then = probes.get(event.data.id);
        probes.delete(event.data.id);
        then?.();
      } else if (event.data.type === MESSAGE_TYPES.RESPONSE) {
        handleResponse(event.data.id, event.data.data, event.data.error);
      } else if (event.data.type === MESSAGE_TYPES.EVENT) {
        handleEvent(event.data.event, event.data.data);
      }
    } catch (error) {
      console.error('Error in message handler:', error);
      const errorMsg = formatErrorMessage(error);
      for (const id of pendingRequests.keys()) takePending(id)?.reject(new Error(errorMsg));
    }
  });

  // ---------------------------------------------------------------------------
  // Request Sending
  // ---------------------------------------------------------------------------

  function sendRequest(method: string, params?: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++nextRequestId;
      // timers[0] is the ack deadline, cleared on receipt; timers[1] bounds non-interactive calls.
      const timers = [setTimeout(() => confirmAckMissing(id), ACK_TIMEOUT_MS)];
      if (!INTERACTIVE_METHODS.has(method)) {
        timers.push(setTimeout(() => {
          takePending(id)?.reject(new Error('Request timeout'));
        }, REQUEST_TIMEOUT_MS));
      }
      pendingRequests.set(id, { resolve, reject, timers, acked: false });

      window.postMessage({
        target: MESSAGE_TARGETS.CONTENT,
        type: MESSAGE_TYPES.REQUEST,
        id,
        data: { method, params }
      }, window.location.origin);
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

  // The page-global registry Bitcoin wallets share (the sats-connect convention),
  // so a dapp discovering wallets by id finds this one next to the others.
  const registry = window as Window & { btc_providers?: unknown[] };
  if (!Array.isArray(registry.btc_providers)) registry.btc_providers = [];
  registry.btc_providers.push({
    id: 'XcpWalletProvider',
    name: 'XCP Wallet',
    icon: XCP_WALLET_ICON,
    methods: [
      'xcp_requestAccounts', 'xcp_accounts', 'xcp_disconnect', 'xcp_getAddresses',
      'xcp_signMessage', 'xcp_signTransaction', 'xcp_signPsbt', 'xcp_signPsbts',
      'xcp_signBitcoinPsbt', 'xcp_broadcastTransaction', 'xcp_getNetwork', 'xcp_chainId',
    ],
  });

  // Announce provider is available
  window.dispatchEvent(new Event('xcp-wallet#initialized'));

  // Re-announce whenever a dApp asks — handles dApps that load before the
  // content script injects, or single-page apps that mount later.
  window.addEventListener('xcp-wallet#discover', () => {
    window.dispatchEvent(new Event('xcp-wallet#initialized'));
  });

  console.log('XCP Wallet provider initialized');
});
