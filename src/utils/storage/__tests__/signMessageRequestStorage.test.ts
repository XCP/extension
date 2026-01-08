import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signMessageRequestStorage, SignMessageRequest } from '../signMessageRequestStorage';

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

describe('signMessageRequestStorage', () => {
  const STORAGE_KEY = 'pending_sign_message_requests';

  const createRequest = (overrides?: Partial<SignMessageRequest>): SignMessageRequest => ({
    id: 'test-id-' + Math.random().toString(36).slice(2),
    origin: 'https://example.com',
    message: 'Sign this message',
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear mock storage
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
  });

  describe('store', () => {
    it('should store a new sign message request', async () => {
      const request = createRequest({ id: 'req-1' });

      await signMessageRequestStorage.store(request);

      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        [STORAGE_KEY]: [request],
      });
    });

    it('should append to existing requests', async () => {
      const request1 = createRequest({ id: 'req-1' });
      const request2 = createRequest({ id: 'req-2' });

      await signMessageRequestStorage.store(request1);
      mockStorage[STORAGE_KEY] = [request1];

      await signMessageRequestStorage.store(request2);

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

      await signMessageRequestStorage.store(newRequest);

      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        [STORAGE_KEY]: [newRequest],
      });
    });

    it('should handle unicode messages', async () => {
      const request = createRequest({
        id: 'unicode-req',
        message: 'Sign this: 日本語 🚀 émojis',
      });

      await signMessageRequestStorage.store(request);

      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        [STORAGE_KEY]: [request],
      });
    });

    it('should handle very long messages', async () => {
      const longMessage = 'x'.repeat(10000);
      const request = createRequest({
        id: 'long-msg',
        message: longMessage,
      });

      await signMessageRequestStorage.store(request);

      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        [STORAGE_KEY]: [request],
      });
    });
  });

  describe('get', () => {
    it('should return a request by ID', async () => {
      const request = createRequest({ id: 'find-me' });
      mockStorage[STORAGE_KEY] = [request];

      const result = await signMessageRequestStorage.get('find-me');

      expect(result).toEqual(request);
    });

    it('should return null for non-existent ID', async () => {
      mockStorage[STORAGE_KEY] = [];

      const result = await signMessageRequestStorage.get('not-found');

      expect(result).toBeNull();
    });

    it('should return null for expired request', async () => {
      const expiredRequest = createRequest({
        id: 'expired',
        timestamp: Date.now() - 11 * 60 * 1000,
      });
      mockStorage[STORAGE_KEY] = [expiredRequest];

      const result = await signMessageRequestStorage.get('expired');

      // Expired requests are filtered out by getAll()
      expect(result).toBeNull();
    });

    it('should return null for empty storage', async () => {
      const result = await signMessageRequestStorage.get('any-id');

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

      const result = await signMessageRequestStorage.getAll();

      expect(result).toEqual(requests);
    });

    it('should filter out expired requests', async () => {
      const validRequest = createRequest({ id: 'valid' });
      const expiredRequest = createRequest({
        id: 'expired',
        timestamp: Date.now() - 11 * 60 * 1000,
      });
      mockStorage[STORAGE_KEY] = [validRequest, expiredRequest];

      const result = await signMessageRequestStorage.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('valid');
    });

    it('should return empty array when no requests exist', async () => {
      const result = await signMessageRequestStorage.getAll();

      expect(result).toEqual([]);
    });

    it('should return empty array for undefined storage', async () => {
      mockStorage[STORAGE_KEY] = undefined;

      const result = await signMessageRequestStorage.getAll();

      expect(result).toEqual([]);
    });
  });

  describe('remove', () => {
    it('should remove a request by ID', async () => {
      const request1 = createRequest({ id: 'keep' });
      const request2 = createRequest({ id: 'remove-me' });
      mockStorage[STORAGE_KEY] = [request1, request2];

      await signMessageRequestStorage.remove('remove-me');

      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        [STORAGE_KEY]: [request1],
      });
    });

    it('should handle removing non-existent ID gracefully', async () => {
      const request = createRequest({ id: 'exists' });
      mockStorage[STORAGE_KEY] = [request];

      await signMessageRequestStorage.remove('does-not-exist');

      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        [STORAGE_KEY]: [request],
      });
    });

    it('should handle empty storage', async () => {
      mockStorage[STORAGE_KEY] = [];

      await signMessageRequestStorage.remove('any-id');

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

      await signMessageRequestStorage.clear();

      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        [STORAGE_KEY]: [],
      });
    });

    it('should work on already empty storage', async () => {
      await signMessageRequestStorage.clear();

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

      const result = await signMessageRequestStorage.get('almost-expired');

      expect(result).toEqual(almostExpired);
    });

    it('should reject requests exactly at TTL limit', async () => {
      const exactlyExpired = createRequest({
        id: 'exactly-expired',
        timestamp: Date.now() - 10 * 60 * 1000,
      });
      mockStorage[STORAGE_KEY] = [exactlyExpired];

      const result = await signMessageRequestStorage.get('exactly-expired');

      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle multiple requests from same origin', async () => {
      const requests = [
        createRequest({ id: 'req-1', origin: 'https://same.com' }),
        createRequest({ id: 'req-2', origin: 'https://same.com' }),
        createRequest({ id: 'req-3', origin: 'https://same.com' }),
      ];
      mockStorage[STORAGE_KEY] = requests;

      const result = await signMessageRequestStorage.getAll();

      expect(result).toHaveLength(3);
      expect(result.every(r => r.origin === 'https://same.com')).toBe(true);
    });

    it('should handle requests from different origins', async () => {
      const requests = [
        createRequest({ id: 'req-1', origin: 'https://site-a.com' }),
        createRequest({ id: 'req-2', origin: 'https://site-b.com' }),
        createRequest({ id: 'req-3', origin: 'https://site-c.com' }),
      ];
      mockStorage[STORAGE_KEY] = requests;

      const result = await signMessageRequestStorage.getAll();

      expect(result).toHaveLength(3);
    });

    it('should handle empty message', async () => {
      const request = createRequest({
        id: 'empty-msg',
        message: '',
      });
      mockStorage[STORAGE_KEY] = [request];

      const result = await signMessageRequestStorage.get('empty-msg');

      expect(result).toEqual(request);
    });

    it('should preserve message formatting', async () => {
      const formattedMessage = `Line 1
Line 2
  Indented
\tTabbed`;
      const request = createRequest({
        id: 'formatted',
        message: formattedMessage,
      });
      mockStorage[STORAGE_KEY] = [request];

      const result = await signMessageRequestStorage.get('formatted');

      expect(result?.message).toBe(formattedMessage);
    });
  });
});
