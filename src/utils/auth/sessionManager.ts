// In-memory store for decrypted secrets (by wallet ID).
let unlockedSecrets: Record<string, string> = {};
let lastActiveTime: number = Date.now();

// Constants for validation and security
const MAX_WALLET_ID_LENGTH = 128; // SHA-256 produces 64 chars, allow some buffer
const MAX_SECRET_LENGTH = 1024; // Private keys are ~64 chars, mnemonics ~200 chars max
const MAX_STORED_SECRETS = 100; // Prevent memory exhaustion
const MIN_TIMEOUT_MS = 60000; // 1 minute minimum
const MAX_TIMEOUT_MS = 86400000; // 24 hours maximum
const WALLET_ID_REGEX = /^[a-f0-9]{64}$/; // SHA-256 hash format

// Rate limiting for secret storage operations
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute window
const MAX_OPERATIONS_PER_WINDOW = 10;

// Session metadata interface
interface SessionMetadata {
  unlockedAt: number;
  timeout: number;
  lastActiveTime: number;
}

/**
 * Validates wallet ID format and length
 */
function validateWalletId(walletId: string): void {
  if (!walletId) {
    throw new Error('Wallet ID is required');
  }
  if (typeof walletId !== 'string') {
    throw new Error('Wallet ID must be a string');
  }
  if (walletId.length > MAX_WALLET_ID_LENGTH) {
    throw new Error(`Wallet ID exceeds maximum length of ${MAX_WALLET_ID_LENGTH}`);
  }
  if (!WALLET_ID_REGEX.test(walletId)) {
    throw new Error('Invalid wallet ID format. Expected SHA-256 hash');
  }
}

/**
 * Validates secret format and length
 */
function validateSecret(secret: string): void {
  if (secret === undefined || secret === null) {
    throw new Error('Secret cannot be null or undefined');
  }
  if (typeof secret !== 'string') {
    throw new Error('Secret must be a string');
  }
  if (secret.length > MAX_SECRET_LENGTH) {
    throw new Error(`Secret exceeds maximum length of ${MAX_SECRET_LENGTH}`);
  }
}

/**
 * Validates timeout value
 */
function validateTimeout(timeout: number): void {
  if (typeof timeout !== 'number' || isNaN(timeout)) {
    throw new Error('Timeout must be a valid number');
  }
  if (timeout < MIN_TIMEOUT_MS) {
    throw new Error(`Timeout must be at least ${MIN_TIMEOUT_MS}ms`);
  }
  if (timeout > MAX_TIMEOUT_MS) {
    throw new Error(`Timeout cannot exceed ${MAX_TIMEOUT_MS}ms`);
  }
}

/**
 * Checks if an operation is rate limited
 */
function checkRateLimit(walletId: string): void {
  const now = Date.now();
  const operations = rateLimitMap.get(walletId) || [];
  
  // Clean up old entries outside the window
  const recentOperations = operations.filter(
    timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS
  );
  
  if (recentOperations.length >= MAX_OPERATIONS_PER_WINDOW) {
    throw new Error('Rate limit exceeded for secret storage operations');
  }
  
  // Add current operation
  recentOperations.push(now);
  rateLimitMap.set(walletId, recentOperations);
  
  // Clean up rate limit map if it gets too large
  if (rateLimitMap.size > 1000) {
    // Remove oldest entries
    const entries = Array.from(rateLimitMap.entries());
    entries.sort((a, b) => Math.max(...a[1]) - Math.max(...b[1]));
    entries.slice(0, 500).forEach(([key]) => rateLimitMap.delete(key));
  }
}

/**
 * Stores session metadata in chrome.storage.session
 * This survives popup close/open but not browser restart
 */
async function persistSessionMetadata(metadata: SessionMetadata): Promise<void> {
  // Validate metadata before persisting
  if (!metadata || typeof metadata !== 'object') {
    throw new Error('Invalid session metadata');
  }
  if (typeof metadata.unlockedAt !== 'number' || metadata.unlockedAt <= 0) {
    throw new Error('Invalid unlockedAt timestamp');
  }
  if (typeof metadata.lastActiveTime !== 'number' || metadata.lastActiveTime <= 0) {
    throw new Error('Invalid lastActiveTime timestamp');
  }
  validateTimeout(metadata.timeout);
  
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
  if (currentSecretCount >= MAX_STORED_SECRETS && !(walletId in unlockedSecrets)) {
    throw new Error(`Cannot store more than ${MAX_STORED_SECRETS} secrets`);
  }
  
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
    // Overwrite with zeros for security (though JS may not guarantee this)
    const secretLength = unlockedSecrets[walletId].length;
    if (secretLength > 0) {
      unlockedSecrets[walletId] = '0'.repeat(secretLength);
    }
    delete unlockedSecrets[walletId];
    
    // Clean up rate limit entries for this wallet
    rateLimitMap.delete(walletId);
  }
}

/**
 * Clears all stored unlocked secrets and session metadata.
 */
export async function clearAllUnlockedSecrets(): Promise<void> {
  Object.keys(unlockedSecrets).forEach((walletId) => clearUnlockedSecret(walletId));
  
  // Clear all rate limiting data
  rateLimitMap.clear();
  
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
