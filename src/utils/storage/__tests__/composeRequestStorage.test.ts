import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { composeRequestStorage, ComposeRequest } from '../composeRequestStorage';

// Mock chrome.storage.session
const mockStorage: Record<string, any> = {};

vi.stubGlobal('chrome', {
  storage: {
    session: {
      get: vi.fn(async (key: string) => {
        if (typeof key === 'string') {
          return { [key]: mockStorage[key] };
        }
        return mockStorage;
      }),
      set: vi.fn(async (items: Record<string, any>) => {
        Object.assign(mockStorage, items);
      }),
    },
  },
});

describe('composeRequestStorage', () => {
  const STORAGE_KEY = 'pending_compose_requests';

  const createRequest = (overrides?: Partial<ComposeRequest>): ComposeRequest => ({
    id: 'test-id-' + Math.random().toString(36).slice(2),
    type: 'send',
    origin: 'https://example.com',
    params: { asset: 'XCP', amount: 100 },
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear mock storage
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
  });

  describe('store', () => {
    it('should store a new compose request', async () => {
      const request = createRequest({ id: 'req-1' });

      await composeRequestStorage.store(request);

      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        [STORAGE_KEY]: [request],
      });
    });

    it('should append to existing requests', async () => {
      const request1 = createRequest({ id: 'req-1' });
      const request2 = createRequest({ id: 'req-2' });

      // Store first request
      await composeRequestStorage.store(request1);

      // Update mock storage to reflect first store
      mockStorage[STORAGE_KEY] = [request1];

      // Store second request
      await composeRequestStorage.store(request2);

      expect(chrome.storage.session.set).toHaveBeenLastCalledWith({
        [STORAGE_KEY]: [request1, request2],
      });
    });

    it('should filter out expired requests when storing', async () => {
      const oldRequest = createRequest({
        id: 'old-req',
        timestamp: Date.now() - 11 * 60 * 1000, // 11 minutes ago (expired)
      });
      const newRequest = createRequest({ id: 'new-req' });

      mockStorage[STORAGE_KEY] = [oldRequest];

      await composeRequestStorage.store(newRequest);

      // Should only contain the new request (old one expired)
      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        [STORAGE_KEY]: [newRequest],
      });
    });
  });

  describe('get', () => {
    it('should return a request by ID', async () => {
      const request = createRequest({ id: 'find-me' });
      mockStorage[STORAGE_KEY] = [request];

      const result = await composeRequestStorage.get('find-me');

      expect(result).toEqual(request);
    });

    it('should return null for non-existent ID', async () => {
      mockStorage[STORAGE_KEY] = [];

      const result = await composeRequestStorage.get('not-found');

      expect(result).toBeNull();
    });

    it('should return null for expired request', async () => {
      const expiredRequest = createRequest({
        id: 'expired',
        timestamp: Date.now() - 11 * 60 * 1000,
      });
      mockStorage[STORAGE_KEY] = [expiredRequest];

      const result = await composeRequestStorage.get('expired');

      // Expired requests are filtered out by getAll(), so get() returns null
      expect(result).toBeNull();
    });

    it('should return null for empty storage', async () => {
      // No storage key set
      const result = await composeRequestStorage.get('any-id');

      expect(result).toBeNull();
    });
  });

  describe('getAll', () => {
    it('should return all valid requests', async () => {
      const requests = [
        createRequest({ id: 'req-1' }),
        createRequest({ id: 'req-2' }),
        createRequest({ id: 'req-3' }),
      ];
      mockStorage[STORAGE_KEY] = requests;

      const result = await composeRequestStorage.getAll();

      expect(result).toEqual(requests);
    });

    it('should filter out expired requests', async () => {
      const validRequest = createRequest({ id: 'valid' });
      const expiredRequest = createRequest({
        id: 'expired',
        timestamp: Date.now() - 11 * 60 * 1000,
      });
      mockStorage[STORAGE_KEY] = [validRequest, expiredRequest];

      const result = await composeRequestStorage.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('valid');
    });

    it('should return empty array when no requests exist', async () => {
      const result = await composeRequestStorage.getAll();

      expect(result).toEqual([]);
    });

    it('should return empty array for undefined storage', async () => {
      mockStorage[STORAGE_KEY] = undefined;

      const result = await composeRequestStorage.getAll();

      expect(result).toEqual([]);
    });
  });

  describe('getLatestByType', () => {
    it('should return the most recent request of a type', async () => {
      const older = createRequest({
        id: 'older',
        type: 'send',
        timestamp: Date.now() - 5000,
      });
      const newer = createRequest({
        id: 'newer',
        type: 'send',
        timestamp: Date.now(),
      });
      const different = createRequest({
        id: 'different',
        type: 'order',
        timestamp: Date.now() + 1000,
      });

      mockStorage[STORAGE_KEY] = [older, newer, different];

      const result = await composeRequestStorage.getLatestByType('send');

      expect(result).toEqual(newer);
    });

    it('should return null if no requests of type exist', async () => {
      const request = createRequest({ type: 'send' });
      mockStorage[STORAGE_KEY] = [request];

      const result = await composeRequestStorage.getLatestByType('order');

      expect(result).toBeNull();
    });

    it('should return null for empty storage', async () => {
      mockStorage[STORAGE_KEY] = [];

      const result = await composeRequestStorage.getLatestByType('send');

      expect(result).toBeNull();
    });

    it('should work with all request types', async () => {
      const types: ComposeRequest['type'][] = [
        'send', 'mpma', 'order', 'dispenser', 'dispense',
        'fairminter', 'fairmint', 'dividend', 'sweep', 'btcpay',
        'cancel', 'bet', 'broadcast', 'attach', 'detach',
      ];

      for (const type of types) {
        const request = createRequest({ id: `type-${type}`, type });
        mockStorage[STORAGE_KEY] = [request];

        const result = await composeRequestStorage.getLatestByType(type);
        expect(result?.type).toBe(type);
      }
    });
  });

  describe('remove', () => {
    it('should remove a request by ID', async () => {
      const request1 = createRequest({ id: 'keep' });
      const request2 = createRequest({ id: 'remove-me' });
      mockStorage[STORAGE_KEY] = [request1, request2];

      await composeRequestStorage.remove('remove-me');

      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        [STORAGE_KEY]: [request1],
      });
    });

    it('should handle removing non-existent ID gracefully', async () => {
      const request = createRequest({ id: 'exists' });
      mockStorage[STORAGE_KEY] = [request];

      await composeRequestStorage.remove('does-not-exist');

      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        [STORAGE_KEY]: [request],
      });
    });

    it('should handle empty storage', async () => {
      mockStorage[STORAGE_KEY] = [];

      await composeRequestStorage.remove('any-id');

      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        [STORAGE_KEY]: [],
      });
    });
  });

  describe('clear', () => {
    it('should clear all requests', async () => {
      mockStorage[STORAGE_KEY] = [
        createRequest({ id: 'req-1' }),
        createRequest({ id: 'req-2' }),
      ];

      await composeRequestStorage.clear();

      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        [STORAGE_KEY]: [],
      });
    });

    it('should work on already empty storage', async () => {
      await composeRequestStorage.clear();

      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        [STORAGE_KEY]: [],
      });
    });
  });

  describe('TTL behavior', () => {
    it('should accept requests just under the TTL limit', async () => {
      const almostExpired = createRequest({
        id: 'almost-expired',
        timestamp: Date.now() - (10 * 60 * 1000 - 1000), // 9 min 59 sec ago
      });
      mockStorage[STORAGE_KEY] = [almostExpired];

      const result = await composeRequestStorage.get('almost-expired');

      expect(result).toEqual(almostExpired);
    });

    it('should reject requests exactly at TTL limit', async () => {
      const exactlyExpired = createRequest({
        id: 'exactly-expired',
        timestamp: Date.now() - 10 * 60 * 1000, // Exactly 10 minutes ago
      });
      mockStorage[STORAGE_KEY] = [exactlyExpired];

      const result = await composeRequestStorage.get('exactly-expired');

      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle concurrent store operations', async () => {
      // Simulate storing multiple requests quickly
      const requests = Array.from({ length: 5 }, (_, i) =>
        createRequest({ id: `concurrent-${i}` })
      );

      // Store all requests (note: this is a simplified test - real concurrency
      // would require more complex setup with actual async delays)
      for (const request of requests) {
        mockStorage[STORAGE_KEY] = mockStorage[STORAGE_KEY] || [];
        await composeRequestStorage.store(request);
        // Update mock to simulate the stored result
        mockStorage[STORAGE_KEY] = [...(mockStorage[STORAGE_KEY] || [])];
      }

      // All requests should have been processed
      expect(chrome.storage.session.set).toHaveBeenCalledTimes(5);
    });

    it('should handle requests with various param types', async () => {
      const complexParams = {
        asset: 'XCP',
        amount: 100000000,
        destination: 'bc1qtest123',
        memo: 'Test memo with unicode: 日本語',
        options: {
          fee: 1000,
          dust_size: 546,
          nested: { deep: true },
        },
        array: [1, 2, 3],
      };

      const request = createRequest({
        id: 'complex-params',
        params: complexParams,
      });
      mockStorage[STORAGE_KEY] = [request];

      const result = await composeRequestStorage.get('complex-params');

      expect(result?.params).toEqual(complexParams);
    });
  });
});
