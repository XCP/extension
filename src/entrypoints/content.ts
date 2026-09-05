import { defineContentScript, injectScript } from '#imports';
import { MESSAGE_TARGETS, MESSAGE_TYPES } from '@/constants/messaging';
import { classifyProviderError, JSON_RPC_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { disconnectAllPorts } from '@/platform/proxy';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Always include localhost for local dApp testing (safe - only accessible locally)
// HTTPS for all other sites
const matches = ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'];

export default defineContentScript({
  matches,
  runAt: 'document_start',
  async main(ctx) {
    /**
     * CRITICAL: Send "ready" signal to background immediately
     * This tells the background which tabs have content scripts loaded,
     * preventing "Receiving end does not exist" errors when broadcasting.
     */
    try {
      chrome.runtime.sendMessage({ __xcp_cs_ready: true, tabUrl: window.location.href }, () => {
        // Always consume lastError to prevent console warnings
        if (chrome.runtime.lastError) {
          // Expected during extension startup - background might not be ready yet
        }
      });
    } catch (_e) {
      // Ignore errors during initial handshake
    }
    /**
     * Main message handler for background → content script communication
     * We register this EARLY to consume any Chrome runtime errors
     *
     * Handles:
     * - Health checks/pings from background
     * - Provider events to relay to the injected script
     *
     * IMPORTANT: Always returns true for async responses to prevent
     * "The message port closed before a response was received" errors
     */
    const runtimeMessageHandler = (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => {
      // ALWAYS check lastError first to consume any errors
      if (chrome.runtime?.lastError) {
        // Error consumed - prevents "Unchecked runtime.lastError" spam
      }

      // Type guard for message object
      const msg = isRecord(message) ? message : undefined;

      // Handle startup health checks
      if (msg?.type === 'startup-health-check' || msg?.action === 'ping') {
        sendResponse({ status: 'ready', timestamp: Date.now(), context: 'content-script' });
        return true; // Keep channel open for async response
      }

      // Handle provider events (accountsChanged, disconnect, etc.)
      if (msg?.type === 'PROVIDER_EVENT') {
        try {
          // Relay event to injected script via window.postMessage
          window.postMessage({
            target: MESSAGE_TARGETS.INJECTED,
            type: MESSAGE_TYPES.EVENT,
            event: msg.event,
            data: msg.data
          }, window.location.origin);
          sendResponse({ received: true, event: msg.event });
        } catch (error) {
          console.error('Failed to post provider event:', error);
          sendResponse({ received: false, error: { message: 'Failed to relay event', code: -32603 } });
        }
        return true; // Keep channel open for async response
      }

      // Default response for unknown messages
      sendResponse({ handled: false });
      return true; // Always return true to indicate async response
    };

    // Register the runtime message handler IMMEDIATELY
    browser.runtime.onMessage.addListener(runtimeMessageHandler);

    // The page controls the payload. The background independently validates the
    // transport and derives the origin from the browser sender.
    const messageHandler = async (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const request = event.data;
      if (!isRecord(request) || request.target !== MESSAGE_TARGETS.CONTENT || request.type !== MESSAGE_TYPES.REQUEST) return;
      if (!(typeof request.id === 'string' && request.id.length <= 256)
        && !(typeof request.id === 'number' && Number.isSafeInteger(request.id))) return;
      const envelope = { target: MESSAGE_TARGETS.INJECTED, type: MESSAGE_TYPES.RESPONSE, id: request.id };
      try {
        if (!isRecord(request.data) || typeof request.data.method !== 'string') {
          throw new ProviderError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, 'Invalid request: method must be a string');
        }
        const { method, params } = request.data;
        if (params !== undefined && !Array.isArray(params)) {
          throw new ProviderError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, 'Invalid request: params must be an array');
        }
        const { getProviderService } = await import('@/services/providerService');
        const result = await getProviderService().handleRequest(window.location.origin, method, params);
        window.postMessage({ ...envelope, data: { method, result } }, window.location.origin);
      } catch (error: unknown) {
        window.postMessage({ ...envelope, error: classifyProviderError(error) }, window.location.origin);
      }
    };
    // Add message event listeners
    window.addEventListener('message', messageHandler);

    console.log('XCP Wallet content script loaded on:', window.location.href);

    try {
      await injectScript("/injected.js", {
        keepInDom: true,
      });
    } catch (error) {
      console.error('Failed to inject XCP Wallet provider:', error);
    }

    // BFCache handling: disconnect stale ports before freeze, reconnect on restore.
    window.addEventListener('pagehide', (event) => {
      if ((event as PageTransitionEvent).persisted) disconnectAllPorts();
    });
    window.addEventListener('pageshow', (event) => {
      if ((event as PageTransitionEvent).persisted) {
        disconnectAllPorts();
        try {
          chrome.runtime.sendMessage({ __xcp_cs_ready: true, tabUrl: window.location.href }, () => {
            if (chrome.runtime.lastError) { /* consumed */ }
          });
        } catch {}
      }
    });

    // Keep the window message listener alive across extension updates so the
    // bridge between window.xcpwallet and the background survives. The proxy
    // layer reconnects its port automatically.
    ctx.onInvalidated(() => {
      try { browser.runtime.onMessage.removeListener(runtimeMessageHandler); } catch {}
    });
  },
});
