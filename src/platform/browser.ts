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
 * Every tab that has an id. Nothing here reads `tab.url`: without the `tabs` permission or a host
 * permission Chrome leaves it empty, so filtering on it dropped every tab. A receiver decides for
 * itself whether a message is meant for its page.
 */
async function listMessageableTabs(): Promise<chrome.tabs.Tab[]> {
  const tabs = await chrome.tabs.query({});
  return tabs.filter(tab => tab.id !== undefined);
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
    } catch (_error) {
      // Defensive: even catch block returns undefined instead of rejecting
      resolve(undefined);
    }
  });
}

/**
 * Broadcast message to tabs with content script.
 * Handles errors gracefully and returns results for each tab.
 */
export async function broadcastToTabs(
  message: ChromeMessage
): Promise<{ tabId: number; ok: boolean; error?: string }[]> {
  try {
    const tabs = await listMessageableTabs();
    const _results: { tabId: number; ok: boolean; error?: string }[] = [];

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
