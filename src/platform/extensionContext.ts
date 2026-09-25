/** Detecting a script that has outlived its extension. */

/**
 * Whether this script still belongs to a live extension. A content script outlives the extension
 * that injected it: after a reload or update Chrome clears `runtime.id` and every extension API
 * call throws "Extension context invalidated".
 */
export function isExtensionContextValid(): boolean {
  try {
    return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

export function isContextInvalidatedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /extension context invalidated/i.test(message);
}
