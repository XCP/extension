/**
 * Storage utilities - mutex and TTL helpers
 */

/**
 * Check if a timestamp has exceeded its TTL.
 * Uses >= for consistent boundary behavior.
 *
 * Fail-safe: Invalid inputs (NaN, negative TTL) are treated as expired
 * to prevent items from persisting indefinitely due to corruption.
 */
export function isExpired(timestamp: number, ttl: number): boolean {
  // Fail safe: treat invalid inputs as expired
  if (!Number.isFinite(timestamp) || !Number.isFinite(ttl) || ttl < 0) {
    return true;
  }
  return Date.now() - timestamp >= ttl;
}

/**
 * Promise-based mutex for serializing async operations.
 *
 * Creates an independent write lock that ensures only one operation
 * executes at a time within its scope. Each call to createWriteLock()
 * returns a new, independent lock instance.
 *
 * Usage:
 * ```typescript
 * const withWriteLock = createWriteLock();
 *
 * async function safeWrite() {
 *   return withWriteLock(async () => {
 *     // This code runs exclusively
 *   });
 * }
 * ```
 */
export function createWriteLock() {
  let lock: Promise<void> = Promise.resolve();

  return async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    // Capture the current lock to wait on
    const previousLock = lock;

    // Create a new lock that will be released when we're done
    let releaseLock: () => void;
    lock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    try {
      // Wait for any previous operation to complete
      await previousLock;
      // Execute our operation
      return await fn();
    } finally {
      // Release the lock for the next operation
      releaseLock!();
    }
  };
}
