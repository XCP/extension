/**
 * Popup Window Utilities
 *
 * Creates approval popup windows for dApp requests.
 * Always uses a separate window (not chrome.action.openPopup)
 * for consistent, predictable behavior.
 */

/**
 * Default popup window dimensions
 * These are OUTER window dimensions including window chrome (title bar, borders).
 * Content area will be smaller (~14px less on Windows).
 * The HTML uses min-width: 350px, so we add padding to ensure content fits.
 */
const POPUP_WIDTH = 366;
const POPUP_HEIGHT = 632;

/**
 * Result of opening a popup window
 */
export interface PopupWindow {
  id: number;
  close: () => Promise<void>;
}

/**
 * Opens a popup window centered on screen.
 *
 * @param path - Path/hash to append to popup.html (e.g., '#/approve?id=123')
 * @returns PopupWindow with id and close function
 *
 * @example
 * const popup = await openPopupWindow('#/approve?requestId=abc123');
 * // Later, to close:
 * await popup.close();
 */
export async function openPopupWindow(path: string): Promise<PopupWindow> {
  // Get current window to calculate center position
  const currentWindow = await chrome.windows.getCurrent();

  // Calculate centered position
  let top: number | undefined;
  let left: number | undefined;

  if (currentWindow.width && currentWindow.height &&
      currentWindow.top !== undefined && currentWindow.left !== undefined) {
    // Center relative to current browser window
    left = Math.round(currentWindow.left + (currentWindow.width - POPUP_WIDTH) / 2);
    top = Math.round(currentWindow.top + (currentWindow.height - POPUP_HEIGHT) / 2);
  } else {
    // Fallback: try to center on screen
    // screen dimensions aren't available in service worker, so we estimate
    left = 100;
    top = 100;
  }

  const baseUrl = chrome.runtime.getURL('popup.html');
  const url = `${baseUrl}${path}`;

  const createdWindow = await chrome.windows.create({
    url,
    type: 'popup',
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    top,
    left,
    focused: true,
  });

  if (!createdWindow?.id) {
    throw new Error('Failed to create popup window');
  }

  const windowId = createdWindow.id;

  return {
    id: windowId,
    close: async () => {
      try {
        await chrome.windows.remove(windowId);
      } catch {
        // Window may already be closed
      }
    },
  };
}

/**
 * Focus an existing popup window
 */
export async function focusPopupWindow(windowId: number): Promise<void> {
  try {
    await chrome.windows.update(windowId, { focused: true });
  } catch {
    // Window may not exist anymore
  }
}

/**
 * Opens the extension popup at an optional path.
 * Used by provider flows for unlock, sign message, etc.
 *
 * @param path - Optional path/hash to open (e.g., '#/actions/sign-message?id=123')
 * @returns PopupWindow with id and close function
 */
export async function openExtensionPopup(path: string = ''): Promise<PopupWindow> {
  return openPopupWindow(path);
}
