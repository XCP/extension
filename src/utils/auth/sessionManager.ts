import { settingsManager, walletManager } from '@/utils/wallet';

// In-memory store for decrypted secrets (by wallet ID).
let unlockedSecrets: Record<string, string> = {};

// Auto-lock timer reference.
let idleTimer: ReturnType<typeof setTimeout> | null = null;

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
 * Resets the auto-lock timer based on the configured timeout.
 * When the timer elapses, clears secrets and triggers wallet locking via walletManager.
 */
export async function resetAutoLockTimer(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  const settings = await settingsManager.getSettings();
  const timeout = settings?.autoLockTimeout ?? 1 * 60 * 1000; // Fallback to 1 minute
  idleTimer = setTimeout(async () => {
    console.log('Auto-locking wallets due to inactivity');
    clearAllUnlockedSecrets();
    await walletManager.lockAllWallets(); // Trigger locking, which emits 'autoLock' via walletService
  }, timeout);
}

/**
 * Marks user activity to keep the session alive by resetting the auto-lock timer.
 */
export async function setLastActiveTime(): Promise<void> {
  await resetAutoLockTimer();
}
