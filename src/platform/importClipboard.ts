const CLIPBOARD_PERMISSIONS: chrome.permissions.Permissions = { permissions: ['clipboardRead', 'clipboardWrite'] };

function permissionsApi(): typeof chrome.permissions | undefined {
  return (globalThis as { chrome?: typeof chrome }).chrome?.permissions;
}

export async function hasImportClipboardAccess(): Promise<boolean> {
  try {
    return await permissionsApi()?.contains(CLIPBOARD_PERMISSIONS) === true;
  } catch {
    return false;
  }
}

/** Call directly from a user gesture so Chrome can show its optional permission prompt. */
export async function requestImportClipboardAccess(): Promise<boolean> {
  try {
    return await permissionsApi()?.request(CLIPBOARD_PERMISSIONS) === true;
  } catch {
    return false;
  }
}

/** Best effort: the clipboard API has no atomic compare-and-clear or history deletion. */
export async function clearImportedKeyFromClipboard(key: string): Promise<'cleared' | 'unchanged' | 'unavailable'> {
  try {
    if (!key.trim() || !await hasImportClipboardAccess()) return 'unavailable';
    const text = await navigator.clipboard.readText();
    if (text.trim() !== key.trim()) return 'unchanged';
    await navigator.clipboard.writeText('');
    return 'cleared';
  } catch {
    // Never expose clipboard contents or make a completed wallet import look like a failure.
    return 'unavailable';
  }
}
