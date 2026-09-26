import { defineContentScript, injectScript } from '#imports';
import { MESSAGE_TARGETS, MESSAGE_TYPES } from '@/constants/messaging';
import { isRecord } from '@/core/isRecord';
import { classifyProviderError, JSON_RPC_ERROR_CODES, ProviderError, reloadRequiredError } from '@/core/rpcErrors';
import { isContextInvalidatedError, isExtensionContextValid } from '@/platform/extensionContext';
import { disconnectAllPorts } from '@/platform/proxy';
import { getProviderServiceClient } from '@/services/providerServiceClient';

const BRIDGE_OWNER_KEY = '__xcpWalletBridgeOwner';
/** How often the content script checks whether its extension is still there. */
const CONTEXT_WATCH_INTERVAL_MS = 2_000;

// Always include localhost for local dApp testing (safe - only accessible locally)
// HTTPS for all other sites
const matches = ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'];

export default defineContentScript({
  matches,
  runAt: 'document_start',
  async main(ctx) {
    // Nothing is sent to the background on load. This script runs in every https page, and any
    // message would wake the service worker on every page load in the browser; it only needs to
    // hear from this page once the page uses the provider.
    /**
     * Main message handler for background → content script communication: provider events to
     * relay to the injected script.
     *
     * IMPORTANT: Always returns true for async responses to prevent
     * "The message port closed before a response was received" errors
     */
    const runtimeMessageHandler = (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => {
      // Type guard for message object
      const msg = isRecord(message) ? message : undefined;

      // Handle provider events (accountsChanged, disconnect, etc.)
      if (msg?.type === 'PROVIDER_EVENT') {
        // Events reach every tab; only the origin they were addressed to may see them.
        if (msg.origin !== window.location.origin) {
          sendResponse({ received: false });
          return true;
        }
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

    /**
     * The bridge dies with the extension context. After an extension reload or update this script
     * is orphaned: it keeps receiving page messages but can never reach the new background, and
     * only a page reload injects a live one. So every request it still holds, and every request
     * after, is answered at once with a typed 4900 instead of being left to hang, and the page is
     * told once through the provider's `disconnect` event.
     */
    type Envelope = { target: string; type: string; id: string | number };
    const inFlight = new Map<object, Envelope>(); // keyed per request: page ids may repeat
    let bridgeClosed = false;
    /**
     * Which copy of this script owns the page. Copies of one extension's content scripts share an
     * isolated world, so a newer copy overwrites this and the older one falls silent; the page
     * cannot reach this world, so unlike WXT's DOM hand-off event it cannot deafen its own bridge.
     */
    const ownership = {};
    Reflect.set(globalThis, BRIDGE_OWNER_KEY, ownership);
    const isOwner = () => Reflect.get(globalThis, BRIDGE_OWNER_KEY) === ownership;
    let contextWatch: ReturnType<typeof setInterval> | undefined;
    const closeBridge = () => {
      if (bridgeClosed) return;
      bridgeClosed = true;
      const error = reloadRequiredError();
      for (const envelope of inFlight.values()) window.postMessage({ ...envelope, error }, window.location.origin);
      inFlight.clear();
      window.postMessage({
        target: MESSAGE_TARGETS.INJECTED, type: MESSAGE_TYPES.EVENT, event: 'disconnect', data: error,
      }, window.location.origin);
      try { browser.runtime.onMessage.removeListener(runtimeMessageHandler); } catch { /* context gone */ }
      clearInterval(contextWatch);
    };

    /**
     * Tell the page as soon as the extension goes away, not at its next request. A property read,
     * no messaging, but still a timer, so it runs only in pages that have used the provider: a page
     * that never asked has no provider state to invalidate and learns at its first request anyway.
     */
    const startContextWatch = () => {
      if (contextWatch !== undefined || bridgeClosed) return;
      contextWatch = setInterval(() => {
        if (!isOwner() || bridgeClosed) { clearInterval(contextWatch); return; }
        if (!isExtensionContextValid()) {
          clearInterval(contextWatch);
          closeBridge();
        }
      }, CONTEXT_WATCH_INTERVAL_MS);
    };

    // The page controls the payload. The background independently validates the
    // transport and derives the origin from the browser sender.
    const messageHandler = async (event: MessageEvent<unknown>) => {
      if (!isOwner() || event.source !== window || event.origin !== window.location.origin) return;
      const request = event.data;
      if (!isRecord(request) || request.target !== MESSAGE_TARGETS.CONTENT || request.type !== MESSAGE_TYPES.REQUEST) return;
      if (!(typeof request.id === 'string' && request.id.length <= 256)
        && !(typeof request.id === 'number' && Number.isSafeInteger(request.id))) return;
      const envelope: Envelope = { target: MESSAGE_TARGETS.INJECTED, type: MESSAGE_TYPES.RESPONSE, id: request.id };
      // Receipt, sent before anything that can wait: it is how the page tells a live bridge that is
      // waiting on the user from a dead one.
      window.postMessage({ target: MESSAGE_TARGETS.INJECTED, type: MESSAGE_TYPES.ACK, id: request.id }, window.location.origin);
      if (bridgeClosed || !isExtensionContextValid()) {
        window.postMessage({ ...envelope, error: reloadRequiredError() }, window.location.origin);
        closeBridge();
        return;
      }
      startContextWatch();
      const key = {};
      inFlight.set(key, envelope);
      try {
        if (!isRecord(request.data) || typeof request.data.method !== 'string') {
          throw new ProviderError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, 'Invalid request: method must be a string');
        }
        const { method, params } = request.data;
        if (params !== undefined && !Array.isArray(params)) {
          throw new ProviderError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, 'Invalid request: params must be an array');
        }
        const result = await getProviderServiceClient().handleRequest(window.location.origin, method, params);
        if (inFlight.delete(key)) window.postMessage({ ...envelope, data: { method, result } }, window.location.origin);
      } catch (error: unknown) {
        if (!isExtensionContextValid() || isContextInvalidatedError(error)) {
          closeBridge(); // answers this request with everything else in flight
          return;
        }
        if (inFlight.delete(key)) window.postMessage({ ...envelope, error: classifyProviderError(error) }, window.location.origin);
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
      if ((event as PageTransitionEvent).persisted) disconnectAllPorts();
    });

    // The window listener deliberately outlives the context: an orphaned script that stopped
    // listening would leave the page's requests unanswered, which is the hang this replaces.
    // WXT's own hand-off signal is a DOM event any page can forge, so it only counts when the
    // extension really is gone; a live hand-off is decided by `isOwner` above.
    ctx.onInvalidated(() => {
      if (!isExtensionContextValid()) closeBridge();
    });
  },
});
