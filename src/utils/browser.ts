/**
 * Browser Runtime Utilities
 * 
 * Minimal utility functions for handling Chrome runtime API errors.
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