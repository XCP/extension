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
  return (...args: T) => {
    // Always check for errors first (marks as "checked")
    const error = logErrors ? checkForLastErrorAndWarn() : checkForLastError();
    
    // Call original callback if provided and no error occurred
    if (callback && !error) {
      return callback(...args);
    }
  };
}