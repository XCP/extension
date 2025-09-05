import { defineContentScript, injectScript } from '#imports';

export default defineContentScript({
  matches: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
  // Note: excludeMatches only supports http(s) schemes, not chrome:// or about:
  // The browser automatically excludes restricted schemes
  async main(ctx) {
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

    // Listen for provider events from background
    // Important: We need to handle messages but not interfere with the injected script loading
    const runtimeMessageHandler = (message: any, sender: any, sendResponse: any) => {
      // Always send a response to prevent runtime.lastError
      const safeResponse = (responseData: any) => {
        try {
          sendResponse(responseData);
        } catch (error) {
          // Silently handle cases where response channel is closed
          console.debug('Failed to send response, channel may be closed:', error);
        }
      };
      
      // Handle startup health checks
      if (message?.type === 'startup-health-check' || message?.action === 'ping') {
        safeResponse({ status: 'ready', timestamp: Date.now(), context: 'content-script' });
        return true;
      }
      
      // Handle provider events
      if (message?.type === 'PROVIDER_EVENT') {
        try {
          window.postMessage({
            target: 'xcp-wallet-injected',
            type: 'XCP_WALLET_EVENT',
            event: message.event,
            data: message.data
          }, window.location.origin);
          safeResponse({ received: true, event: message.event });
        } catch (error) {
          console.error('Failed to post provider event:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          safeResponse({ received: false, error: errorMessage });
        }
        return true;
      }
      
      // For other messages, send acknowledgment to prevent runtime errors
      safeResponse({ handled: false, reason: 'Unknown message type' });
      return true; // Always indicate we will respond
    };
    
    if (runtimeMessageHandler) {
      browser.runtime.onMessage.addListener(runtimeMessageHandler);
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
