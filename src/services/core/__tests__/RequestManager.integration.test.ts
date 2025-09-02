/**
 * Integration test to verify RequestManager fixes memory leaks
 */

import { describe, it, expect, beforeEach, afterEach, test } from 'vitest';
import { RequestManager } from '../RequestManager';

describe('RequestManager Integration', () => {
  let requestManager: RequestManager;

  beforeEach(() => {
    requestManager = new RequestManager(1000, 100); // 1s timeout, 100ms cleanup
  });

  afterEach(async () => {
    if (requestManager) {
      // Clear without rejecting to avoid unhandled promise rejections
      requestManager.clear(false);
      requestManager.destroy();
    }
  });

  test('should handle multiple concurrent requests without memory leak', async () => {
    const promises: Promise<any>[] = [];
    const results: any[] = [];

    // Create multiple concurrent requests
    for (let i = 0; i < 10; i++) {
      const id = `request-${i}`;
      const promise = requestManager.createManagedPromise<string>(id, {
        origin: `https://example${i}.com`,
        method: 'test_method',
      });
      promises.push(promise);

      // Resolve some immediately, let others timeout
      if (i % 3 === 0) {
        setTimeout(() => {
          requestManager.resolve(id, `result-${i}`);
        }, 50);
      }
    }

    // Wait for all promises to resolve or reject
    const settled = await Promise.allSettled(promises);
    
    // Check that some resolved and some were rejected (timeout)
    const resolved = settled.filter(p => p.status === 'fulfilled');
    const rejected = settled.filter(p => p.status === 'rejected');

    expect(resolved.length).toBeGreaterThan(0);
    expect(rejected.length).toBeGreaterThan(0);
    expect(resolved.length + rejected.length).toBe(10);

    // Verify no memory leak - all requests should be cleaned up
    expect(requestManager.size()).toBe(0);
  });

  test('should automatically clean up expired requests', async () => {
    const id1 = 'request-1';
    const id2 = 'request-2';

    // Create two requests
    const promise1 = requestManager.createManagedPromise<string>(id1);
    const promise2 = requestManager.createManagedPromise<string>(id2);

    expect(requestManager.size()).toBe(2);

    // Resolve one request
    requestManager.resolve(id1, 'resolved');
    await expect(promise1).resolves.toBe('resolved');

    // Wait for the other to timeout and be cleaned up
    await expect(promise2).rejects.toThrow('Request timeout');

    // Verify cleanup
    expect(requestManager.size()).toBe(0);
  });

  test('should provide useful statistics', () => {
    // Add some requests
    requestManager.createManagedPromise('req1', {
      origin: 'https://example.com',
      method: 'method1',
    });
    requestManager.createManagedPromise('req2', {
      origin: 'https://example.com', 
      method: 'method2',
    });
    requestManager.createManagedPromise('req3', {
      origin: 'https://other.com',
      method: 'method1',
    });

    const stats = requestManager.getStats();

    expect(stats.total).toBe(3);
    expect(stats.byOrigin['https://example.com']).toBe(2);
    expect(stats.byOrigin['https://other.com']).toBe(1);
    expect(stats.byMethod['method1']).toBe(2);
    expect(stats.byMethod['method2']).toBe(1);
    expect(stats.oldest).toBeGreaterThanOrEqual(0);
    expect(stats.newest).toBeGreaterThanOrEqual(0);
  });

  test('should handle edge cases gracefully', () => {
    // Resolving non-existent request
    expect(requestManager.resolve('nonexistent', 'value')).toBe(false);
    expect(requestManager.reject('nonexistent', new Error('error'))).toBe(false);

    // Double resolution
    const id = 'test-request';
    const promise = requestManager.createManagedPromise<string>(id);
    
    expect(requestManager.resolve(id, 'first')).toBe(true);
    expect(requestManager.resolve(id, 'second')).toBe(false); // Should be false, already resolved

    return expect(promise).resolves.toBe('first');
  });
});