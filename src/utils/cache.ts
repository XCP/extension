/**
 * Simple TTL Cache Utility
 *
 * Provides a consistent caching pattern across the codebase.
 * Used for settings, fee rates, block height, and other data
 * that changes infrequently and benefits from short-term caching.
 */

/**
 * A generic cache with time-to-live expiration.
 *
 * If a clone function is provided:
 * - get() returns a cloned copy (callers can't mutate cached data)
 * - set() stores a cloned copy (callers can't mutate cached data via original reference)
 *
 * @template T The type of data being cached
 */
export class TTLCache<T> {
  private data: T | null = null;
  private timestamp = 0;
  private readonly ttlMs: number;
  private readonly clone: ((data: T) => T) | null;

  /**
   * Creates a new TTL cache.
   * @param ttlMs Time-to-live in milliseconds
   * @param clone Optional function to deep clone data on get/set (prevents mutation)
   */
  constructor(ttlMs: number, clone?: (data: T) => T) {
    this.ttlMs = ttlMs;
    this.clone = clone ?? null;
  }

  /**
   * Gets the cached value if valid, null otherwise.
   * Returns a cloned copy if a clone function was provided.
   */
  get(): T | null {
    const now = Date.now();
    if (this.data !== null && (now - this.timestamp) < this.ttlMs) {
      return this.clone ? this.clone(this.data) : this.data;
    }
    return null;
  }

  /**
   * Sets a new cached value.
   * Stores a cloned copy if a clone function was provided.
   */
  set(value: T): void {
    this.data = this.clone ? this.clone(value) : value;
    this.timestamp = Date.now();
  }

  /**
   * Invalidates the cache, forcing a refresh on next get.
   */
  invalidate(): void {
    this.data = null;
    this.timestamp = 0;
  }

  /**
   * Checks if the cache has a valid (non-expired) value.
   */
  isValid(): boolean {
    return this.data !== null && (Date.now() - this.timestamp) < this.ttlMs;
  }

  /**
   * Gets cache age in milliseconds, or -1 if empty.
   */
  getAge(): number {
    if (this.data === null) return -1;
    return Date.now() - this.timestamp;
  }
}

/**
 * Creates a cached async function wrapper.
 * Useful for wrapping API calls with automatic caching.
 *
 * Features:
 * - Deduplicates concurrent calls (only one request when cache is empty)
 * - Clones results if clone function provided
 * - Does not cache errors (allows retry on next call)
 *
 * @param fn The async function to wrap
 * @param ttlMs Cache TTL in milliseconds
 * @param clone Optional clone function for the result
 * @returns Wrapped function that caches results
 *
 * @example
 * const cachedFetch = createCachedFn(
 *   () => fetch('/api/data').then(r => r.json()),
 *   30000 // 30 second cache
 * );
 */
export function createCachedFn<T>(
  fn: () => Promise<T>,
  ttlMs: number,
  clone?: (data: T) => T
): () => Promise<T> {
  const cache = new TTLCache<T>(ttlMs, clone);
  let inflight: Promise<T> | null = null;

  return async () => {
    // Return cached value if available
    const cached = cache.get();
    if (cached !== null) {
      return cached;
    }

    // Deduplicate concurrent calls - share the same promise
    if (inflight !== null) {
      const result = await inflight;
      return clone ? clone(result) : result;
    }

    // Execute and cache
    inflight = fn();
    try {
      const result = await inflight;
      cache.set(result);
      return clone ? clone(result) : result;
    } finally {
      inflight = null;
    }
  };
}

/**
 * Common TTL values for convenience
 */
export const CacheTTL = {
  /** 5 seconds - for settings, storage records */
  SHORT: 5000,
  /** 30 seconds - for fee rates */
  MEDIUM: 30000,
  /** 2 minutes - for block height */
  LONG: 120000,
} as const;
