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
 * Simplified - just consume the error and optionally log it.
 *
 * @param callback - Optional callback function to wrap
 * @param logErrors - Whether to log errors (default: false)
 * @returns Wrapped callback that checks for errors
 */
export function wrapRuntimeCallback<T extends any[]>(
  callback?: (...args: T) => any,
  logErrors = false
): (...args: T) => any {
  return (...args: T) => {
    // Always check and consume lastError first
    const error = chrome.runtime?.lastError;

    if (error) {
      if (logErrors) {
        console.debug('Runtime error (handled):', error.message);
      }
      // Don't proceed if there was an error
      return;
    }

    // Call original callback only if no error
    return callback?.(...args);
  };
}

/**
 * Get ready tabs from background tracking
 * This is more efficient than pinging each tab
 */
function getReadyTabs(): Set<number> {
  // Try to import from background if available
  try {
    // We'll use messaging to query ready tabs from background
    // For now, maintain a local cache
    return new Set<number>();
  } catch {
    return new Set<number>();
  }
}

/**
 * Robust ping function to check if content script is available
 * Now also updates our ready tabs tracking
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
          // ALWAYS check lastError first
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
  
  // Use the safe wrapper for consistent error handling
  const sendToTab = sendMessageToTabSafe;
  
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
  
  // Direct send without checks using the safe wrapper
  return await sendMessageToTabSafe(tabId, message);
}

/**
 * Get list of tabs that can receive messages (have our content script)
 */
export async function listMessageableTabs(filter?: (tab: chrome.tabs.Tab) => boolean): Promise<chrome.tabs.Tab[]> {
  // Use chrome.tabs.query with URL patterns that match our content script
  const tabs = await chrome.tabs.query({
    url: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*']
  });
  
  // Filter out URLs where Chrome won't allow messaging or CS can't run
  const isAllowed = (tab: chrome.tabs.Tab): boolean => {
    const url = tab.url || '';
    if (!url || !tab.id) return false;
    
    // Exclude schemes Chrome won't message or we explicitly exclude
    return !/^((chrome|edge|brave|opera|vivaldi|about|devtools|view-source|chrome-extension|moz-extension):)/.test(url);
  };
  
  return tabs.filter(tab => isAllowed(tab) && (!filter || filter(tab)));
}

/**
 * Send message to specific tab with proper lastError checking
 * Updated to skip tabs without content scripts when possible
 */
export function sendMessageToTabSafe<T = any>(
  tabId: number,
  message: unknown,
  options?: chrome.tabs.MessageSendOptions
): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message as any, options, (response) => {
        // ALWAYS check lastError first to prevent console warnings
        const error = chrome.runtime.lastError;
        if (error) {
          // Common during startup/shutdown - silently return undefined
          // This prevents console spam for expected cases
          resolve(undefined);
        } else {
          resolve(response as T);
        }
      });
    } catch (error) {
      // Defensive: even catch block returns undefined instead of rejecting
      resolve(undefined);
    }
  });
}

/**
 * Ping a tab to check if content script is available
 */
export async function pingTab(tabId: number): Promise<boolean> {
  try {
    const response = await sendMessageToTabSafe(tabId, { 
      action: 'ping', 
      type: 'startup-health-check' 
    });
    return Boolean(response);
  } catch {
    return false;
  }
}

/**
 * Broadcast message to tabs with content script
 * Optimized to skip pinging and handle errors gracefully
 */
export async function broadcastToTabs(
  message: any,
  filter?: (tab: chrome.tabs.Tab) => boolean
): Promise<{ tabId: number; ok: boolean; error?: string }[]> {
  try {
    // Only get tabs where our content script can run
    const tabs = await listMessageableTabs(filter);
    const results: { tabId: number; ok: boolean; error?: string }[] = [];

    // Send to all tabs in parallel, let sendMessageToTabSafe handle errors
    const promises = tabs.map(async (tab) => {
      const tabId = tab.id!;
      try {
        const response = await sendMessageToTabSafe(tabId, message);
        if (response !== undefined) {
          return { tabId, ok: true };
        } else {
          // No response means no content script, but that's OK
          return { tabId, ok: false, error: 'no-receiver' };
        }
      } catch (error: any) {
        // This shouldn't happen with our safe wrapper, but just in case
        return { tabId, ok: false, error: String(error?.message || error) };
      }
    });

    return await Promise.all(promises);
  } catch (error) {
    console.debug('Error in broadcastToTabs:', error);
    return [];
  }
}

/**
 * Send a response-expecting message with timeout (simplified)
 * @deprecated Use safeSendMessage instead for better error handling
 */
export async function sendMessageWithTimeout(
  message: any,
  timeout: number = 5000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Message timeout after ${timeout}ms`));
    }, timeout);

    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timeoutId);

      // Check lastError first
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message || 'Unknown runtime error'));
      } else {
        resolve(response);
      }
    });
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

/**
 * Safe wrapper for browser.runtime.sendMessage with proper error handling
 * Use this instead of direct browser.runtime.sendMessage calls
 */
export async function safeSendMessage(message: any, options?: {
  timeout?: number;
  logErrors?: boolean;
  retries?: number;
  retryDelay?: number;
}): Promise<any> {
  const {
    timeout = 5000,
    logErrors = false,
    retries = 0,
    retryDelay = 100
  } = options || {};

  let lastErrorMessage: string | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await new Promise<any>((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(null); // Timeout - resolve null instead of rejecting
      }, timeout);

      try {
        chrome.runtime.sendMessage(message, (response) => {
          clearTimeout(timeoutId);

          // ALWAYS check lastError first
          const error = chrome.runtime.lastError;
          if (error) {
            lastErrorMessage = error.message || 'Unknown runtime error';
            if (logErrors && !error.message?.includes('Could not establish connection')) {
              console.debug(`[safeSendMessage] Runtime error (attempt ${attempt + 1}):`, error.message);
            }
            resolve(null); // Return null for any error
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        clearTimeout(timeoutId);
        lastErrorMessage = error instanceof Error ? error.message : String(error);
        if (logErrors) {
          console.debug(`[safeSendMessage] Send error (attempt ${attempt + 1}):`, error);
        }
        resolve(null);
      }
    });

    if (result !== null) {
      return result; // Success!
    }

    if (attempt < retries) {
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
    }
  }

  // All retries failed
  if (logErrors && lastErrorMessage) {
    console.debug('[safeSendMessage] All retries exhausted:', lastErrorMessage);
  }
  return null;
}

