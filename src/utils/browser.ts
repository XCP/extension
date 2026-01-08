/**
 * Browser Runtime Utilities
 *
 * Utility functions for Chrome tab messaging with proper error handling.
 */

/**
 * Message type for Chrome messaging APIs.
 * Chrome requires messages to be JSON-serializable, but we use a
 * permissive type here since strict typing would require all callers
 * to explicitly cast their message objects.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChromeMessage = Record<string, unknown> | unknown[] | string | number | boolean | null;

/**
 * Get list of tabs that can receive messages (have our content script)
 */
async function listMessageableTabs(filter?: (tab: chrome.tabs.Tab) => boolean): Promise<chrome.tabs.Tab[]> {
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
 * Send message to specific tab with proper lastError checking.
 * Returns undefined on error instead of throwing.
 */
function sendMessageToTabSafe<T = unknown>(
  tabId: number,
  message: ChromeMessage,
  options?: chrome.tabs.MessageSendOptions
): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, options, (response) => {
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
 * Safe wrapper for chrome.runtime.sendMessage with proper error handling.
 * Use this for popup/page -> background script communication.
 */
export async function safeSendMessage(message: ChromeMessage, options?: {
  timeout?: number;
  logErrors?: boolean;
}): Promise<unknown> {
  const { timeout = 5000, logErrors = false } = options || {};

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve(null);
    }, timeout);

    try {
      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timeoutId);

        // ALWAYS check lastError first
        const error = chrome.runtime.lastError;
        if (error) {
          if (logErrors && !error.message?.includes('Could not establish connection')) {
            console.debug('[safeSendMessage] Runtime error:', error.message);
          }
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (logErrors) {
        console.debug('[safeSendMessage] Send error:', error);
      }
      resolve(null);
    }
  });
}

/**
 * Broadcast message to tabs with content script.
 * Handles errors gracefully and returns results for each tab.
 */
export async function broadcastToTabs(
  message: ChromeMessage,
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
      } catch (error: unknown) {
        // This shouldn't happen with our safe wrapper, but just in case
        return { tabId, ok: false, error: String((error as Error)?.message || error) };
      }
    });

    return await Promise.all(promises);
  } catch (error) {
    console.debug('Error in broadcastToTabs:', error);
    return [];
  }
}
