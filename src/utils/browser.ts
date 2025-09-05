/**
 * Browser Runtime Utilities
 * 
 * Comprehensive utility functions for handling Chrome runtime API errors
 * and safe messaging patterns to prevent runtime.lastError issues.
 * Based on patterns used by MetaMask and UniSat wallet extensions.
 */

/**
 * Check for chrome.runtime.lastError and return it if present.
 * Simply accessing the error marks it as "checked" and prevents Chrome warnings.
 * 
 * @returns The error if present, undefined otherwise
 */
export function checkForLastError(): Error | undefined {
  const error = chrome.runtime?.lastError;
  if (error) {
    // Convert Chrome's lastError to a standard Error object
    return new Error(error.message || 'Unknown Chrome runtime error');
  }
  return undefined;
}

/**
 * Check for chrome.runtime.lastError and log a warning if present.
 * Use this in callbacks where you want to be notified of errors.
 * 
 * @returns The error if present, undefined otherwise
 */
export function checkForLastErrorAndWarn(): Error | undefined {
  const error = checkForLastError();
  if (error) {
    console.warn('Chrome runtime error:', error.message);
  }
  return error;
}

/**
 * Wrap a callback function to automatically check for chrome.runtime.lastError.
 * This prevents "Unchecked runtime.lastError" warnings while preserving callback functionality.
 * 
 * @param callback - Optional callback function to wrap
 * @param logErrors - Whether to log errors (default: false)
 * @returns Wrapped callback that checks for errors
 */
export function wrapRuntimeCallback<T extends any[]>(
  callback?: (...args: T) => any,
  logErrors = false
): (...args: T) => any {
  // If no callback provided, create one that just checks the error
  if (!callback) {
    return () => {
      // Just check and consume the error
      if (chrome.runtime?.lastError) {
        // Silently consume expected connection errors
        const message = chrome.runtime.lastError.message || '';
        if (!message.includes('Could not establish connection') && 
            !message.includes('Receiving end does not exist') &&
            logErrors) {
          console.warn('Chrome runtime error:', message);
        }
      }
    };
  }
  
  return (...args: T) => {
    // Always check for errors first (marks as "checked")
    const error = chrome.runtime?.lastError;
    
    if (error) {
      // Silently consume expected connection errors
      const message = error.message || '';
      if (!message.includes('Could not establish connection') && 
          !message.includes('Receiving end does not exist') &&
          logErrors) {
        console.warn('Chrome runtime error:', message);
      }
      // Don't call the original callback if there was an error
      return;
    }
    
    // Call original callback only if no error
    return callback(...args);
  };
}

/**
 * Check if a tab can receive messages (has our content script)
 */
export async function canReceiveMessages(tabId: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timeoutId = setTimeout(() => resolve(false), 100);
    
    chrome.tabs.sendMessage(
      tabId,
      { action: 'ping' },
      wrapRuntimeCallback((response) => {
        clearTimeout(timeoutId);
        resolve(response?.status === 'ready');
      })
    );
  });
}

/**
 * Send message to tab with retry logic and content script verification
 */
export async function sendMessageToTab(
  tabId: number,
  message: any,
  options?: {
    maxRetries?: number;
    retryDelay?: number;
    skipReadinessCheck?: boolean;
  }
): Promise<any> {
  const { maxRetries = 3, retryDelay = 100, skipReadinessCheck = false } = options || {};
  
  // Check if content script is ready (unless explicitly skipped)
  if (!skipReadinessCheck) {
    let isReady = false;
    for (let i = 0; i < maxRetries; i++) {
      isReady = await canReceiveMessages(tabId);
      if (isReady) break;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    if (!isReady) {
      // Content script not ready, return silently
      return null;
    }
  }
  
  // Send the actual message
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      message,
      wrapRuntimeCallback((response) => {
        resolve(response || null);
      })
    );
  });
}

/**
 * Broadcast message to all valid tabs with content script
 */
export async function broadcastToTabs(
  message: any,
  filter?: (tab: chrome.tabs.Tab) => boolean
): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    
    const validTabs = tabs.filter(tab => {
      // Must have URL and ID
      if (!tab.url || !tab.id) return false;
      
      // Check if URL matches our content script patterns
      const url = tab.url;
      const isValidUrl = (
        url.startsWith('https://') ||
        url.startsWith('http://localhost') ||
        url.startsWith('http://127.0.0.1') ||
        url.startsWith('file:///')
      );
      
      if (!isValidUrl) return false;
      
      // Apply additional filter if provided
      if (filter) {
        return filter(tab);
      }
      
      return true;
    });
    
    // Send to all valid tabs in parallel
    const sendPromises = validTabs.map(tab => {
      if (!tab.id) return Promise.resolve();
      return sendMessageToTab(tab.id, message).catch(() => {
        // Silently ignore failures for individual tabs
      });
    });
    
    await Promise.allSettled(sendPromises);
  } catch (error) {
    // Silently handle any errors in broadcasting
    console.debug('Error broadcasting to tabs:', error);
  }
}

/**
 * Send a response-expecting message with timeout
 */
export async function sendMessageWithTimeout(
  message: any,
  timeout: number = 5000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Message timeout after ${timeout}ms`));
    }, timeout);
    
    chrome.runtime.sendMessage(
      message,
      wrapRuntimeCallback((response) => {
        clearTimeout(timeoutId);
        
        const error = checkForLastError();
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      })
    );
  });
}

/**
 * Setup a message handler that always returns a response
 * This prevents the "listener indicated async response" error
 */
export function setupSafeMessageHandler(
  handler: (message: any, sender: chrome.runtime.MessageSender) => Promise<any> | any
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Wrap the handler to ensure we always send a response
    const handleMessage = async () => {
      try {
        const result = await handler(message, sender);
        return result !== undefined ? result : { handled: true };
      } catch (error) {
        console.error('Error in message handler:', error);
        return { 
          error: error instanceof Error ? error.message : 'Unknown error',
          handled: false 
        };
      }
    };
    
    // Execute handler and send response
    handleMessage().then(sendResponse).catch((error) => {
      sendResponse({ error: error.message, handled: false });
    });
    
    // Return true to indicate async response
    return true;
  });
}