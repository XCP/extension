import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { broadcastTransaction, computeTxid } from '@/core/bitcoin/transactionBroadcaster';
import { DEFAULT_SETTINGS, getActiveSettings } from '@/core/settings';

vi.mock('@/core/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/settings')>()),
  getActiveSettings: vi.fn().mockReturnValue({
    counterpartyApiBase: 'https://api.counterparty.io',
  }),
}));
vi.mock('@/core/api/client', () => ({
  apiClient: {
    post: vi.fn()
  },
  withRetry: vi.fn((fn) => fn()),
  API_TIMEOUTS: {
    BROADCAST: 45000
  },
  isApiError: vi.fn((error: unknown): boolean => {
    return error instanceof Error && 'response' in error;
  }),
  isCancel: vi.fn(() => false)
}));


// Import the mocked modules
import { apiClient } from '@/core/api/client';

const mockApiClient = apiClient as any;
const mockGetSettings = vi.mocked(getActiveSettings);

describe('Transaction Broadcaster Utilities', () => {
  // A real, parseable transaction (the genesis coinbase) so the broadcaster's
  // locally-computed txid is well-defined. Endpoints echo a different mockTxid,
  // which the broadcaster must ignore in favor of the computed value.
  const mockSignedTxHex = '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000';
  const mockTxid = 'abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for all tests - use DEFAULT_SETTINGS as base
    mockGetSettings.mockReturnValue(DEFAULT_SETTINGS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('computeTxid', () => {
    it('computes the canonical txid of the genesis coinbase', () => {
      const genesisCoinbase =
        '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000';
      expect(computeTxid(genesisCoinbase)).toBe(
        '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b'
      );
    });

    it('returns null for unparseable hex', () => {
      expect(computeTxid('not-a-transaction')).toBeNull();
    });
  });

  describe('broadcastTransaction in dry run mode', () => {
    beforeEach(() => {
      mockGetSettings.mockReturnValue({
        ...DEFAULT_SETTINGS,
        transactionDryRun: true, // Enable dry run for this test suite
      });
    });

    it('should return mock transaction response in dry run mode', async () => {
      const result = await broadcastTransaction(mockSignedTxHex);
      
      expect(result.txid).toMatch(/^dev_mock_tx_/);
      expect(result.fees).toBe(1000);
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });

    it('should simulate error when FORCE_ERROR_HEX is included', async () => {
      const errorHex = mockSignedTxHex + 'FORCE_ERROR';
      
      await expect(broadcastTransaction(errorHex)).rejects.toThrow(
        'Simulated broadcast error for testing'
      );
    });

    it('should generate consistent mock txid for same input', async () => {
      const result1 = await broadcastTransaction(mockSignedTxHex);
      
      // Wait a small amount to ensure timestamp differs
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result2 = await broadcastTransaction(mockSignedTxHex);
      
      // Should have same prefix but different timestamp
      expect(result1.txid.startsWith('dev_mock_tx_01000000')).toBe(true);
      expect(result2.txid.startsWith('dev_mock_tx_01000000')).toBe(true);
      expect(result1.txid).not.toBe(result2.txid); // Different due to timestamp
    });

    it('should include simulated delay', async () => {
      const startTime = Date.now();
      await broadcastTransaction(mockSignedTxHex);
      const endTime = Date.now();
      const elapsed = endTime - startTime;

      // Allow for small timing variations (490-510ms range)
      expect(elapsed).toBeGreaterThanOrEqual(490);
      expect(elapsed).toBeLessThanOrEqual(520);
    });
  });

  describe('broadcastTransaction with real endpoints', () => {
    const accepted = (data: unknown) => ({ status: 200, data });
    const apiRejection = (data: unknown, status = 503) =>
      Object.assign(new Error(typeof data === 'string' ? data : 'HTTP error'), {
        code: 'HTTP_ERROR',
        status,
        response: { data, status },
      });
    const urlsCalled = () => mockApiClient.post.mock.calls.map((call: unknown[]) => String(call[0]));

    it('accepts through the Counterparty node and then feeds both public relays', async () => {
      mockApiClient.post
        .mockResolvedValueOnce(accepted({ result: mockTxid }))
        .mockResolvedValueOnce(accepted(mockTxid))
        .mockResolvedValueOnce(accepted(mockTxid));

      const result = await broadcastTransaction(mockSignedTxHex);

      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
      expect(urlsCalled()).toEqual([
        expect.stringContaining('/v2/bitcoin/transactions?signedhex='),
        'https://blockstream.info/api/tx',
        'https://mempool.space/api/tx',
      ]);
    });

    it('sends each broadcast exactly once, with the broadcast timeout and no client-side retry', async () => {
      mockApiClient.post
        .mockResolvedValueOnce(accepted({ result: mockTxid }))
        .mockResolvedValue(accepted(mockTxid));

      await broadcastTransaction(mockSignedTxHex);

      expect(mockApiClient.post).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('api.counterparty.io'),
        null,
        { headers: { 'Content-Type': 'application/json' }, timeout: 45000, retries: 0 },
      );
      expect(mockApiClient.post).toHaveBeenNthCalledWith(
        2,
        'https://blockstream.info/api/tx',
        mockSignedTxHex,
        { headers: { 'Content-Type': 'text/plain' }, timeout: 10000, retries: 0 },
      );
    });

    it('treats a node that already holds the transaction as a successful broadcast', async () => {
      // The Counterparty node accepted a first send whose response was lost; Core wraps the
      // node's answer to the repeat as a retryable 503.
      mockApiClient.post
        .mockRejectedValueOnce(apiRejection({ error: 'Error broadcasting transaction: txn-already-in-mempool' }))
        .mockResolvedValue(accepted(mockTxid));

      const result = await broadcastTransaction(mockSignedTxHex);

      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
      expect(urlsCalled()).toHaveLength(3);
    });

    it('recognises a relay that already saw the transaction in a block', async () => {
      mockApiClient.post
        .mockRejectedValueOnce(new Error('Counterparty failed'))
        .mockRejectedValueOnce(apiRejection(
          'sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}',
          400,
        ))
        .mockResolvedValue(accepted(mockTxid));

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
    });

    it('falls through to a public relay when the Counterparty node is down, and still feeds the other', async () => {
      mockApiClient.post
        .mockRejectedValueOnce(new Error('Counterparty failed'))
        .mockResolvedValueOnce(accepted(mockTxid))
        .mockResolvedValueOnce(accepted(mockTxid));

      const result = await broadcastTransaction(mockSignedTxHex);

      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
      expect(urlsCalled()).toEqual([
        expect.stringContaining('api.counterparty.io'),
        'https://blockstream.info/api/tx',
        'https://mempool.space/api/tx',
      ]);
    });

    it('does not let a failing relay fan-out change a successful outcome', async () => {
      mockApiClient.post
        .mockResolvedValueOnce(accepted({ result: mockTxid }))
        .mockRejectedValueOnce(new Error('blockstream down'))
        .mockRejectedValueOnce(apiRejection('Transaction rate limit', 429));

      await expect(broadcastTransaction(mockSignedTxHex)).resolves.toEqual({
        txid: computeTxid(mockSignedTxHex),
      });
    });

    it('never pushes to BlockCypher', async () => {
      mockApiClient.post.mockRejectedValue(new Error('Network error'));

      await expect(broadcastTransaction(mockSignedTxHex)).rejects.toThrow();
      expect(urlsCalled().some((url: string) => url.includes('blockcypher'))).toBe(false);
    });

    it('throws the first endpoint rejection when every endpoint refuses', async () => {
      mockApiClient.post
        .mockRejectedValueOnce(apiRejection({ error: 'Error broadcasting transaction: min relay fee not met' }))
        .mockRejectedValueOnce(apiRejection('min relay fee not met', 400))
        .mockRejectedValueOnce(apiRejection('min relay fee not met', 400));

      await expect(broadcastTransaction(mockSignedTxHex)).rejects.toThrow(
        'Error broadcasting transaction: min relay fee not met',
      );
    });

    it('throws a plain network error when no endpoint answered at all', async () => {
      mockApiClient.post.mockRejectedValue(new Error('Network error'));

      await expect(broadcastTransaction(mockSignedTxHex)).rejects.toThrow('Network error');
      expect(mockApiClient.post).toHaveBeenCalledTimes(3);
    });

    it('treats a non-2xx response as a refusal and moves on', async () => {
      mockApiClient.post
        .mockResolvedValueOnce({ status: 400, data: { error: 'Bad request' } })
        .mockResolvedValue(accepted(mockTxid));

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
    });

    it('treats an acceptance without a txid echo as a refusal', async () => {
      mockApiClient.post
        .mockResolvedValueOnce(accepted({ result: null }))
        .mockResolvedValueOnce(accepted(''))
        .mockResolvedValueOnce(accepted(mockTxid));

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
      expect(urlsCalled()).toHaveLength(3);
    });

    it('properly encodes the hex into the Counterparty URL', async () => {
      const hexWithSpecialChars = mockSignedTxHex + '&test=value';
      mockApiClient.post.mockResolvedValue(accepted({ result: mockTxid }));

      await broadcastTransaction(hexWithSpecialChars);

      expect(mockApiClient.post).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(encodeURIComponent(hexWithSpecialChars)),
        null,
        expect.any(Object),
      );
    });

    it('reports the locally computed txid rather than the endpoint echo', async () => {
      mockApiClient.post.mockResolvedValue(accepted({ result: 'not-the-real-id' }));

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
      expect(result.txid).not.toBe('not-the-real-id');
    });
  });
});
