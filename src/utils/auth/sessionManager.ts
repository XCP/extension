// In-memory store for decrypted secrets (by wallet ID).
let unlockedSecrets: Record<string, string> = {};
let lastActiveTime: number = Date.now();

// Session metadata interface
interface SessionMetadata {
  unlockedAt: number;
  timeout: number;
  lastActiveTime: number;
}

/**
 * Stores session metadata in chrome.storage.session
 * This survives popup close/open but not browser restart
 */
async function persistSessionMetadata(metadata: SessionMetadata): Promise<void> {
  // Check if chrome.storage.session is available
  if (chrome?.storage?.session) {
    await chrome.storage.session.set({ sessionMetadata: metadata });
  }
}

/**
 * Retrieves session metadata from chrome.storage.session
 */
async function getSessionMetadata(): Promise<SessionMetadata | null> {
  // Check if chrome.storage.session is available
  if (!chrome?.storage?.session) {
    return null;
  }
  const result = await chrome.storage.session.get('sessionMetadata');
  return result.sessionMetadata || null;
}

/**
 * Clears session metadata from storage
 */
async function clearSessionMetadata(): Promise<void> {
  // Check if chrome.storage.session is available
  if (chrome?.storage?.session) {
    await chrome.storage.session.remove('sessionMetadata');
  }
}

/**
 * Checks if the current session has expired based on stored metadata
 */
export async function isSessionExpired(): Promise<boolean> {
  const metadata = await getSessionMetadata();
  if (!metadata) {
    return true; // No session = expired
  }
  
  const now = Date.now();
  const elapsed = now - metadata.lastActiveTime;
  return elapsed > metadata.timeout;
}

/**
 * Initializes a new session when wallet is unlocked
 */
export async function initializeSession(timeout: number): Promise<void> {
  const now = Date.now();
  lastActiveTime = now;
  
  await persistSessionMetadata({
    unlockedAt: now,
    timeout,
    lastActiveTime: now
  });
}

/**
 * Stores a decrypted secret for a given wallet ID.
 *
 * @param walletId - The wallet ID.
 * @param secret - The decrypted secret.
 */
export function storeUnlockedSecret(walletId: string, secret: string): void {
  if (!walletId) {
    throw new Error('walletId is required');
  }
  if (secret === undefined || secret === null) {
    throw new Error('secret cannot be null or undefined');
  }
  // Allow empty strings as they may be valid secrets
  unlockedSecrets[walletId] = secret;
}

/**
 * Retrieves the decrypted secret for a given wallet ID.
 * Validates session hasn't expired before returning the secret.
 *
 * @param walletId - The wallet ID.
 * @returns The decrypted secret, or null if not stored or session expired.
 */
export async function getUnlockedSecret(walletId: string): Promise<string | null> {
  if (!walletId) {
    return null;
  }
  
  // Check if session has expired
  if (await isSessionExpired()) {
    // Session expired - clear all secrets
    await clearAllUnlockedSecrets();
    return null;
  }
  
  // Check if key exists to differentiate between undefined and empty string
  if (walletId in unlockedSecrets) {
    return unlockedSecrets[walletId];
  }
  return null;
}

/**
 * Clears the stored secret for a given wallet ID.
 * Overwrites the secret with zeros before removal for security.
 *
 * @param walletId - The wallet ID.
 */
export function clearUnlockedSecret(walletId: string): void {
  if (!walletId) {
    return;
  }
  if (walletId in unlockedSecrets) {
    // Overwrite with zeros for security (though JS may not guarantee this)
    const secretLength = unlockedSecrets[walletId].length;
    if (secretLength > 0) {
      unlockedSecrets[walletId] = '0'.repeat(secretLength);
    }
    delete unlockedSecrets[walletId];
  }
}

/**
 * Clears all stored unlocked secrets and session metadata.
 */
export async function clearAllUnlockedSecrets(): Promise<void> {
  Object.keys(unlockedSecrets).forEach((walletId) => clearUnlockedSecret(walletId));
  await clearSessionMetadata();
}

/**
 * Updates the last active time to mark user activity.
 * Also updates the persisted session metadata and reschedules the expiry alarm.
 */
export async function setLastActiveTime(): Promise<void> {
  lastActiveTime = Date.now();
  
  // Update persisted session metadata
  const metadata = await getSessionMetadata();
  if (metadata) {
    metadata.lastActiveTime = lastActiveTime;
    await persistSessionMetadata(metadata);
    
    // Reschedule the session expiry alarm to reset the countdown
    await rescheduleSessionExpiry(metadata.timeout);
  }
}

/**
 * Reschedules the session expiry alarm when user is active
 */
async function rescheduleSessionExpiry(timeout: number): Promise<void> {
  // Check if chrome.alarms is available
  if (!chrome?.alarms) {
    return; // Silently skip if alarms not available (e.g., in tests)
  }
  
  // Clear existing alarm
  await chrome.alarms.clear('session-expiry');
  
  // Create new alarm with fresh timeout from current moment
  await chrome.alarms.create('session-expiry', {
    when: Date.now() + timeout
  });
}

/**
 * Retrieves the last active time.
 *
 * @returns The timestamp of the last activity.
 */
export function getLastActiveTime(): number {
  return lastActiveTime;
}

/**
 * Session recovery states after service worker restart
 */
export enum SessionRecoveryState {
  LOCKED = 'LOCKED',               // No session or expired
  NEEDS_REAUTH = 'NEEDS_REAUTH',   // Valid session but secrets lost
  VALID = 'VALID'                  // Session valid and secrets present
}

/**
 * Checks session state on service worker startup.
 * Determines if session is still valid and if re-authentication is needed.
 */
export async function checkSessionRecovery(): Promise<SessionRecoveryState> {
  const metadata = await getSessionMetadata();
  
  // No session metadata = locked
  if (!metadata) {
    return SessionRecoveryState.LOCKED;
  }
  
  const now = Date.now();
  const elapsed = now - metadata.lastActiveTime;
  
  // Session expired = locked
  if (elapsed > metadata.timeout) {
    await clearSessionMetadata();
    return SessionRecoveryState.LOCKED;
  }
  
  // Session valid, check if we have secrets
  const hasSecrets = Object.keys(unlockedSecrets).length > 0;
  
  if (hasSecrets) {
    // Everything is fine
    return SessionRecoveryState.VALID;
  } else {
    // Session valid but secrets lost (service worker restarted)
    // This is where the auth modal should appear
    return SessionRecoveryState.NEEDS_REAUTH;
  }
}
