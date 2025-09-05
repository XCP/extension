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
 * Simplified - with proper listeners, most connection errors should be resolved.
 * 
 * @param callback - Optional callback function to wrap
 * @param logErrors - Whether to log errors (default: false)
 * @returns Wrapped callback that checks for errors
 */
export function wrapRuntimeCallback<T extends any[]>(
  callback?: (...args: T) => any,
  logErrors = false
): (...args: T) => any {
  if (!callback) {
    return () => {
      // Just check and consume any error
      if (chrome.runtime?.lastError && logErrors) {
        console.debug('Runtime error (handled):', chrome.runtime.lastError.message);
      }
    };
  }
  
  return (...args: T) => {
    // Always check for errors first (marks as "checked")
    const error = chrome.runtime?.lastError;
    
    if (error) {
      if (logErrors) {
        console.debug('Runtime error (handled):', error.message);
      }
      // Don't call the original callback if there was an error
      return;
    }
    
    // Call original callback only if no error
    return callback(...args);
  };
}

/**
 * Robust ping function to check if content script is available
 */
export async function canReceiveMessages(tabId: number): Promise<boolean> {
  try {
    const response = await new Promise<any>((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('Ping timeout')), 200);
      
      chrome.tabs.sendMessage(
        tabId,
        { action: 'ping' },
        (response) => {
          clearTimeout(timeoutId);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });
    
    return Boolean(response?.status === 'ready' || response?.status === 'initializing');
  } catch (error) {
    // Ping failed - content script not available
    return false;
  }
}

/**
 * Robust tab messaging with ping-inject-retry pattern
 * Follows MV3 best practices for reliable content script communication
 */
export async function sendMessageToTab(
  tabId: number,
  message: any,
  options?: {
    maxRetries?: number;
    retryDelay?: number;
    skipReadinessCheck?: boolean;
    autoInject?: boolean;
  }
): Promise<any> {
  const { 
    maxRetries = 3, 
    retryDelay = 100, 
    skipReadinessCheck = false,
    autoInject = true 
  } = options || {};
  
  // Helper function to send message safely
  const sendToTab = (tabId: number, payload: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.sendMessage(tabId, payload, (response) => {
          if (chrome.runtime.lastError) {
            const error = new Error(chrome.runtime.lastError.message || 'Unknown runtime error');
            reject(error);
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  };
  
  // Ping-inject-retry pattern
  const ensureContentScriptAndSend = async (tabId: number, payload: any): Promise<any> => {
    try {
      return await sendToTab(tabId, payload);
    } catch (error: any) {
      const errorMsg = String(error?.message || error);
      const receivingEndMissing = 
        errorMsg.includes('Receiving end does not exist') ||
        errorMsg.includes('Could not establish connection');
      
      if (!receivingEndMissing || !autoInject) {
        throw error;
      }
      
      // Try to inject content script and retry
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['/content-scripts/content.js'] // WXT output path
        });
        
        // Small delay to let content script initialize
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Retry the message
        return await sendToTab(tabId, payload);
      } catch (injectError: any) {
        // Injection failed, probably restricted URL
        const errorMessage = injectError instanceof Error ? injectError.message : String(injectError);
        throw new Error(`Content script injection failed: ${errorMessage}`);
      }
    }
  };
  
  if (!skipReadinessCheck) {
    return await ensureContentScriptAndSend(tabId, message);
  }
  
  // Direct send without checks
  return await sendToTab(tabId, message);
}

/**
 * Broadcast message to all valid tabs with content script
 * Uses ping-inject-retry pattern for reliable delivery
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
        url.startsWith('http://127.0.0.1')
      );
      
      // Skip restricted URLs where injection fails
      const isRestrictedUrl = (
        url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('moz-extension://') ||
        url.includes('chrome.google.com/webstore') ||
        url.startsWith('about:')
      );
      
      if (!isValidUrl || isRestrictedUrl) return false;
      
      // Apply additional filter if provided
      if (filter) {
        return filter(tab);
      }
      
      return true;
    });
    
    // Send to all valid tabs with proper error handling
    const sendPromises = validTabs.map(tab => {
      if (!tab.id) return Promise.resolve();
      return sendMessageToTab(tab.id, message, { autoInject: true })
        .catch((error) => {
          // Log injection failures but don't throw
          console.debug(`Failed to send to tab ${tab.id}:`, error.message);
        });
    });
    
    await Promise.allSettled(sendPromises);
  } catch (error) {
    console.debug('Error broadcasting to tabs:', error);
  }
}

/**
 * Send a response-expecting message with timeout (simplified)
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
    
    // Safe response function that handles closed response channels
    const safeResponse = (responseData: any) => {
      try {
        sendResponse(responseData);
      } catch (error) {
        // Response channel closed, this is expected during rapid startup/shutdown
        console.debug('Response channel closed:', error);
      }
    };
    
    // Execute handler and send response
    handleMessage().then(safeResponse).catch((error) => {
      safeResponse({ error: error.message, handled: false });
    });
    
    // Return true to indicate async response
    return true;
  });
}

// Removed initializeEarlyErrorHandling() - no longer needed with proper top-level listeners
// The ping-inject-retry pattern and proper listener setup handle connection issues