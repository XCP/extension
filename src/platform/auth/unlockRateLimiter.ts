/**
 * Rate limiter for password attempts (unlock and verifyPassword).
 *
 * Backed by chrome.storage.session so the failure window survives service
 * worker restarts, which reset any in-memory counter. Storage read failures
 * fail open: the limiter is defense in depth on top of the ~1s PBKDF2 cost
 * per guess, and failing closed would block unlock on a storage error.
 */

import { storage } from '#imports';

const MAX_ATTEMPTS_PER_WINDOW = 5;
const WINDOW_MS = 60_000;

const failedAttemptsItem = storage.defineItem<number[]>('session:failedUnlockAttempts', {
  fallback: [],
});

async function readRecentAttempts(now: number): Promise<number[]> {
  try {
    const attempts = await failedAttemptsItem.getValue();
    return attempts.filter((timestamp) => now - timestamp < WINDOW_MS);
  } catch {
    return [];
  }
}

/**
 * Throws when too many failed password attempts occurred within the window.
 * Call before performing key derivation.
 */
export async function assertUnlockAllowed(): Promise<void> {
  const now = Date.now();
  const recent = await readRecentAttempts(now);
  if (recent.length >= MAX_ATTEMPTS_PER_WINDOW) {
    const oldest = Math.min(...recent);
    const retryInSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    throw new Error(`Too many password attempts. Try again in ${retryInSeconds} seconds.`);
  }
}

/**
 * Records a failed password attempt. Best-effort: a storage failure must not
 * mask the original "invalid password" error.
 */
export async function recordFailedUnlockAttempt(): Promise<void> {
  const now = Date.now();
  const recent = await readRecentAttempts(now);
  recent.push(now);
  try {
    await failedAttemptsItem.setValue(recent);
  } catch {
    // Best-effort only
  }
}

/**
 * Clears the failure window after a successful password check.
 */
export async function clearUnlockAttempts(): Promise<void> {
  try {
    await failedAttemptsItem.removeValue();
  } catch {
    // Best-effort only
  }
}
