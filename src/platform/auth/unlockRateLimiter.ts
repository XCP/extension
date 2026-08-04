/**
 * Rate limiter for password attempts (unlock and verifyPassword).
 *
 * Backed by chrome.storage.session so the failure window survives service
 * worker restarts, which reset any in-memory counter. Storage read failures
 * fail open: the limiter is defense in depth on top of the ~1s PBKDF2 cost
 * per guess, and failing closed would block unlock on a storage error.
 *
 * Failing open still means falling back to what is known rather than to nothing. An in-memory
 * mirror of the window is kept alongside storage, so a read failure degrades the limiter to
 * "counts within this service worker's lifetime" instead of switching it off: returning an empty
 * list made a storage error indistinguishable from a clean record, and the throttle disappeared
 * entirely. Nothing here can block an unlock — the mirror only ever adds attempts the limiter
 * would otherwise have missed, so the worst case remains a window that resets early.
 */

import { storage } from '#imports';

const MAX_ATTEMPTS_PER_WINDOW = 5;
const WINDOW_MS = 60_000;

const failedAttemptsItem = storage.defineItem<number[]>('session:failedUnlockAttempts', {
  fallback: [],
});

/**
 * Attempts seen by this service worker, kept in step with storage so an unreadable store still
 * has something to count. Lost on restart, which is the cost of never blocking an unlock.
 */
let attemptsMirror: number[] = [];

function withinWindow(attempts: number[], now: number): number[] {
  return attempts.filter((timestamp) => now - timestamp < WINDOW_MS);
}

async function readRecentAttempts(now: number): Promise<number[]> {
  try {
    // Readable storage is the record — it survives restarts, and the mirror tracks it so a later
    // failure has something current to fall back to. Merging the two instead would double-count
    // attempts present in both, and deduplicating that merge would collapse the several attempts
    // that share a millisecond into one.
    const stored = withinWindow(await failedAttemptsItem.getValue(), now);
    attemptsMirror = stored;
    return stored;
  } catch {
    // Unreadable, not empty. Whatever this worker has seen still counts.
    const recentMirror = withinWindow(attemptsMirror, now);
    attemptsMirror = recentMirror;
    return recentMirror;
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
  // Recorded in memory first, so an attempt still counts when the write below fails.
  attemptsMirror = recent;
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
  // Cleared unconditionally: this runs after a correct password, so keeping the mirror would
  // throttle a legitimate user whose storage happens to be failing.
  attemptsMirror = [];
  try {
    await failedAttemptsItem.removeValue();
  } catch {
    // Best-effort only
  }
}
