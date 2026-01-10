import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { RequestStorage, BaseRequest } from '../requestStorage';

// Test request type
interface TestRequest extends BaseRequest {
  data: string;
}

describe('RequestStorage<T>', () => {
  let storage: RequestStorage<TestRequest>;

  beforeEach(() => {
    fakeBrowser.reset();
    storage = new RequestStorage<TestRequest>({
      storageKey: 'test_requests',
      requestName: 'test request',
    });
  });

  describe('store', () => {
    it('should store a request', async () => {
      const request: TestRequest = {
        id: 'req-1',
        origin: 'https://example.com',
        timestamp: Date.now(),
        data: 'test data',
      };

      await storage.store(request);
      const result = await storage.get('req-1');

      expect(result).toEqual(request);
    });

    it('should store multiple requests', async () => {
      const now = Date.now();
      await storage.store({ id: 'req-1', origin: 'https://a.com', timestamp: now, data: 'a' });
      await storage.store({ id: 'req-2', origin: 'https://b.com', timestamp: now, data: 'b' });

      const all = await storage.getAll();
      expect(all).toHaveLength(2);
    });

    it('should clean up expired requests on store', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      // Store a request
      await storage.store({ id: 'old', origin: 'https://a.com', timestamp: now, data: 'old' });

      // Advance time past TTL (10 minutes)
      vi.setSystemTime(now + 11 * 60 * 1000);

      // Store a new request - should trigger cleanup
      await storage.store({ id: 'new', origin: 'https://b.com', timestamp: now + 11 * 60 * 1000, data: 'new' });

      const all = await storage.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('new');

      vi.useRealTimers();
    });
  });

  describe('get', () => {
    it('should return null for non-existent request', async () => {
      const result = await storage.get('non-existent');
      expect(result).toBeNull();
    });

    it('should return null for expired request', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      await storage.store({ id: 'req-1', origin: 'https://a.com', timestamp: now, data: 'test' });

      // Advance time past TTL
      vi.setSystemTime(now + 11 * 60 * 1000);

      const result = await storage.get('req-1');
      expect(result).toBeNull();

      vi.useRealTimers();
    });

    it('should return request if not expired', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const request: TestRequest = { id: 'req-1', origin: 'https://a.com', timestamp: now, data: 'test' };
      await storage.store(request);

      // Advance time but not past TTL
      vi.setSystemTime(now + 5 * 60 * 1000);

      const result = await storage.get('req-1');
      expect(result).toEqual(request);

      vi.useRealTimers();
    });
  });

  describe('getAll', () => {
    it('should return empty array when no requests', async () => {
      const result = await storage.getAll();
      expect(result).toEqual([]);
    });

    it('should filter out expired requests', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      // Store old request
      await storage.store({ id: 'old', origin: 'https://a.com', timestamp: now - 15 * 60 * 1000, data: 'old' });
      // Store new request
      await storage.store({ id: 'new', origin: 'https://b.com', timestamp: now, data: 'new' });

      const all = await storage.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('new');

      vi.useRealTimers();
    });
  });

  describe('remove', () => {
    it('should remove a request by ID', async () => {
      const now = Date.now();
      await storage.store({ id: 'req-1', origin: 'https://a.com', timestamp: now, data: 'a' });
      await storage.store({ id: 'req-2', origin: 'https://b.com', timestamp: now, data: 'b' });

      await storage.remove('req-1');

      const all = await storage.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('req-2');
    });

    it('should handle removing non-existent request', async () => {
      await expect(storage.remove('non-existent')).resolves.not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all requests', async () => {
      const now = Date.now();
      await storage.store({ id: 'req-1', origin: 'https://a.com', timestamp: now, data: 'a' });
      await storage.store({ id: 'req-2', origin: 'https://b.com', timestamp: now, data: 'b' });

      await storage.clear();

      const all = await storage.getAll();
      expect(all).toEqual([]);
    });

    it('should handle clearing empty storage', async () => {
      await expect(storage.clear()).resolves.not.toThrow();
    });
  });

  describe('concurrency', () => {
    it('should handle concurrent stores safely', async () => {
      const now = Date.now();
      const promises = Array.from({ length: 10 }, (_, i) =>
        storage.store({ id: `req-${i}`, origin: `https://${i}.com`, timestamp: now, data: `data-${i}` })
      );

      await Promise.all(promises);

      const all = await storage.getAll();
      expect(all).toHaveLength(10);
    });

    it('should handle concurrent removes safely', async () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        await storage.store({ id: `req-${i}`, origin: `https://${i}.com`, timestamp: now, data: `data-${i}` });
      }

      const promises = [
        storage.remove('req-0'),
        storage.remove('req-1'),
        storage.remove('req-2'),
      ];

      await Promise.all(promises);

      const all = await storage.getAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('custom TTL', () => {
    it('should respect custom TTL', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      // Create storage with 1 minute TTL
      const shortTtlStorage = new RequestStorage<TestRequest>({
        storageKey: 'short_ttl_requests',
        requestName: 'short TTL request',
        ttlMs: 60 * 1000, // 1 minute
      });

      await shortTtlStorage.store({ id: 'req-1', origin: 'https://a.com', timestamp: now, data: 'test' });

      // After 30 seconds - should still be valid
      vi.setSystemTime(now + 30 * 1000);
      expect(await shortTtlStorage.get('req-1')).not.toBeNull();

      // After 61 seconds - should be expired
      vi.setSystemTime(now + 61 * 1000);
      expect(await shortTtlStorage.get('req-1')).toBeNull();

      vi.useRealTimers();
    });
  });
});
