import { defineContentScript, injectScript } from '#imports';

export default defineContentScript({
  matches: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
  // Note: excludeMatches only supports http(s) schemes, not chrome:// or about:
  // The browser automatically excludes restricted schemes
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
    } catch (e) {
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
      const msg = message as { type?: string; action?: string; event?: string; data?: unknown } | undefined;

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
            target: 'xcp-wallet-injected',
            type: 'XCP_WALLET_EVENT',
            event: msg.event,
            data: msg.data
          }, window.location.origin);
          sendResponse({ received: true, event: msg.event });
        } catch (error) {
          console.error('Failed to post provider event:', error);
          sendResponse({ received: false, error: 'Failed to relay event' });
        }
        return true; // Keep channel open for async response
      }

      // Default response for unknown messages
      sendResponse({ handled: false });
      return true; // Always return true to indicate async response
    };

    // Register the runtime message handler IMMEDIATELY
    browser.runtime.onMessage.addListener(runtimeMessageHandler);

    // Set up message relay between page and background
    const messageHandler = async (event: MessageEvent) => {
      // Security: Validate message source AND origin
      // - event.source !== window: Reject messages from iframes/other windows
      // - event.origin check: Reject messages from different origins (defense-in-depth)
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;

      // Check for XCP wallet messages
      if (event.data?.target === 'xcp-wallet-content' && event.data?.type === 'XCP_WALLET_REQUEST') {
        try {
          let response: any;
          
          // Use Proxy Pattern (same as popup) with retry logic for service worker
          try {
            const { getProviderService } = await import('@/services/providerService');
            const providerService = getProviderService();

            // The provider service expects method and params from the request
            const { method, params } = event.data.data;
            const result = await providerService.handleRequest(
              window.location.origin,
              method,
              params
            );

            // Format response to match expected structure
            response = {
              success: true,
              method,
              result
            };
          } catch (error: any) {
            console.debug('Provider service request failed:', error);
            // Format error response
            response = {
              success: false,
              error: {
                message: error?.message || 'Provider service request failed',
                code: error?.code || -32603
              }
            };
          }
          
          // Handle the response properly
          if (!response) {
            // No response from background
            window.postMessage({
              target: 'xcp-wallet-injected',
              type: 'XCP_WALLET_RESPONSE',
              id: event.data.id,
              error: {
                message: 'No response from extension background',
                code: -32603 // Internal JSON-RPC error
              }
            }, window.location.origin);
          } else if (response?.success) {
            // Successful response
            window.postMessage({
              target: 'xcp-wallet-injected',
              type: 'XCP_WALLET_RESPONSE',
              id: event.data.id,
              data: {
                method: response?.method || event.data.data.method,
                result: response?.result
              }
            }, window.location.origin);
          } else {
            // Error response
            window.postMessage({
              target: 'xcp-wallet-injected',
              type: 'XCP_WALLET_RESPONSE',
              id: event.data.id,
              error: response?.error || {
                message: 'Unknown error',
                code: -32603 // Internal JSON-RPC error
              }
            }, window.location.origin);
          }
        } catch (error) {
          console.error('Content script error handling provider request:', error);
          // Send error back to page
          const errorMessage = error instanceof Error ? error.message : 'Unknown error in content script';

          window.postMessage({
            target: 'xcp-wallet-injected',
            type: 'XCP_WALLET_RESPONSE',
            id: event.data.id,
            error: {
              message: errorMessage,
              code: error && typeof error === 'object' && 'code' in error ? (error as any).code : -32603
            }
          }, window.location.origin);
        }
      }
    };

    // Add message event listeners
    if (messageHandler) {
      window.addEventListener('message', messageHandler);
    }


    console.log('XCP Wallet content script loaded on:', window.location.href);

    try {
      await injectScript("/injected.js", {
        keepInDom: true,
      });
    } catch (error) {
      console.error('Failed to inject XCP Wallet provider:', error);
    }

    // Clean up event listeners when context is invalidated
    ctx.onInvalidated(() => {
      try {
        window.removeEventListener('message', messageHandler);
      } catch (error) {
        console.debug('Failed to remove window message listener:', error);
      }

      try {
        browser.runtime.onMessage.removeListener(runtimeMessageHandler);
      } catch (error) {
        console.debug('Failed to remove runtime message listener:', error);
      }

      console.log('XCP Wallet content script cleaned up.');
    });
  },
});
