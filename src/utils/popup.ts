/**
 * Popup Window Utilities
 *
 * Handles opening extension popups with proper fallback handling.
 * Chrome's `chrome.action.openPopup()` doesn't work in all contexts,
 * so we fall back to `chrome.windows.create()` when needed.
 */

/**
 * Default popup window dimensions
 */
const POPUP_WIDTH = 400;
const POPUP_HEIGHT = 600;

/**
 * Opens the extension popup, with fallback to creating a new window.
 *
 * Tries `chrome.action.openPopup()` first (native popup behavior).
 * Falls back to `chrome.windows.create()` if that fails.
 *
 * @param path - Optional path/hash to append to popup.html (e.g., '#/settings' or '#/sign?id=123')
 * @returns Promise that resolves when popup is opened
 *
 * @example
 * // Open default popup
 * await openExtensionPopup();
 *
 * @example
 * // Open popup to specific route
 * await openExtensionPopup('#/actions/sign-message?requestId=123');
 */
export async function openExtensionPopup(path?: string): Promise<void> {
  // If no path specified, try native popup first
  if (!path) {
    try {
      await chrome.action.openPopup();
      return;
    } catch {
      // Fallback to window.create below
    }
  }

  // Create popup window (either as fallback or when path is specified)
  const baseUrl = chrome.runtime.getURL('popup.html');
  const url = path ? `${baseUrl}${path}` : baseUrl;

  await chrome.windows.create({
    url,
    type: 'popup',
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    focused: true,
  });
}
