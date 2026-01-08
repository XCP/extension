import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTLCache, createCachedFn, CacheTTL } from '../cache';

describe('TTLCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic operations', () => {
    it('returns null when empty', () => {
      const cache = new TTLCache<string>(1000);
      expect(cache.get()).toBeNull();
    });

    it('stores and retrieves values', () => {
      const cache = new TTLCache<string>(1000);
      cache.set('test');
      expect(cache.get()).toBe('test');
    });

    it('returns null after TTL expires', () => {
      const cache = new TTLCache<string>(1000);
      cache.set('test');
      expect(cache.get()).toBe('test');

      vi.advanceTimersByTime(1001);
      expect(cache.get()).toBeNull();
    });

    it('returns value just before TTL expires', () => {
      const cache = new TTLCache<string>(1000);
      cache.set('test');

      vi.advanceTimersByTime(999);
      expect(cache.get()).toBe('test');
    });
  });

  describe('invalidate', () => {
    it('clears the cache', () => {
      const cache = new TTLCache<string>(1000);
      cache.set('test');
      expect(cache.get()).toBe('test');

      cache.invalidate();
      expect(cache.get()).toBeNull();
    });

    it('allows new values after invalidation', () => {
      const cache = new TTLCache<string>(1000);
      cache.set('test1');
      cache.invalidate();
      cache.set('test2');
      expect(cache.get()).toBe('test2');
    });
  });

  describe('isValid', () => {
    it('returns false when empty', () => {
      const cache = new TTLCache<string>(1000);
      expect(cache.isValid()).toBe(false);
    });

    it('returns true when valid', () => {
      const cache = new TTLCache<string>(1000);
      cache.set('test');
      expect(cache.isValid()).toBe(true);
    });

    it('returns false after TTL expires', () => {
      const cache = new TTLCache<string>(1000);
      cache.set('test');
      vi.advanceTimersByTime(1001);
      expect(cache.isValid()).toBe(false);
    });
  });

  describe('getAge', () => {
    it('returns -1 when empty', () => {
      const cache = new TTLCache<string>(1000);
      expect(cache.getAge()).toBe(-1);
    });

    it('returns age in milliseconds', () => {
      const cache = new TTLCache<string>(1000);
      cache.set('test');

      vi.advanceTimersByTime(500);
      expect(cache.getAge()).toBe(500);
    });

    it('returns age even after TTL expires', () => {
      const cache = new TTLCache<string>(1000);
      cache.set('test');

      vi.advanceTimersByTime(2000);
      expect(cache.getAge()).toBe(2000);
    });
  });

  describe('clone function', () => {
    it('clones on get when clone function provided', () => {
      const clone = (obj: { value: number }) => ({ ...obj });
      const cache = new TTLCache<{ value: number }>(1000, clone);

      const original = { value: 1 };
      cache.set(original);

      const retrieved = cache.get();
      expect(retrieved).not.toBe(original); // Different reference
      expect(retrieved).toEqual({ value: 1 }); // Same value
    });

    it('clones on set when clone function provided', () => {
      const clone = (obj: { value: number }) => ({ ...obj });
      const cache = new TTLCache<{ value: number }>(1000, clone);

      const original = { value: 1 };
      cache.set(original);

      // Mutate original - should not affect cache
      original.value = 999;

      const retrieved = cache.get();
      expect(retrieved).toEqual({ value: 1 });
    });

    it('protects cached data from mutation via returned reference', () => {
      const clone = (obj: { value: number }) => ({ ...obj });
      const cache = new TTLCache<{ value: number }>(1000, clone);

      cache.set({ value: 1 });
      const first = cache.get();
      first!.value = 999;

      const second = cache.get();
      expect(second).toEqual({ value: 1 }); // Still original value
    });

    it('returns same reference without clone function', () => {
      const cache = new TTLCache<{ value: number }>(1000);

      const original = { value: 1 };
      cache.set(original);

      const retrieved = cache.get();
      expect(retrieved).toBe(original); // Same reference
    });
  });
});

describe('createCachedFn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches results', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      return `result-${callCount}`;
    });

    const cached = createCachedFn(fn, 1000);

    expect(await cached()).toBe('result-1');
    expect(await cached()).toBe('result-1'); // Same result, cached
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('refreshes after TTL expires', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      return `result-${callCount}`;
    });

    const cached = createCachedFn(fn, 1000);

    expect(await cached()).toBe('result-1');
    vi.advanceTimersByTime(1001);
    expect(await cached()).toBe('result-2');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent calls', async () => {
    vi.useRealTimers(); // Use real timers for this async test

    let callCount = 0;
    let resolvePromise: () => void;
    const blocker = new Promise<void>(resolve => {
      resolvePromise = resolve;
    });

    const fn = vi.fn(async () => {
      callCount++;
      await blocker; // Wait for explicit resolution
      return `result-${callCount}`;
    });

    const cached = createCachedFn(fn, 1000);

    // Start multiple calls simultaneously (they'll all wait on blocker)
    const p1 = cached();
    const p2 = cached();
    const p3 = cached();

    // Only one call should have been made
    expect(fn).toHaveBeenCalledTimes(1);

    // Resolve the blocker
    resolvePromise!();

    const results = await Promise.all([p1, p2, p3]);

    // All should get the same result
    expect(results).toEqual(['result-1', 'result-1', 'result-1']);
    // Still only one call
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useFakeTimers(); // Restore for other tests
  });

  it('allows retry after error', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First call fails');
      }
      return 'success';
    });

    const cached = createCachedFn(fn, 1000);

    // First call fails
    await expect(cached()).rejects.toThrow('First call fails');

    // Second call should retry (not return cached error)
    expect(await cached()).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('clones results when clone function provided', async () => {
    const fn = vi.fn(async () => ({ value: 1 }));
    const clone = (obj: { value: number }) => ({ ...obj });
    const cached = createCachedFn(fn, 1000, clone);

    const first = await cached();
    const second = await cached();

    expect(first).not.toBe(second); // Different references
    expect(first).toEqual({ value: 1 });
    expect(second).toEqual({ value: 1 });
  });

  it('clones fresh result on first call', async () => {
    const original = { value: 1 };
    const fn = vi.fn(async () => original);
    const clone = (obj: { value: number }) => ({ ...obj });
    const cached = createCachedFn(fn, 1000, clone);

    const result = await cached();
    expect(result).not.toBe(original);
    expect(result).toEqual({ value: 1 });
  });
});

describe('CacheTTL constants', () => {
  it('has expected values', () => {
    expect(CacheTTL.SHORT).toBe(5000);
    expect(CacheTTL.MEDIUM).toBe(30000);
    expect(CacheTTL.LONG).toBe(120000);
  });
});
