/**
 * State Lock Manager
 * Provides mutex-like locking for preventing race conditions in wallet state operations
 */

interface QueuedWaiter {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
}

interface Lock {
  id: string;
  acquired: boolean;
  queue: QueuedWaiter[];
  timeout?: NodeJS.Timeout;
}

class StateLockManager {
  private locks: Map<string, Lock> = new Map();
  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds timeout for locks

  /**
   * Acquire a lock for a specific resource
   * @param resource - The resource identifier to lock
   * @param timeout - Optional timeout in milliseconds (default: 30 seconds)
   * @returns Promise that resolves when lock is acquired
   */
  async acquire(resource: string, timeout: number = this.DEFAULT_TIMEOUT): Promise<() => void> {
    return new Promise((resolve, reject) => {
      let lock = this.locks.get(resource);
      
      if (!lock) {
        // Create new lock and acquire immediately
        lock = {
          id: resource,
          acquired: true,
          queue: [],
        };
        this.locks.set(resource, lock);
        
        // Set timeout for lock
        const timeoutId = setTimeout(() => {
          console.warn(`Lock timeout for resource: ${resource}`);
          this.forceRelease(resource);
        }, timeout);
        
        lock.timeout = timeoutId;
        
        // Return release function
        resolve(() => this.release(resource));
      } else if (!lock.acquired) {
        // Lock exists but not acquired (shouldn't happen)
        lock.acquired = true;
        
        // Set new timeout
        if (lock.timeout) clearTimeout(lock.timeout);
        lock.timeout = setTimeout(() => {
          console.warn(`Lock timeout for resource: ${resource}`);
          this.forceRelease(resource);
        }, timeout);
        
        resolve(() => this.release(resource));
      } else {
        // Lock is acquired, add to queue with both resolve and reject
        lock.queue.push({
          resolve: (releaseFn) => {
            lock!.acquired = true;

            // Set timeout for this lock acquisition
            if (lock!.timeout) clearTimeout(lock!.timeout);
            lock!.timeout = setTimeout(() => {
              console.warn(`Lock timeout for resource: ${resource}`);
              this.forceRelease(resource);
            }, timeout);

            resolve(releaseFn);
          },
          reject,
        });
      }
    });
  }

  /**
   * Release a lock for a specific resource
   * @param resource - The resource identifier to release
   */
  private release(resource: string): void {
    const lock = this.locks.get(resource);
    
    if (!lock) {
      console.warn(`Attempting to release non-existent lock: ${resource}`);
      return;
    }
    
    // Clear timeout
    if (lock.timeout) {
      clearTimeout(lock.timeout);
      lock.timeout = undefined;
    }
    
    if (lock.queue.length > 0) {
      // Pass lock to next in queue
      const next = lock.queue.shift();
      if (next) {
        next.resolve(() => this.release(resource));
      }
    } else {
      // No one waiting, remove lock
      this.locks.delete(resource);
    }
  }

  /**
   * Force release a lock (used for timeout scenarios)
   * @param resource - The resource identifier to force release
   */
  private forceRelease(resource: string): void {
    const lock = this.locks.get(resource);

    if (!lock) return;

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

    // Remove the lock entirely
    this.locks.delete(resource);
  }

  /**
   * Check if a resource is currently locked
   * @param resource - The resource identifier to check
   */
  isLocked(resource: string): boolean {
    const lock = this.locks.get(resource);
    return lock ? lock.acquired : false;
  }

  /**
   * Get the number of waiters for a resource
   * @param resource - The resource identifier
   */
  getQueueLength(resource: string): number {
    const lock = this.locks.get(resource);
    return lock ? lock.queue.length : 0;
  }

  /**
   * Clear all locks (use with caution)
   */
  clearAll(): void {
    this.locks.forEach(lock => {
      if (lock.timeout) {
        clearTimeout(lock.timeout);
      }
    });
    this.locks.clear();
  }
}

// Export singleton instance
export const stateLockManager = new StateLockManager();

/**
 * Decorator for methods that need state locking
 * @param lockKey - The key to use for locking (can be a function that returns a key)
 */
export function withLock(lockKey: string | ((this: any, ...args: any[]) => string)) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const key = typeof lockKey === 'function' ? lockKey.call(this, ...args) : lockKey;
      const release = await stateLockManager.acquire(key);
      
      try {
        return await originalMethod.apply(this, args);
      } finally {
        release();
      }
    };
    
    return descriptor;
  };
}

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