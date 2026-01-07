import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stateLockManager, withLock, withStateLock } from '../stateLockManager';

describe('StateLockManager', () => {
  beforeEach(() => {
    // Clear all locks before each test
    stateLockManager.clearAll();
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    stateLockManager.clearAll();
  });

  describe('acquire and release', () => {
    it('should acquire and release a lock successfully', async () => {
      const resource = 'test-resource';

      const releaseFn = await stateLockManager.acquire(resource);

      expect(stateLockManager.isLocked(resource)).toBe(true);
      expect(stateLockManager.getQueueLength(resource)).toBe(0);

      releaseFn();

      expect(stateLockManager.isLocked(resource)).toBe(false);
    });

    it('should queue multiple acquire requests for same resource', async () => {
      const resource = 'test-resource';
      let firstReleased = false;
      let secondReleased = false;

      // First acquire - should succeed immediately
      const firstPromise = stateLockManager.acquire(resource).then(release => {
        expect(stateLockManager.isLocked(resource)).toBe(true);
        return release;
      });

      // Second acquire - should queue
      const secondPromise = stateLockManager.acquire(resource).then(release => {
        expect(stateLockManager.isLocked(resource)).toBe(true);
        expect(firstReleased).toBe(true); // First should be released by now
        return release;
      });

      // Verify queue length
      await vi.waitFor(() => {
        expect(stateLockManager.getQueueLength(resource)).toBe(1);
      });

      // Release first lock
      const firstRelease = await firstPromise;
      firstReleased = true;
      firstRelease();

      // Second should now acquire
      const secondRelease = await secondPromise;
      secondReleased = true;
      expect(stateLockManager.isLocked(resource)).toBe(true);

      secondRelease();
      expect(stateLockManager.isLocked(resource)).toBe(false);
    });

    it('should handle timeout scenarios', async () => {
      const resource = 'timeout-resource';
      const timeoutMs = 1000;

      // Spy on console.warn to check timeout warning
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const releaseFn = await stateLockManager.acquire(resource, timeoutMs);
      expect(stateLockManager.isLocked(resource)).toBe(true);

      // Advance time past timeout
      vi.advanceTimersByTime(timeoutMs + 100);

      // Should have logged timeout warning and force released
      expect(warnSpy).toHaveBeenCalledWith(`Lock timeout for resource: ${resource}`);
      expect(stateLockManager.isLocked(resource)).toBe(false);

      warnSpy.mockRestore();
    });

    it('should handle concurrent access to different resources', async () => {
      const resource1 = 'resource-1';
      const resource2 = 'resource-2';

      const [release1, release2] = await Promise.all([
        stateLockManager.acquire(resource1),
        stateLockManager.acquire(resource2)
      ]);

      expect(stateLockManager.isLocked(resource1)).toBe(true);
      expect(stateLockManager.isLocked(resource2)).toBe(true);

      release1();
      expect(stateLockManager.isLocked(resource1)).toBe(false);
      expect(stateLockManager.isLocked(resource2)).toBe(true);

      release2();
      expect(stateLockManager.isLocked(resource2)).toBe(false);
    });
  });

  describe('queue management', () => {
    it('should process queue in FIFO order', async () => {
      const resource = 'queue-test';
      const executionOrder: number[] = [];

      // First lock - acquire immediately
      const firstPromise = stateLockManager.acquire(resource).then(release => {
        executionOrder.push(1);
        setTimeout(() => {
          release();
        }, 100);
        return release;
      });

      // Second and third - should queue
      const secondPromise = stateLockManager.acquire(resource).then(release => {
        executionOrder.push(2);
        setTimeout(() => {
          release();
        }, 100);
        return release;
      });

      const thirdPromise = stateLockManager.acquire(resource).then(release => {
        executionOrder.push(3);
        release();
        return release;
      });

      // Wait for first lock to be acquired
      const firstRelease = await firstPromise;

      // Check queue has built up
      expect(stateLockManager.getQueueLength(resource)).toBe(2);

      // Release first lock and advance time
      vi.advanceTimersByTime(100);

      // Wait for second lock
      const secondRelease = await secondPromise;
      vi.advanceTimersByTime(100);

      // Wait for third lock
      await thirdPromise;

      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should handle queue timeout properly and reject queued promises', async () => {
      const resource = 'queue-timeout';
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // First lock
      const firstRelease = await stateLockManager.acquire(resource, 500);

      // Queue some locks - these should be rejected when timeout occurs
      const queuedPromise1 = stateLockManager.acquire(resource, 200);
      const queuedPromise2 = stateLockManager.acquire(resource, 200);

      // Wait for queue to build
      await vi.waitFor(() => {
        expect(stateLockManager.getQueueLength(resource)).toBe(2);
      });

      // Advance time to trigger timeout on first lock (500ms)
      vi.advanceTimersByTime(500);

      // Queue should be cleared due to timeout
      await vi.waitFor(() => {
        expect(stateLockManager.getQueueLength(resource)).toBe(0);
      });

      // Queued promises should be rejected with timeout error
      await expect(queuedPromise1).rejects.toThrow('Lock timeout for resource: queue-timeout');
      await expect(queuedPromise2).rejects.toThrow('Lock timeout for resource: queue-timeout');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Lock queue cleared due to timeout')
      );

      errorSpy.mockRestore();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle releasing non-existent lock gracefully', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Try to release a lock that doesn't exist (simulate manual call to private method)
      (stateLockManager as any).release('non-existent');

      expect(warnSpy).toHaveBeenCalledWith(
        'Attempting to release non-existent lock: non-existent'
      );

      warnSpy.mockRestore();
    });

    it('should handle rapid acquire/release cycles', async () => {
      const resource = 'rapid-test';
      const cycles = 100;

      for (let i = 0; i < cycles; i++) {
        const release = await stateLockManager.acquire(resource);
        expect(stateLockManager.isLocked(resource)).toBe(true);
        release();
        expect(stateLockManager.isLocked(resource)).toBe(false);
      }
    });

    it('should prevent memory leaks with many different resources', async () => {
      const resourceCount = 1000;
      const releases: (() => void)[] = [];

      // Acquire locks for many different resources
      for (let i = 0; i < resourceCount; i++) {
        const release = await stateLockManager.acquire(`resource-${i}`);
        releases.push(release);
      }

      // Release all locks
      releases.forEach(release => release());

      // All resources should be unlocked and cleaned up
      for (let i = 0; i < resourceCount; i++) {
        expect(stateLockManager.isLocked(`resource-${i}`)).toBe(false);
      }
    });

    it('should handle invalid resource identifiers', async () => {
      const invalidResources = ['', '   ', '\n\t', '🚀💎'];

      for (const resource of invalidResources) {
        const release = await stateLockManager.acquire(resource);
        expect(stateLockManager.isLocked(resource)).toBe(true);
        release();
        expect(stateLockManager.isLocked(resource)).toBe(false);
      }
    });
  });

  describe('withLock decorator', () => {
    it('should lock and release automatically for decorated methods', async () => {
      let executionOrder: string[] = [];

      class TestClass {
        async testMethod(id: string) {
          executionOrder.push(`start-${id}`);
          await new Promise(resolve => {
            setTimeout(resolve, 100);
            vi.advanceTimersByTime(100);
          });
          executionOrder.push(`end-${id}`);
          return `result-${id}`;
        }
      }

      // Apply decorator manually for testing
      const descriptor = Object.getOwnPropertyDescriptor(TestClass.prototype, 'testMethod');
      if (descriptor) {
        withLock('test-method')(TestClass.prototype, 'testMethod', descriptor);
        Object.defineProperty(TestClass.prototype, 'testMethod', descriptor);
      }

      const instance = new TestClass();

      // Run two concurrent calls
      const promise1 = instance.testMethod('1');
      const promise2 = instance.testMethod('2');

      await vi.runAllTimersAsync();

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe('result-1');
      expect(result2).toBe('result-2');

      // Should execute sequentially due to lock
      expect(executionOrder).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
    });

    it('should handle dynamic lock keys with function', async () => {
      let executionOrder: string[] = [];

      class TestClass {
        async methodWithDynamicKey(resourceId: string, id: string) {
          executionOrder.push(`start-${id}`);
          await new Promise(resolve => {
            setTimeout(resolve, 50);
            vi.advanceTimersByTime(50);
          });
          executionOrder.push(`end-${id}`);
        }
      }

      // Apply decorator manually for testing
      const descriptor = Object.getOwnPropertyDescriptor(TestClass.prototype, 'methodWithDynamicKey');
      if (descriptor) {
        const decorator = withLock(function(this: any, resourceId: string) { return `dynamic-${resourceId}`; });
        decorator(TestClass.prototype, 'methodWithDynamicKey', descriptor);
        Object.defineProperty(TestClass.prototype, 'methodWithDynamicKey', descriptor);
      }

      const instance = new TestClass();

      // Same resource - should serialize
      const promise1 = instance.methodWithDynamicKey('resource1', 'a');
      const promise2 = instance.methodWithDynamicKey('resource1', 'b');

      // Different resource - should run concurrently
      const promise3 = instance.methodWithDynamicKey('resource2', 'c');

      await vi.runAllTimersAsync();
      await Promise.all([promise1, promise2, promise3]);

      // resource1 calls should be sequential, resource2 should be concurrent
      expect(executionOrder).toContain('start-a');
      expect(executionOrder).toContain('end-a');
      expect(executionOrder).toContain('start-b');
      expect(executionOrder).toContain('end-b');
      expect(executionOrder).toContain('start-c');
      expect(executionOrder).toContain('end-c');
    });

    it('should handle exceptions in decorated methods', async () => {
      class TestClass {
        async errorMethod() {
          throw new Error('Test error');
        }
      }

      // Apply decorator manually for testing
      const descriptor = Object.getOwnPropertyDescriptor(TestClass.prototype, 'errorMethod');
      if (descriptor) {
        withLock('error-test')(TestClass.prototype, 'errorMethod', descriptor);
        Object.defineProperty(TestClass.prototype, 'errorMethod', descriptor);
      }

      const instance = new TestClass();

      await expect(instance.errorMethod()).rejects.toThrow('Test error');

      // Lock should be released even after error
      expect(stateLockManager.isLocked('error-test')).toBe(false);
    });
  });

  describe('withStateLock helper', () => {
    it('should execute function with lock protection', async () => {
      const resource = 'helper-test';
      let counter = 0;
      let executionOrder: number[] = [];

      const incrementWithLock = () => withStateLock(resource, async () => {
        const current = counter;
        executionOrder.push(current);
        await new Promise(resolve => {
          setTimeout(resolve, 10);
          vi.advanceTimersByTime(10);
        });
        counter = current + 1;
        return counter;
      });

      // Run multiple concurrent operations
      const promises = [
        incrementWithLock(),
        incrementWithLock(),
        incrementWithLock()
      ];

      // Advance timers to complete all operations
      await vi.runAllTimersAsync();

      const results = await Promise.all(promises);

      expect(counter).toBe(3);
      expect(results.sort()).toEqual([1, 2, 3]);
      // Verify they ran sequentially
      expect(executionOrder).toEqual([0, 1, 2]);
    });

    it('should handle exceptions and release lock', async () => {
      const resource = 'helper-error-test';

      const errorFunction = () => withStateLock(resource, async () => {
        throw new Error('Helper test error');
      });

      await expect(errorFunction()).rejects.toThrow('Helper test error');

      // Lock should be released
      expect(stateLockManager.isLocked(resource)).toBe(false);
    });
  });

  describe('clearAll', () => {
    it('should clear all locks and timeouts', async () => {
      const resources = ['resource1', 'resource2', 'resource3'];
      const releases: (() => void)[] = [];

      // Acquire multiple locks
      for (const resource of resources) {
        const release = await stateLockManager.acquire(resource);
        releases.push(release);
        expect(stateLockManager.isLocked(resource)).toBe(true);
      }

      // Clear all
      stateLockManager.clearAll();

      // All should be unlocked
      for (const resource of resources) {
        expect(stateLockManager.isLocked(resource)).toBe(false);
        expect(stateLockManager.getQueueLength(resource)).toBe(0);
      }
    });
  });

  describe('stress testing', () => {
    it('should handle high concurrency scenarios', async () => {
      const resource = 'stress-test';
      const concurrentOperations = 50;
      const results: number[] = [];

      const operations = Array.from({ length: concurrentOperations }, (_, i) =>
        withStateLock(resource, async () => {
          await new Promise(resolve => {
            setTimeout(resolve, 1);
            // Immediately resolve instead of waiting
            resolve(undefined);
          });
          results.push(i);
          return i;
        })
      );

      // Use runAllTimersAsync to handle all pending timers
      const operationPromise = Promise.all(operations);
      await vi.runAllTimersAsync();
      await operationPromise;

      expect(results).toHaveLength(concurrentOperations);
      expect(stateLockManager.isLocked(resource)).toBe(false);
    }, 10000);

    it('should handle mixed timeout scenarios', async () => {
      const resource = 'mixed-timeout-test';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // First lock with short timeout
      const firstRelease = await stateLockManager.acquire(resource, 100);

      // Queue some with longer timeouts - these will be rejected when first lock times out
      const queuedPromise1 = stateLockManager.acquire(resource, 500);
      const queuedPromise2 = stateLockManager.acquire(resource, 500);
      const queuedPromise3 = stateLockManager.acquire(resource, 500);

      // Wait for queue to build
      await vi.waitFor(() => {
        expect(stateLockManager.getQueueLength(resource)).toBe(3);
      });

      // Advance time to trigger timeout on the first acquired lock
      vi.advanceTimersByTime(100);

      // The first lock should timeout and the queue should be cleared
      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Lock timeout for resource')
        );
      });

      // All queued promises should be rejected
      await expect(queuedPromise1).rejects.toThrow('Lock timeout');
      await expect(queuedPromise2).rejects.toThrow('Lock timeout');
      await expect(queuedPromise3).rejects.toThrow('Lock timeout');

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});