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
  private hasValue = false;
  private timestamp = 0;
  private readonly ttlMs: number;
  private readonly clone: ((data: T) => T) | null;

  /**
   * Creates a new TTL cache.
   * @param ttlMs Time-to-live in milliseconds (must be positive finite number)
   * @param clone Optional function to deep clone data on get/set (prevents mutation)
   *
   * Note: The clone function is wrapped internally to prevent "Illegal invocation"
   * errors when native/host functions (like structuredClone) are passed directly.
   * @throws Error if ttlMs is not a positive finite number
   */
  constructor(ttlMs: number, clone?: (data: T) => T) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error(`TTL must be a positive finite number, got: ${ttlMs}`);
    }
    this.ttlMs = ttlMs;
    // Wrap the clone function to prevent "Illegal invocation" errors when
    // native/host functions are passed directly and later invoked via property call
    this.clone = clone ? ((v: T) => clone(v)) : null;
  }

  /**
   * Gets the cached value if valid, null otherwise.
   * Returns a cloned copy if a clone function was provided.
   * Note: null can be a valid cached value if T includes null.
   */
  get(): T | null {
    if (this.hasValue && (Date.now() - this.timestamp) < this.ttlMs) {
      return this.clone ? this.clone(this.data as T) : (this.data as T);
    }
    return null;
  }

  /**
   * Sets a new cached value.
   * Stores a cloned copy if a clone function was provided.
   * Note: null is a valid value to cache if T includes null.
   */
  set(value: T): void {
    this.data = this.clone ? this.clone(value) : value;
    this.hasValue = true;
    this.timestamp = Date.now();
  }

  /**
   * Invalidates the cache, forcing a refresh on next get.
   */
  invalidate(): void {
    this.data = null;
    this.hasValue = false;
    this.timestamp = 0;
  }

  /**
   * Checks if the cache has a valid (non-expired) value.
   */
  isValid(): boolean {
    return this.hasValue && (Date.now() - this.timestamp) < this.ttlMs;
  }

  /**
   * Gets cache age in milliseconds, or -1 if empty.
   */
  getAge(): number {
    if (!this.hasValue) return -1;
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
   * @param ttlMs Time-to-live in milliseconds for each entry (must be positive finite number)
   * @param clone Optional function to deep clone data on get/set
   *
   * Note: The clone function is wrapped internally to prevent "Illegal invocation"
   * errors when native/host functions (like structuredClone) are passed directly.
   * @throws Error if ttlMs is not a positive finite number
   */
  constructor(ttlMs: number, clone?: (data: V) => V) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error(`TTL must be a positive finite number, got: ${ttlMs}`);
    }
    this.ttlMs = ttlMs;
    // Wrap the clone function to prevent "Illegal invocation" errors when
    // native/host functions are passed directly and later invoked via property call
    this.clone = clone ? ((v: V) => clone(v)) : null;
  }

  /**
   * Gets a cached value by key if valid, null otherwise.
   * Note: null can be a valid cached value if V includes null.
   * Use isValid(key) to distinguish cached null from cache miss.
   */
  get(key: K): V | null {
    if (!this.cache.has(key)) return null; // Key never set
    const entry = this.cache.get(key)!;
    if ((Date.now() - entry.timestamp) >= this.ttlMs) return null; // Expired
    return this.clone ? this.clone(entry.data) : entry.data;
  }

  /**
   * Gets a cached value even if expired (for stale-while-revalidate patterns).
   * Returns null only if key was never set.
   * Note: null can be a valid cached value if V includes null.
   */
  getStale(key: K): V | null {
    if (!this.cache.has(key)) return null; // Key never set
    const entry = this.cache.get(key)!;
    return this.clone ? this.clone(entry.data) : entry.data;
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
