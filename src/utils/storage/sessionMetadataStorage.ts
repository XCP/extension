/**
 * Storage for session metadata.
 *
 * Session metadata tracks when the wallet was unlocked and timeout settings.
 * Stored in session storage (cleared on browser close).
 */

const SESSION_METADATA_KEY = 'sessionMetadata';

export interface SessionMetadata {
  unlockedAt: number;
  timeout: number;
  lastActiveTime: number;
}

/**
 * Gets session metadata from session storage.
 * Returns null if no session exists.
 */
export async function getSessionMetadata(): Promise<SessionMetadata | null> {
  if (!chrome?.storage?.session) {
    return null;
  }

  try {
    const result = await chrome.storage.session.get(SESSION_METADATA_KEY);
    return (result[SESSION_METADATA_KEY] as SessionMetadata) ?? null;
  } catch (err) {
    console.error('Failed to get session metadata:', err);
    return null;
  }
}

/**
 * Stores session metadata in session storage.
 */
export async function setSessionMetadata(metadata: SessionMetadata): Promise<void> {
  if (!chrome?.storage?.session) {
    return;
  }

  try {
    await chrome.storage.session.set({ [SESSION_METADATA_KEY]: metadata });
  } catch (err) {
    console.error('Failed to set session metadata:', err);
    throw new Error('Failed to store session metadata');
  }
}

/**
 * Clears session metadata from session storage.
 */
export async function clearSessionMetadata(): Promise<void> {
  if (!chrome?.storage?.session) {
    return;
  }

  try {
    await chrome.storage.session.remove(SESSION_METADATA_KEY);
  } catch (err) {
    console.error('Failed to clear session metadata:', err);
    throw new Error('Failed to clear session metadata');
  }
}
