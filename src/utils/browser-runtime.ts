/**
 * Browser Runtime Utilities
 * 
 * Utility functions for handling Chrome runtime API errors and callbacks.
 * Based on patterns used by MetaMask and other major wallet extensions.
 * 
 * Chrome requires that callbacks to async APIs must check chrome.runtime.lastError
 * when an error occurs. If not checked, Chrome throws an "Unchecked runtime.lastError" warning.
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
 * Check for chrome.runtime.lastError and log an error if present.
 * Use this in callbacks where errors are unexpected and should be logged.
 * 
 * @returns The error if present, undefined otherwise
 */
export function checkForLastErrorAndLog(): Error | undefined {
  const error = checkForLastError();
  if (error) {
    console.error('Chrome runtime error:', error.message);
  }
  return error;
}

/**
 * Silently check for chrome.runtime.lastError without logging.
 * Use this in callbacks where errors are expected and should be ignored.
 * 
 * @returns The error if present, undefined otherwise
 */
export function checkForLastErrorSilently(): Error | undefined {
  return checkForLastError();
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
  return (...args: T) => {
    // Always check for errors first (marks as "checked")
    const error = logErrors ? checkForLastErrorAndWarn() : checkForLastError();
    
    // Call original callback if provided and no error occurred
    if (callback && !error) {
      return callback(...args);
    }
  };
}

/**
 * Send a message using chrome.tabs.sendMessage with automatic error checking.
 * This wrapper ensures chrome.runtime.lastError is always checked.
 * 
 * @param tabId - The tab ID to send the message to
 * @param message - The message to send
 * @param options - Optional message options
 * @returns Promise that resolves with the response or rejects with error
 */
export function safeSendTabMessage<T = any>(
  tabId: number,
  message: any,
  options?: chrome.tabs.MessageSendOptions
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, options, (response: T) => {
      const error = checkForLastError();
      if (error) {
        // Expected errors (no content script, tab closed, etc.) - resolve with undefined
        resolve(undefined as T);
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Send a message using chrome.runtime.sendMessage with automatic error checking.
 * This wrapper ensures chrome.runtime.lastError is always checked.
 * 
 * @param message - The message to send
 * @param options - Optional message options
 * @returns Promise that resolves with the response or rejects with error
 */
export function safeSendRuntimeMessage<T = any>(
  message: any,
  options?: chrome.runtime.MessageOptions
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, options, (response: T) => {
      const error = checkForLastError();
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Query tabs with automatic error checking.
 * 
 * @param queryInfo - The query parameters
 * @returns Promise that resolves with matching tabs
 */
export function safeQueryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      checkForLastError(); // Just check, don't fail
      resolve(tabs || []);
    });
  });
}

/**
 * Create a connection to another context with automatic error checking.
 * 
 * @param connectInfo - Connection information
 * @returns Port object or undefined if connection failed
 */
export function safeConnect(connectInfo?: chrome.runtime.ConnectInfo): chrome.runtime.Port | undefined {
  try {
    const port = chrome.runtime.connect(connectInfo);
    
    // Add error checking to disconnect listener
    const originalOnDisconnect = port.onDisconnect;
    port.onDisconnect.addListener(() => {
      checkForLastError(); // Check error on disconnect
    });
    
    return port;
  } catch (error) {
    console.warn('Failed to create connection:', error);
    return undefined;
  }
}

/**
 * Storage operations with automatic error checking
 */
export const safeStorage = {
  /**
   * Get items from storage with error checking
   */
  async get(keys?: string | string[] | null): Promise<{ [key: string]: any }> {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys || null, (items) => {
        checkForLastError();
        resolve(items || {});
      });
    });
  },
  
  /**
   * Set items in storage with error checking
   */
  async set(items: { [key: string]: any }): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(items, () => {
        const error = checkForLastError();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  },
  
  /**
   * Remove items from storage with error checking
   */
  async remove(keys: string | string[]): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.remove(keys, () => {
        checkForLastError();
        resolve();
      });
    });
  },
  
  /**
   * Clear all storage with error checking
   */
  async clear(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.clear(() => {
        checkForLastError();
        resolve();
      });
    });
  }
};

/**
 * Check if we're running in a Manifest V3 environment
 */
export function isManifestV3(): boolean {
  return chrome.runtime.getManifest().manifest_version === 3;
}

/**
 * Helper to handle port disconnections with error checking
 */
export function onPortDisconnect(port: chrome.runtime.Port, callback?: (error?: Error) => void): void {
  port.onDisconnect.addListener(() => {
    const error = checkForLastError();
    if (callback) {
      callback(error);
    }
  });
}