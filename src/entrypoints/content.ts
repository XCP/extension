import { defineContentScript, injectScript } from '#imports';

export default defineContentScript({
  matches: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
  // Note: excludeMatches only supports http(s) schemes, not chrome:// or about:
  // The browser automatically excludes restricted schemes
  async main(ctx) {
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
    const runtimeMessageHandler = (message: any, sender: any, sendResponse: any) => {
      // ALWAYS check lastError first to consume any errors
      if (chrome.runtime?.lastError) {
        // Error consumed - prevents "Unchecked runtime.lastError" spam
      }

      // Handle startup health checks
      if (message?.type === 'startup-health-check' || message?.action === 'ping') {
        sendResponse({ status: 'ready', timestamp: Date.now(), context: 'content-script' });
        return true; // Keep channel open for async response
      }

      // Handle provider events (accountsChanged, disconnect, etc.)
      if (message?.type === 'PROVIDER_EVENT') {
        try {
          // Relay event to injected script via window.postMessage
          window.postMessage({
            target: 'xcp-wallet-injected',
            type: 'XCP_WALLET_EVENT',
            event: message.event,
            data: message.data
          }, window.location.origin);
          sendResponse({ received: true, event: message.event });
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
      // Only accept messages from the same window
      if (event.source !== window) return;
      
      // Check for XCP wallet messages
      if (event.data?.target === 'xcp-wallet-content' && event.data?.type === 'XCP_WALLET_REQUEST') {
        try {
          let response: any;
          
          // Use MessageBus with simplified error handling (background has proper listeners now)
          try {
            const { MessageBus } = await import('@/services/core/MessageBus');
            response = await MessageBus.send('provider-request', {
              type: 'PROVIDER_REQUEST',
              origin: window.location.origin,
              data: event.data.data,
              xcpWalletVersion: '2.0',
              timestamp: Date.now()
            }, 'background');
          } catch (error) {
            console.debug('MessageBus request failed:', error);
            response = null;
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
          
          // Special handling for fingerprint errors (from minified webext-bridge code)
          const finalErrorMessage = errorMessage.includes('fingerprint') 
            ? 'Extension services not available. Please try reloading the extension.'
            : errorMessage;
          
          window.postMessage({
            target: 'xcp-wallet-injected',
            type: 'XCP_WALLET_RESPONSE',
            id: event.data.id,
            error: {
              message: finalErrorMessage,
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
