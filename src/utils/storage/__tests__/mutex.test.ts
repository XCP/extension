import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWriteLock, isExpired } from '../mutex';

describe('mutex.ts', () => {
  describe('isExpired', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should return false when timestamp is within TTL', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const timestamp = now - 1000; // 1 second ago
      const ttl = 5000; // 5 second TTL

      expect(isExpired(timestamp, ttl)).toBe(false);
    });

    it('should return true when timestamp equals TTL boundary', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const timestamp = now - 5000; // Exactly 5 seconds ago
      const ttl = 5000; // 5 second TTL

      // Uses >= for consistent boundary behavior
      expect(isExpired(timestamp, ttl)).toBe(true);
    });

    it('should return true when timestamp exceeds TTL', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const timestamp = now - 10000; // 10 seconds ago
      const ttl = 5000; // 5 second TTL

      expect(isExpired(timestamp, ttl)).toBe(true);
    });

    it('should return false for zero elapsed time', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      expect(isExpired(now, 5000)).toBe(false);
    });
  });

  describe('createWriteLock', () => {
    it('should create independent lock instances', () => {
      const lock1 = createWriteLock();
      const lock2 = createWriteLock();

      expect(lock1).not.toBe(lock2);
      expect(typeof lock1).toBe('function');
      expect(typeof lock2).toBe('function');
    });

    it('should execute single operation immediately', async () => {
      const withWriteLock = createWriteLock();
      const result = await withWriteLock(async () => 'test-result');

      expect(result).toBe('test-result');
    });

    it('should serialize concurrent operations', async () => {
      const withWriteLock = createWriteLock();
      const executionOrder: number[] = [];

      const operation = async (id: number) => {
        executionOrder.push(id);
        return id;
      };

      // Start multiple operations concurrently
      const promise1 = withWriteLock(() => operation(1));
      const promise2 = withWriteLock(() => operation(2));
      const promise3 = withWriteLock(() => operation(3));

      await Promise.all([promise1, promise2, promise3]);

      // Operations should execute in order they were queued
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should return results in correct order', async () => {
      const withWriteLock = createWriteLock();

      const promise1 = withWriteLock(async () => 'first');
      const promise2 = withWriteLock(async () => 'second');
      const promise3 = withWriteLock(async () => 'third');

      const results = await Promise.all([promise1, promise2, promise3]);

      expect(results).toEqual(['first', 'second', 'third']);
    });

    it('should release lock after operation completes', async () => {
      const withWriteLock = createWriteLock();

      await withWriteLock(async () => 'first');

      // Should be able to acquire lock again immediately
      const result = await withWriteLock(async () => 'second');
      expect(result).toBe('second');
    });

    it('should release lock even if operation throws', async () => {
      const withWriteLock = createWriteLock();

      // First operation throws
      await expect(
        withWriteLock(async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      // Lock should be released, next operation should succeed
      const result = await withWriteLock(async () => 'success');
      expect(result).toBe('success');
    });

    it('should handle async operations correctly', async () => {
      const withWriteLock = createWriteLock();
      let counter = 0;

      const increment = async () => {
        const current = counter;
        // Simulate async work with a microtask
        await Promise.resolve();
        counter = current + 1;
        return counter;
      };

      // Without lock, these would race and result in counter = 1
      // With lock, they serialize and result in counter = 3
      const promises = [
        withWriteLock(increment),
        withWriteLock(increment),
        withWriteLock(increment),
      ];

      await Promise.all(promises);
      expect(counter).toBe(3);
    });

    it('should allow independent locks to run concurrently', async () => {
      const lock1 = createWriteLock();
      const lock2 = createWriteLock();

      let lock1Started = false;
      let lock2Started = false;

      const op1 = async () => {
        lock1Started = true;
        await Promise.resolve();
        return 'lock1';
      };

      const op2 = async () => {
        lock2Started = true;
        await Promise.resolve();
        return 'lock2';
      };

      // Start both operations
      const promise1 = lock1(op1);
      const promise2 = lock2(op2);

      const results = await Promise.all([promise1, promise2]);

      // Both should have executed
      expect(lock1Started).toBe(true);
      expect(lock2Started).toBe(true);
      expect(results).toEqual(['lock1', 'lock2']);
    });
  });
});
