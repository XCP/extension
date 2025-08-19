import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateNonce,
  validateNonce,
  generateIdempotencyKey,
  checkReplayAttempt,
  recordTransaction,
  markTransactionBroadcasted,
  markTransactionFailed,
  isTransactionBroadcasted,
  withReplayPrevention,
  getTransactionStats,
  clearReplayPreventionData,
  _testStore
} from '../replayPrevention';

// Mock fathom tracking
vi.mock('@/utils/fathom', () => ({
  trackEvent: vi.fn()
}));

describe('replayPrevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearReplayPreventionData(); // Clear state between tests
  });

  afterEach(() => {
    clearReplayPreventionData();
  });

  describe('nonce management', () => {
    it('should generate sequential nonces', () => {
      const origin = 'https://test.com';
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

      const nonce1 = generateNonce(origin, address);
      const nonce2 = generateNonce(origin, address);
      const nonce3 = generateNonce(origin, address);

      expect(nonce1).toBe(1);
      expect(nonce2).toBe(2);
      expect(nonce3).toBe(3);
    });

    it('should validate correct nonces', () => {
      const origin = 'https://test.com';
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

      // Generate nonce 1
      generateNonce(origin, address);

      // Validate next expected nonce (2)
      expect(validateNonce(origin, address, 2)).toBe(true);
      expect(validateNonce(origin, address, 1)).toBe(false); // old nonce
      expect(validateNonce(origin, address, 3)).toBe(false); // future nonce
    });

    it('should handle separate nonces per origin/address pair', () => {
      const origin1 = 'https://test1.com';
      const origin2 = 'https://test2.com';
      const address1 = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const address2 = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';

      const nonce1 = generateNonce(origin1, address1);
      const nonce2 = generateNonce(origin2, address1);
      const nonce3 = generateNonce(origin1, address2);

      // All should be 1 since they're different combinations
      expect(nonce1).toBe(1);
      expect(nonce2).toBe(1);
      expect(nonce3).toBe(1);

      // Validate next nonces
      expect(validateNonce(origin1, address1, 2)).toBe(true);
      expect(validateNonce(origin2, address1, 2)).toBe(true);
      expect(validateNonce(origin1, address2, 2)).toBe(true);
    });
  });

  describe('idempotency key generation', () => {
    it('should generate consistent keys for same inputs', () => {
      const origin = 'https://test.com';
      const method = 'xcp_composeSend';
      const params = [{ asset: 'XCP', quantity: 100 }];

      const key1 = generateIdempotencyKey(origin, method, params);
      const key2 = generateIdempotencyKey(origin, method, params);

      // Should be the same within the same second
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^idem_[a-z0-9]+_\d+$/);
    });

    it('should generate different keys for different inputs', () => {
      const origin = 'https://test.com';
      const method = 'xcp_composeSend';
      const params1 = [{ asset: 'XCP', quantity: 100 }];
      const params2 = [{ asset: 'XCP', quantity: 200 }];

      const key1 = generateIdempotencyKey(origin, method, params1);
      const key2 = generateIdempotencyKey(origin, method, params2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('replay attack detection', () => {
    it('should detect identical recent requests', async () => {
      const origin = 'https://test.com';
      const method = 'xcp_composeSend';
      const params = [{ asset: 'XCP', quantity: 100 }];

      // Record first request
      recordTransaction('tx1', origin, method, params, { status: 'pending' });

      // Check for replay immediately after
      const result = await checkReplayAttempt(origin, method, params);

      expect(result.isReplay).toBe(true);
      expect(result.reason).toContain('Identical request made within the last 5 minutes');
    });

    it('should not flag old requests as replays', async () => {
      const origin = 'https://test.com';
      const method = 'xcp_composeSend';
      const params = [{ asset: 'XCP', quantity: 100 }];

      // Mock an old transaction (more than 5 minutes ago)
      const oldTimestamp = Date.now() - (6 * 60 * 1000);
      vi.spyOn(Date, 'now').mockReturnValueOnce(oldTimestamp);
      recordTransaction('tx1', origin, method, params, { status: 'broadcasted' });
      vi.restoreAllMocks();

      // Check for replay now
      const result = await checkReplayAttempt(origin, method, params);

      expect(result.isReplay).toBe(false);
    });

    it('should validate nonces when required', async () => {
      const origin = 'https://test.com';
      const method = 'xcp_composeSend';
      const params = [{ asset: 'XCP', quantity: 100 }];
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

      // Generate a nonce first
      generateNonce(origin, address);

      // Check replay with correct next nonce
      const result1 = await checkReplayAttempt(origin, method, params, {
        requireNonce: true,
        nonce: 2,
        address
      });

      expect(result1.isReplay).toBe(false);

      // Check replay with incorrect nonce
      const result2 = await checkReplayAttempt(origin, method, params, {
        requireNonce: true,
        nonce: 1,
        address
      });

      expect(result2.isReplay).toBe(true);
      expect(result2.reason).toContain('Invalid nonce');
    });

    it('should handle idempotency keys', async () => {
      const origin = 'https://test.com';
      const method = 'xcp_composeSend';
      const params = [{ asset: 'XCP', quantity: 100 }];
      const key = generateIdempotencyKey(origin, method, params);

      // Record successful response
      const mockResponse = { txid: 'tx1' };
      _testStore.addIdempotencyKey({
        key,
        origin,
        method,
        response: mockResponse,
        timestamp: Date.now(),
        expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour
      });

      // Check for replay with same key
      const result = await checkReplayAttempt(origin, method, params, {
        idempotencyKey: key
      });

      expect(result.isReplay).toBe(true);
      expect(result.cachedResponse).toEqual(mockResponse);
    });
  });

  describe('transaction recording', () => {
    it('should record transactions', () => {
      const txid = 'tx123';
      const origin = 'https://test.com';
      const method = 'xcp_broadcastTransaction';
      const params = [{ signedTx: 'hex...' }];

      recordTransaction(txid, origin, method, params, { status: 'pending' });

      expect(_testStore.hasTransaction(txid)).toBe(true);
      expect(isTransactionBroadcasted(txid)).toBe(false);
    });

    it('should update transaction status', () => {
      const txid = 'tx123';
      const origin = 'https://test.com';
      const method = 'xcp_broadcastTransaction';
      const params = [{ signedTx: 'hex...' }];

      recordTransaction(txid, origin, method, params, { status: 'pending' });
      markTransactionBroadcasted(txid);

      expect(isTransactionBroadcasted(txid)).toBe(true);
    });

    it('should handle failed transactions', () => {
      const txid = 'tx123';
      const origin = 'https://test.com';
      const method = 'xcp_broadcastTransaction';
      const params = [{ signedTx: 'hex...' }];

      recordTransaction(txid, origin, method, params, { status: 'pending' });
      markTransactionFailed(txid);

      const transaction = _testStore.getTransaction(txid);
      expect(transaction?.status).toBe('failed');
    });
  });

  describe('withReplayPrevention wrapper', () => {
    it('should execute handler when no replay detected', async () => {
      const origin = 'https://test.com';
      const method = 'xcp_composeSend';
      const params = [{ asset: 'XCP', quantity: 100 }];
      const mockResult = { txid: 'tx123' };

      const handler = vi.fn().mockResolvedValue(mockResult);

      const result = await withReplayPrevention(origin, method, params, handler);

      expect(handler).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });

    it('should return cached response for idempotent requests', async () => {
      const origin = 'https://test.com';
      const method = 'xcp_composeSend';
      const params = [{ asset: 'XCP', quantity: 100 }];
      const mockResult = { txid: 'tx123' };

      const handler = vi.fn().mockResolvedValue(mockResult);

      // First call
      const result1 = await withReplayPrevention(origin, method, params, handler, {
        generateIdempotencyKey: true
      });

      // Second call with same params
      const result2 = await withReplayPrevention(origin, method, params, handler, {
        generateIdempotencyKey: true
      });

      expect(handler).toHaveBeenCalledTimes(1); // Only called once
      expect(result1).toEqual(mockResult);
      expect(result2).toEqual(mockResult);
    });

    it('should throw error for non-idempotent replays', async () => {
      const origin = 'https://test.com';
      const method = 'xcp_broadcastTransaction';
      const params = [{ signedTx: 'hex...' }];

      // Record a recent transaction
      recordTransaction('tx1', origin, method, params, { status: 'pending' });

      const handler = vi.fn();

      await expect(
        withReplayPrevention(origin, method, params, handler)
      ).rejects.toThrow('Request rejected: Identical request made within the last 5 minutes');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should generate and validate nonces when required', async () => {
      const origin = 'https://test.com';
      const method = 'xcp_composeSend';
      const params = [{ asset: 'XCP', quantity: 100 }];
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const mockResult = { txid: 'tx123' };

      const handler = vi.fn().mockResolvedValue(mockResult);

      const result = await withReplayPrevention(origin, method, params, handler, {
        requireNonce: true,
        address
      });

      expect(handler).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });

    it('should handle handler errors', async () => {
      const origin = 'https://test.com';
      const method = 'xcp_composeSend';
      const params = [{ asset: 'XCP', quantity: 100 }];
      const error = new Error('Handler failed');

      const handler = vi.fn().mockRejectedValue(error);

      await expect(
        withReplayPrevention(origin, method, params, handler)
      ).rejects.toThrow('Handler failed');
    });
  });

  describe('transaction statistics', () => {
    it('should return correct stats', () => {
      // Record various transactions
      recordTransaction('tx1', 'https://test.com', 'method1', [], { status: 'pending' });
      recordTransaction('tx2', 'https://test.com', 'method2', [], { status: 'broadcasted' });
      recordTransaction('tx3', 'https://test.com', 'method3', [], { status: 'failed' });

      markTransactionBroadcasted('tx2');
      markTransactionFailed('tx3');

      const stats = getTransactionStats();

      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.broadcasted).toBe(1);
      expect(stats.failed).toBe(1);
    });

    it('should handle empty stats', () => {
      const stats = getTransactionStats();

      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.broadcasted).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('cleanup and maintenance', () => {
    it('should clear all data', () => {
      // Add some data
      recordTransaction('tx1', 'https://test.com', 'method', [], { status: 'pending' });
      generateNonce('https://test.com', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');

      // Clear data
      clearReplayPreventionData();

      // Verify it's cleared
      const stats = getTransactionStats();
      expect(stats.total).toBe(0);

      const newNonce = generateNonce('https://test.com', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      expect(newNonce).toBe(1); // Should start from 1 again
    });
  });
});