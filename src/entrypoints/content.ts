import { defineContentScript, injectScript } from '#imports';

export default defineContentScript({
  matches: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*', 'file:///*'],
  async main(ctx) {
    // Set up message relay between page and background
    const messageHandler = async (event: MessageEvent) => {
      // Only accept messages from the same window
      if (event.source !== window) return;
      
      // Check for XCP wallet messages
      if (event.data?.target === 'xcp-wallet-content' && event.data?.type === 'XCP_WALLET_REQUEST') {
        try {
          let response: any;
          
          // Try to use MessageBus, fall back to chrome.runtime.sendMessage
          try {
            const { MessageBus } = await import('@/services/core/MessageBus');
            response = await MessageBus.send('provider-request', {
              type: 'PROVIDER_REQUEST',
              origin: window.location.origin,
              data: event.data.data,
              xcpWalletVersion: '2.0',
              timestamp: Date.now()
            }, 'background');
          } catch (importError) {
            // Fallback to direct chrome.runtime.sendMessage for test environments
            console.warn('MessageBus import failed, using fallback:', importError);
            response = await browser.runtime.sendMessage({
              type: 'PROVIDER_REQUEST',
              origin: window.location.origin,
              data: event.data.data,
              xcpWalletVersion: '2.0',
              timestamp: Date.now()
            });
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

    // Add message event listener
    window.addEventListener('message', messageHandler);

    // Listen for provider events from background
    const runtimeMessageHandler = (message: any): boolean => {
      if (message.type === 'PROVIDER_EVENT') {
        window.postMessage({
          target: 'xcp-wallet-injected',
          type: 'XCP_WALLET_EVENT',
          event: message.event,
          data: message.data
        }, window.location.origin);
        // Return true to indicate we handled the message
        return true;
      }
      // Return false if we didn't handle the message
      return false;
    };
    
    browser.runtime.onMessage.addListener(runtimeMessageHandler);

    try {
      await injectScript("/injected.js", {
        keepInDom: true,
      });
    } catch (error) {
      console.error('Failed to inject XCP Wallet provider:', error);
    }

    // Clean up event listeners when context is invalidated
    ctx.onInvalidated(() => {
      window.removeEventListener('message', messageHandler);
      browser.runtime.onMessage.removeListener(runtimeMessageHandler);
      console.log('XCP Wallet content script cleaned up.');
    });
  },
});
