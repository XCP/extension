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
        console.debug('Content script sending message to background:', {
          type: 'PROVIDER_REQUEST',
          origin: window.location.origin,
          data: event.data.data,
          extensionId: browser.runtime.id
        });
        
        try {
          // Use MessageBus for standardized communication
          const { MessageBus } = await import('@/services/core/MessageBus');
          
          const response = await MessageBus.send('provider-request', {
            type: 'PROVIDER_REQUEST',
            origin: window.location.origin,
            data: event.data.data,
            xcpWalletVersion: '2.0',
            timestamp: Date.now()
          }, 'background');
          
          console.debug('Content script received response from background:', response);
          
          // Handle the response properly
          if (!response) {
            // No response from background
            window.postMessage({
              target: 'xcp-wallet-injected',
              type: 'XCP_WALLET_RESPONSE',
              id: event.data.id,
              error: {
                message: 'No response from extension background',
                code: -32603
              }
            }, window.location.origin);
          } else if (response.success) {
            // Successful response
            window.postMessage({
              target: 'xcp-wallet-injected',
              type: 'XCP_WALLET_RESPONSE',
              id: event.data.id,
              data: {
                method: response.method || event.data.data.method,
                result: response.result
              }
            }, window.location.origin);
          } else {
            // Error response
            window.postMessage({
              target: 'xcp-wallet-injected',
              type: 'XCP_WALLET_RESPONSE',
              id: event.data.id,
              error: response.error || {
                message: 'Unknown error',
                code: -32603
              }
            }, window.location.origin);
          }
        } catch (error) {
          // Send error back to page
          window.postMessage({
            target: 'xcp-wallet-injected',
            type: 'XCP_WALLET_RESPONSE',
            id: event.data.id,
            error: {
              message: (error as any).message || 'Unknown error',
              code: (error as any).code || -1
            }
          }, window.location.origin);
        }
      }
    };

    // Add message event listener
    window.addEventListener('message', messageHandler);

    // Listen for provider events from background
    const runtimeMessageHandler = (message: any) => {
      if (message.type === 'PROVIDER_EVENT') {
        window.postMessage({
          target: 'xcp-wallet-injected',
          type: 'XCP_WALLET_EVENT',
          event: message.event,
          data: message.data
        }, window.location.origin);
      }
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
