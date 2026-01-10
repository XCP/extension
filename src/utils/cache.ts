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
 * A keyed cache where each key has its own TTL-based entry.
 * Useful for caching multiple related values (e.g., prices per currency, connections per origin).
 *
 * @template K The key type (typically string)
 * @template V The value type
 */
export class KeyedTTLCache<K, V> {
  private cache = new Map<K, { data: V; timestamp: number }>();
  private readonly ttlMs: number;
  private readonly clone: ((data: V) => V) | null;

  /**
   * Creates a new keyed TTL cache.
   * @param ttlMs Time-to-live in milliseconds for each entry
   * @param clone Optional function to deep clone data on get/set
   */
  constructor(ttlMs: number, clone?: (data: V) => V) {
    this.ttlMs = ttlMs;
    this.clone = clone ?? null;
  }

  /**
   * Gets a cached value by key if valid, null otherwise.
   */
  get(key: K): V | null {
    const entry = this.cache.get(key);
    if (entry && (Date.now() - entry.timestamp) < this.ttlMs) {
      return this.clone ? this.clone(entry.data) : entry.data;
    }
    return null;
  }

  /**
   * Gets a cached value even if expired (for stale-while-revalidate patterns).
   * Returns null only if key was never set.
   */
  getStale(key: K): V | null {
    const entry = this.cache.get(key);
    if (entry) {
      return this.clone ? this.clone(entry.data) : entry.data;
    }
    return null;
  }

  /**
   * Sets a cached value for a key.
   */
  set(key: K, value: V): void {
    this.cache.set(key, {
      data: this.clone ? this.clone(value) : value,
      timestamp: Date.now(),
    });
  }

  /**
   * Checks if a key has a valid (non-expired) entry.
   */
  isValid(key: K): boolean {
    const entry = this.cache.get(key);
    return entry !== undefined && (Date.now() - entry.timestamp) < this.ttlMs;
  }

  /**
   * Invalidates a specific key.
   */
  invalidate(key: K): void {
    this.cache.delete(key);
  }

  /**
   * Invalidates all entries.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Removes expired entries to free memory.
   * Call periodically for long-lived caches.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Gets the number of entries (including expired ones).
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * Common TTL values for convenience.
 *
 * Guidelines:
 * - SHORT (5s): Frequently changing data read multiple times per action (settings, records)
 * - MEDIUM (30s): Moderately stable data (fee rates)
 * - LONG (2m): Stable data with occasional updates
 * - VERY_LONG (10m): Slowly changing data (block height, prices)
 */
export const CacheTTL = {
  /** 5 seconds - for settings, storage records */
  SHORT: 5000,
  /** 30 seconds - for fee rates */
  MEDIUM: 30000,
  /** 2 minutes - for moderately stable data */
  LONG: 120000,
  /** 10 minutes - for block height, price data */
  VERY_LONG: 600000,
} as const;
