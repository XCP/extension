/**
 * Session Manager - Handles in-memory secret storage and session lifecycle
 *
 * ## Architecture Decision Records
 *
 * ### ADR-001: JavaScript Memory Clearing Limitation (Acceptable)
 *
 * **Context**: When clearing secrets from memory, we overwrite with zeros before deletion.
 * However, JavaScript/V8 does not guarantee that the original string data is immediately
 * overwritten in memory. The JS engine may retain copies due to:
 * - String interning and immutability
 * - Garbage collector timing
 * - JIT compiler optimizations
 * - Memory page caching
 *
 * **Decision**: Accept this limitation with best-effort clearing.
 *
 * **Rationale**:
 * - This is a universal browser limitation affecting ALL browser-based wallets
 * - MetaMask, UniSat, Xverse, and other wallets face the same constraint
 * - True secure memory handling requires native code (e.g., libsodium)
 * - The threat model assumes a compromised browser is game-over regardless
 * - Defense in depth: session timeouts, auto-lock, and encrypted storage mitigate risk
 *
 * **Alternatives Considered**:
 * - WebAssembly with linear memory: Adds complexity, still subject to browser GC
 * - Native messaging host: Requires separate install, poor UX
 * - Accept and document: Chosen approach
 *
 * ### ADR-002: No Automatic Key Refresh During Session (Acceptable)
 *
 * **Context**: Some systems rotate encryption keys periodically during active sessions
 * to limit the window of exposure if a key is compromised.
 *
 * **Decision**: Do not implement automatic key refresh.
 *
 * **Rationale**:
 * - MetaMask and other major wallets do not implement this either
 * - Session timeouts (1-30 min configurable) already limit exposure window
 * - Key refresh requires re-prompting for password, degrading UX
 * - The primary threat (memory extraction) isn't mitigated by rotation
 * - Complexity cost outweighs marginal security benefit
 *
 * **Alternatives Considered**:
 * - Periodic re-encryption with same password: Adds complexity, minimal benefit
 * - Derived session keys with rotation: Over-engineered for use case
 * - Accept current design: Chosen approach
 */

import {
  validateWalletId,
  validateSecret,
  validateTimeout,
  validateSessionMetadata,
  checkRateLimit,
  clearRateLimit,
  clearAllRateLimits,
  checkSecretLimit,
} from '@/utils/validation/session';
import {
  getSessionMetadata,
  setSessionMetadata,
  clearSessionMetadata,
  type SessionMetadata,
} from '@/utils/storage/sessionMetadataStorage';

// In-memory store for decrypted secrets (by wallet ID).
let unlockedSecrets: Record<string, string> = {};
let lastActiveTime: number = Date.now();

/**
 * Maximum session duration (absolute timeout) regardless of activity.
 * Per OWASP Session Management Cheat Sheet: "All sessions should implement
 * an absolute timeout... closing and invalidating the session upon the
 * defined absolute period since the given session was initially created."
 *
 * 8 hours allows a full workday of use while ensuring daily re-authentication.
 */
export const MAX_SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours


/**
 * Persists session metadata after validation.
 */
async function persistSessionMetadata(metadata: SessionMetadata): Promise<void> {
  validateSessionMetadata(metadata);
  await setSessionMetadata(metadata);
}

/**
 * Checks if the current session has expired based on stored metadata.
 * Session expires if EITHER:
 * - Idle timeout exceeded (no activity within timeout period)
 * - Absolute timeout exceeded (session created too long ago)
 */
export async function isSessionExpired(): Promise<boolean> {
  const metadata = await getSessionMetadata();
  if (!metadata) {
    return true; // No session = expired
  }

  const now = Date.now();

  // Check idle timeout (time since last activity)
  const idleTime = now - metadata.lastActiveTime;
  if (idleTime > metadata.timeout) {
    return true;
  }

  // Check absolute timeout (time since session creation)
  const sessionDuration = now - metadata.unlockedAt;
  if (sessionDuration > MAX_SESSION_DURATION_MS) {
    return true;
  }

  return false;
}

/**
 * Initializes a new session when wallet is unlocked
 */
export async function initializeSession(timeout: number): Promise<void> {
  validateTimeout(timeout);
  
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
  // Validate inputs
  validateWalletId(walletId);
  validateSecret(secret);
  
  // Check rate limiting
  checkRateLimit(walletId);
  
  // Check total number of stored secrets to prevent memory exhaustion
  const currentSecretCount = Object.keys(unlockedSecrets).length;
  checkSecretLimit(currentSecretCount, walletId, unlockedSecrets);
  
  // Store the secret
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
  
  // Validate wallet ID format
  try {
    validateWalletId(walletId);
  } catch {
    // Invalid wallet ID format, return null instead of throwing
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
  
  // Validate wallet ID format
  try {
    validateWalletId(walletId);
  } catch {
    // Invalid wallet ID, silently return
    return;
  }
  
  if (walletId in unlockedSecrets) {
    // Best-effort memory clearing - see ADR-001 for JS memory limitation details
    const secretLength = unlockedSecrets[walletId].length;
    if (secretLength > 0) {
      unlockedSecrets[walletId] = '0'.repeat(secretLength);
    }
    delete unlockedSecrets[walletId];
    
    // Clean up rate limit entries for this wallet
    clearRateLimit(walletId);
  }
}

/**
 * Clears all stored unlocked secrets and session metadata.
 */
export async function clearAllUnlockedSecrets(): Promise<void> {
  Object.keys(unlockedSecrets).forEach((walletId) => clearUnlockedSecret(walletId));
  
  // Clear all rate limiting data
  clearAllRateLimits();
  
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
    await scheduleSessionExpiry(metadata.timeout);
  }
}

/**
 * Session expiry alarm name - single source of truth
 */
const SESSION_EXPIRY_ALARM = 'session-expiry';

/**
 * Schedules (or reschedules) the session expiry alarm.
 * This is the ONLY place that should create/clear this alarm.
 *
 * @param timeout - Time in milliseconds until session expires
 */
export async function scheduleSessionExpiry(timeout: number): Promise<void> {
  // Check if chrome.alarms is available
  if (!chrome?.alarms) {
    return; // Silently skip if alarms not available (e.g., in tests)
  }

  // Clear existing alarm
  await chrome.alarms.clear(SESSION_EXPIRY_ALARM);

  // Create new alarm with fresh timeout from current moment
  await chrome.alarms.create(SESSION_EXPIRY_ALARM, {
    when: Date.now() + timeout
  });
}

/**
 * Clears the session expiry alarm (e.g., when locking all wallets).
 * This is the ONLY place that should clear this alarm.
 */
export async function clearSessionExpiry(): Promise<void> {
  if (!chrome?.alarms) {
    return;
  }
  await chrome.alarms.clear(SESSION_EXPIRY_ALARM);
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

  // Check idle timeout (time since last activity)
  const idleTime = now - metadata.lastActiveTime;
  if (idleTime > metadata.timeout) {
    await clearSessionMetadata();
    return SessionRecoveryState.LOCKED;
  }

  // Check absolute timeout (time since session creation)
  const sessionDuration = now - metadata.unlockedAt;
  if (sessionDuration > MAX_SESSION_DURATION_MS) {
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
