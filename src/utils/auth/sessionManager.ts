// In-memory store for decrypted secrets (by wallet ID).
let unlockedSecrets: Record<string, string> = {};
let lastActiveTime: number = Date.now();

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
 * Overwrites the secret with zeros before removal for security.
 *
 * @param walletId - The wallet ID.
 */
export function clearUnlockedSecret(walletId: string): void {
  if (unlockedSecrets[walletId]) {
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
 * Updates the last active time to mark user activity.
 */
export function setLastActiveTime(): void {
  lastActiveTime = Date.now();
}

/**
 * Retrieves the last active time.
 *
 * @returns The timestamp of the last activity.
 */
export function getLastActiveTime(): number {
  return lastActiveTime;
}
