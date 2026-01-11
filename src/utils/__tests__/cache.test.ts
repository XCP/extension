import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTLCache, KeyedTTLCache, CacheTTL } from '../cache';

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

    it('works with structuredClone passed directly (regression test)', () => {
      // This test ensures we don't regress on "Illegal invocation" errors
      // when native functions like structuredClone are passed directly.
      // The TTLCache constructor should wrap them to prevent this issue.
      const cache = new TTLCache<{ value: number }>(1000, structuredClone);

      const original = { value: 42 };
      // This should not throw "Illegal invocation"
      expect(() => cache.set(original)).not.toThrow();

      const retrieved = cache.get();
      expect(retrieved).not.toBe(original); // Different reference (cloned)
      expect(retrieved).toEqual({ value: 42 }); // Same value
    });
  });
});

describe('KeyedTTLCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic operations', () => {
    it('returns null for unknown key', () => {
      const cache = new KeyedTTLCache<string, string>(1000);
      expect(cache.get('unknown')).toBeNull();
    });

    it('stores and retrieves values by key', () => {
      const cache = new KeyedTTLCache<string, string>(1000);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
    });

    it('returns null after TTL expires for key', () => {
      const cache = new KeyedTTLCache<string, string>(1000);
      cache.set('key1', 'value1');

      vi.advanceTimersByTime(1001);
      expect(cache.get('key1')).toBeNull();
    });

    it('each key has independent TTL', () => {
      const cache = new KeyedTTLCache<string, string>(1000);
      cache.set('key1', 'value1');

      vi.advanceTimersByTime(500);
      cache.set('key2', 'value2');

      vi.advanceTimersByTime(501);
      // key1 expired, key2 still valid
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('getStale', () => {
    it('returns expired value', () => {
      const cache = new KeyedTTLCache<string, string>(1000);
      cache.set('key1', 'value1');

      vi.advanceTimersByTime(2000);
      expect(cache.get('key1')).toBeNull();
      expect(cache.getStale('key1')).toBe('value1');
    });

    it('returns null for never-set key', () => {
      const cache = new KeyedTTLCache<string, string>(1000);
      expect(cache.getStale('unknown')).toBeNull();
    });
  });

  describe('isValid', () => {
    it('returns false for unknown key', () => {
      const cache = new KeyedTTLCache<string, string>(1000);
      expect(cache.isValid('unknown')).toBe(false);
    });

    it('returns true for valid entry', () => {
      const cache = new KeyedTTLCache<string, string>(1000);
      cache.set('key1', 'value1');
      expect(cache.isValid('key1')).toBe(true);
    });

    it('returns false after TTL expires', () => {
      const cache = new KeyedTTLCache<string, string>(1000);
      cache.set('key1', 'value1');
      vi.advanceTimersByTime(1001);
      expect(cache.isValid('key1')).toBe(false);
    });
  });

  describe('invalidate', () => {
    it('removes a specific key', () => {
      const cache = new KeyedTTLCache<string, string>(1000);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.invalidate('key1');

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('invalidateAll', () => {
    it('removes all entries', () => {
      const cache = new KeyedTTLCache<string, string>(1000);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.invalidateAll();

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.size).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('removes expired entries', () => {
      const cache = new KeyedTTLCache<string, string>(1000);
      cache.set('old', 'value1');

      vi.advanceTimersByTime(1001);
      cache.set('new', 'value2');

      expect(cache.size).toBe(2);
      cache.cleanup();
      expect(cache.size).toBe(1);
      expect(cache.get('new')).toBe('value2');
    });
  });

  describe('clone function', () => {
    it('clones on get', () => {
      const clone = (obj: { value: number }) => ({ ...obj });
      const cache = new KeyedTTLCache<string, { value: number }>(1000, clone);

      cache.set('key1', { value: 1 });
      const first = cache.get('key1');
      const second = cache.get('key1');

      expect(first).not.toBe(second);
      expect(first).toEqual({ value: 1 });
    });

    it('protects cached data from mutation', () => {
      const clone = (obj: { value: number }) => ({ ...obj });
      const cache = new KeyedTTLCache<string, { value: number }>(1000, clone);

      cache.set('key1', { value: 1 });
      const retrieved = cache.get('key1');
      retrieved!.value = 999;

      expect(cache.get('key1')).toEqual({ value: 1 });
    });

    it('works with structuredClone passed directly (regression test)', () => {
      // This test ensures we don't regress on "Illegal invocation" errors
      // when native functions like structuredClone are passed directly.
      const cache = new KeyedTTLCache<string, { value: number }>(1000, structuredClone);

      const original = { value: 42 };
      // This should not throw "Illegal invocation"
      expect(() => cache.set('key1', original)).not.toThrow();

      const retrieved = cache.get('key1');
      expect(retrieved).not.toBe(original); // Different reference (cloned)
      expect(retrieved).toEqual({ value: 42 }); // Same value
    });
  });
});

describe('CacheTTL constants', () => {
  it('has expected values', () => {
    expect(CacheTTL.SHORT).toBe(5000);
    expect(CacheTTL.MEDIUM).toBe(30000);
    expect(CacheTTL.LONG).toBe(120000);
    expect(CacheTTL.VERY_LONG).toBe(600000);
  });
});
