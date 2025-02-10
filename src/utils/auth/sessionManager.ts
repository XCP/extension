const AUTO_LOCK_TIMEOUT = 15 * 60 * 1000; // 15 minutes

// In-memory store for decrypted secrets (by wallet ID).
let unlockedSecrets: Record<string, string> = {};

// Auto-lock timer reference.
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Optional callback invoked when auto-lock occurs.
 */
export let onAutoLock: (() => void) | undefined = undefined;

export function setOnAutoLock(callback: (() => void) | undefined): void {
  onAutoLock = callback;
}

/**
 * Stores a decrypted secret for a given wallet ID.
 *
 * @param walletId - The wallet ID.
 * @param secret - The decrypted secret.
 */
export function storeUnlockedSecret(walletId: string, secret: string): void {
  unlockedSecrets[walletId] = secret;
}

/**
 * Retrieves the decrypted secret for a given wallet ID.
 *
 * @param walletId - The wallet ID.
 * @returns The decrypted secret, or null if not stored.
 */
export function getUnlockedSecret(walletId: string): string | null {
  return unlockedSecrets[walletId] || null;
}

/**
 * Clears the stored secret for a given wallet ID.
 *
 * Overwrites the secret with zeros before removal for security.
 *
 * @param walletId - The wallet ID.
 */
export function clearUnlockedSecret(walletId: string): void {
  if (unlockedSecrets[walletId]) {
    // Overwrite with zeros (preserving length) before deletion.
    unlockedSecrets[walletId] = '0'.repeat(unlockedSecrets[walletId].length);
    delete unlockedSecrets[walletId];
  }
}

/**
 * Clears all stored unlocked secrets.
 */
export function clearAllUnlockedSecrets(): void {
  Object.keys(unlockedSecrets).forEach((walletId) => clearUnlockedSecret(walletId));
}

/**
 * Resets the auto-lock timer. When the timer elapses,
 * all unlocked secrets are cleared and the onAutoLock callback is invoked.
 */
export function resetAutoLockTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(() => {
    console.log('Auto-locking wallets due to inactivity');
    clearAllUnlockedSecrets();
    if (onAutoLock) {
      onAutoLock();
    }
  }, AUTO_LOCK_TIMEOUT);
}

/**
 * Marks user activity to keep the session alive by resetting the auto-lock timer.
 */
export function setLastActiveTime(): void {
  resetAutoLockTimer();
}
