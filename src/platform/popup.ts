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

  return popupHandle(createdWindow.id);
}

function popupHandle(windowId: number): PopupWindow {
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
 * Query parameter on a window opened to unlock for a request that will continue in that same
 * window (a locked connect). The unlock screen then waits for the background to navigate it on
 * instead of going home. See `awaitsContinuation`.
 */
export const CONTINUES_PARAM = 'continues';

/** The path for an unlock window whose request continues in it; pass to `openExtensionPopup`. */
export function continuationUnlockPath(requestId: string): string {
  return `?${CONTINUES_PARAM}=${encodeURIComponent(requestId)}`;
}

/** True in a document opened by `continuationUnlockPath`. */
export function awaitsContinuation(search: string = globalThis.location?.search ?? ''): boolean {
  return new URLSearchParams(search).has(CONTINUES_PARAM);
}

/**
 * Point an extension window that is already open at another route, instead of opening a second
 * window. Used when a request had to wait for unlock: the window the user typed their password
 * into continues straight to the request's screen.
 *
 * The navigation always loads a new document. A change of fragment alone would be a same-document
 * navigation: the old app would keep running with whatever state and pending navigations it had
 * (the unlock screen's own "go home" among them) and could overwrite the new route. A fresh query
 * parameter makes the URL differ outside the fragment, so the browser discards that document.
 *
 * @param path - the fragment route to open, starting with `#`
 * @returns the reused window, or null when it is gone (closed, or no longer ours to navigate) —
 *   the caller then opens a new window as usual.
 */
export async function reusePopupWindow(windowId: number, path: string): Promise<PopupWindow | null> {
  try {
    const [tab] = await chrome.tabs.query({ windowId });
    if (tab?.id === undefined) return null;
    const baseUrl = chrome.runtime.getURL('popup.html');
    // The real guard is the window id: callers only pass ids returned by this extension's own
    // chrome.windows.create, so the window is one we opened. Without the "tabs" permission the
    // browser may not report tab.url at all; where it does, also refuse to navigate anything else.
    if (tab.url && !tab.url.startsWith(baseUrl)) return null;
    const reload = `?reuse=${encodeURIComponent(crypto.randomUUID())}`;
    await chrome.tabs.update(tab.id, { url: `${baseUrl}${reload}${path}`, active: true });
    await focusPopupWindow(windowId);
    return popupHandle(windowId);
  } catch {
    return null;
  }
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
