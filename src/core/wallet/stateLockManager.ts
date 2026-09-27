/**
 * State Lock Manager
 * Provides mutex-like locking for preventing race conditions in wallet state operations
 */

interface QueuedWaiter {
  grant: () => void;
  reject: (error: Error) => void;
}

interface Lock {
  id: string;
  /**
   * Token of the acquisition that holds the lock. Every acquisition gets a fresh one, and a
   * release or timeout only acts while its token still matches.
   */
  holder: number;
  queue: QueuedWaiter[];
  timeout?: ReturnType<typeof setTimeout>;
}

class StateLockManager {
  private locks: Map<string, Lock> = new Map();
  private nextToken = 0;
  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds timeout for locks

  /**
   * Acquire a lock for a specific resource
   * @param resource - The resource identifier to lock
   * @param timeout - Optional timeout in milliseconds (default: 30 seconds)
   * @returns Promise that resolves with a release function bound to this acquisition
   */
  async acquire(resource: string, timeout: number = this.DEFAULT_TIMEOUT): Promise<() => void> {
    return new Promise((resolve, reject) => {
      const lock = this.locks.get(resource);

      if (!lock) {
        // Create new lock and acquire immediately
        const newLock: Lock = { id: resource, holder: 0, queue: [] };
        this.locks.set(resource, newLock);
        resolve(this.grant(newLock, timeout));
      } else {
        // Lock is held, wait in line
        lock.queue.push({
          grant: () => resolve(this.grant(lock, timeout)),
          reject,
        });
      }
    });
  }

  /**
   * Hand the lock to a new acquisition: give it a fresh token, start its timeout, and return a
   * release function bound to that token.
   */
  private grant(lock: Lock, timeout: number): () => void {
    const token = ++this.nextToken;
    lock.holder = token;

    if (lock.timeout) clearTimeout(lock.timeout);
    lock.timeout = setTimeout(() => {
      console.warn(`Lock timeout for resource: ${lock.id}`);
      this.forceRelease(lock.id, token);
    }, timeout);

    return () => this.release(lock.id, token);
  }

  /**
   * Release a lock for a specific resource
   * @param resource - The resource identifier to release
   * @param token - The token of the acquisition releasing it
   */
  private release(resource: string, token: number): void {
    const lock = this.locks.get(resource);

    if (!lock) {
      console.warn(`Attempting to release non-existent lock: ${resource}`);
      return;
    }

    // A holder that was force-released on timeout, or that already released, no longer owns the
    // lock. Acting on its release would free whoever holds the lock now and let the next waiter
    // run alongside them.
    if (lock.holder !== token) {
      console.warn(`Ignoring stale release for resource: ${resource}`);
      return;
    }

    // Clear timeout
    if (lock.timeout) {
      clearTimeout(lock.timeout);
      lock.timeout = undefined;
    }

    const next = lock.queue.shift();
    if (next) {
      // Pass lock to next in queue
      next.grant();
    } else {
      // No one waiting, remove lock
      this.locks.delete(resource);
    }
  }

  /**
   * Force release a lock (used for timeout scenarios)
   * @param resource - The resource identifier to force release
   * @param token - The token of the acquisition that timed out
   */
  private forceRelease(resource: string, token: number): void {
    const lock = this.locks.get(resource);

    if (!lock || lock.holder !== token) return;

    // Clear timeout
    if (lock.timeout) {
      clearTimeout(lock.timeout);
      lock.timeout = undefined;
    }

    // Reject all queued waiters with timeout error
    const timeoutError = new Error(`Lock timeout for resource: ${resource}`);
    lock.queue.forEach(waiter => {
      waiter.reject(timeoutError);
    });

    if (lock.queue.length > 0) {
      console.error(`Lock queue cleared due to timeout: ${resource} (${lock.queue.length} waiters rejected)`);
    }

    // Remove the lock entirely. The timed-out holder may still be running; its release is now
    // stale and is ignored.
    this.locks.delete(resource);
  }
}

// Export singleton instance
export const stateLockManager = new StateLockManager();

/**
 * Helper function to run code with a lock
 * @param lockKey - The resource to lock
 * @param fn - The function to run while holding the lock
 */
export async function withStateLock<T>(
  lockKey: string,
  fn: () => Promise<T>
): Promise<T> {
  const release = await stateLockManager.acquire(lockKey);

  try {
    return await fn();
  } finally {
    release();
  }
}
