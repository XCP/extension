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
 * Validates that a value has the expected SessionMetadata shape.
 * Returns the typed value if valid, null otherwise.
 */
function isValidSessionMetadata(value: unknown): value is SessionMetadata {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.unlockedAt === 'number' &&
    typeof obj.timeout === 'number' &&
    typeof obj.lastActiveTime === 'number'
  );
}

/**
 * Gets session metadata from session storage.
 * Returns null if no session exists or data is invalid.
 */
export async function getSessionMetadata(): Promise<SessionMetadata | null> {
  if (!chrome?.storage?.session) {
    return null;
  }

  try {
    const result = await chrome.storage.session.get(SESSION_METADATA_KEY);
    const value = result[SESSION_METADATA_KEY];
    if (!value) {
      return null;
    }
    // Validate shape before returning
    if (!isValidSessionMetadata(value)) {
      console.warn('Invalid session metadata shape in storage');
      return null;
    }
    return value;
  } catch (err) {
    console.error('Failed to get session metadata:', err);
    return null;
  }
}

/**
 * Stores session metadata in session storage.
 * Throws if session storage API is unavailable (per ADR-008: writes must throw).
 */
export async function setSessionMetadata(metadata: SessionMetadata): Promise<void> {
  if (!chrome?.storage?.session) {
    throw new Error('Session storage API unavailable');
  }

  try {
    await chrome.storage.session.set({ [SESSION_METADATA_KEY]: metadata });
  } catch (err) {
    console.error('Failed to save session metadata:', err);
    throw new Error('Failed to save session metadata');
  }
}

/**
 * Clears session metadata from session storage.
 * Throws if session storage API is unavailable (per ADR-008: writes must throw).
 */
export async function clearSessionMetadata(): Promise<void> {
  if (!chrome?.storage?.session) {
    throw new Error('Session storage API unavailable');
  }

  try {
    await chrome.storage.session.remove(SESSION_METADATA_KEY);
  } catch (err) {
    console.error('Failed to clear session metadata:', err);
    throw new Error('Failed to clear session metadata');
  }
}
