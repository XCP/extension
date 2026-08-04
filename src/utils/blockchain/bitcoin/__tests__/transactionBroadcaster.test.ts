import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { broadcastTransaction, computeTxid } from '@/utils/blockchain/bitcoin/transactionBroadcaster';
import { DEFAULT_SETTINGS, getActiveSettings } from '@/utils/settings';

vi.mock('@/utils/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/settings')>()),
  getActiveSettings: vi.fn().mockReturnValue({
    counterpartyApiBase: 'https://api.counterparty.io',
  }),
}));
vi.mock('@/utils/apiClient', () => ({
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
import { apiClient } from '@/utils/apiClient';

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
    it('should broadcast successfully using counterparty endpoint', async () => {
      mockApiClient.post.mockResolvedValue({
        status: 200,
        data: { result: mockTxid }
      });

      const result = await broadcastTransaction(mockSignedTxHex);
      
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.stringContaining('api.counterparty.io'),
        null,
        { headers: { 'Content-Type': 'application/json' } }
      );
    });

    it('should broadcast successfully using blockcypher endpoint', async () => {
      mockApiClient.post
        .mockRejectedValueOnce(new Error('Counterparty failed'))
        .mockResolvedValueOnce({
          status: 201,
          data: { 
            tx: { 
              hash: mockTxid,
              fees: 2500
            }
          }
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
      expect(result.fees).toBe(2500);
      expect(mockApiClient.post).toHaveBeenCalledWith(
        'https://api.blockcypher.com/v1/btc/main/txs/push',
        { tx: mockSignedTxHex },
        { headers: { 'Content-Type': 'application/json' } }
      );
    });

    it('should broadcast successfully using blockstream endpoint', async () => {
      mockApiClient.post
        .mockRejectedValueOnce(new Error('Counterparty failed'))
        .mockRejectedValueOnce(new Error('Blockcypher failed'))
        .mockResolvedValueOnce({
          status: 200,
          data: mockTxid
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
      expect(mockApiClient.post).toHaveBeenCalledWith(
        'https://blockstream.info/api/tx',
        mockSignedTxHex,
        { headers: { 'Content-Type': 'text/plain' } }
      );
    });

    it('should broadcast successfully using mempool endpoint', async () => {
      mockApiClient.post
        .mockRejectedValueOnce(new Error('Counterparty failed'))
        .mockRejectedValueOnce(new Error('Blockcypher failed'))
        .mockRejectedValueOnce(new Error('Blockstream failed'))
        .mockResolvedValueOnce({
          status: 200,
          data: ` ${mockTxid} ` // With whitespace to test trimming
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
      expect(mockApiClient.post).toHaveBeenCalledWith(
        'https://mempool.space/api/tx',
        mockSignedTxHex,
        { headers: { 'Content-Type': 'text/plain' } }
      );
    });

    it('should throw error when all endpoints fail', async () => {
      mockApiClient.post.mockRejectedValue(new Error('Network error'));

      await expect(broadcastTransaction(mockSignedTxHex)).rejects.toThrow(
        'Network error'
      );
    });

    it('should handle HTTP error status codes', async () => {
      mockApiClient.post
        .mockResolvedValueOnce({
          status: 400,
          data: { error: 'Bad request' }
        })
        .mockResolvedValueOnce({
          status: 200,
          data: { tx: { hash: mockTxid } }
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
    });

    it('should handle responses without valid txid', async () => {
      mockApiClient.post
        .mockResolvedValueOnce({
          status: 200,
          data: { result: null } // No valid txid
        })
        .mockResolvedValueOnce({
          status: 200,
          data: { tx: { hash: mockTxid } }
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
    });

    it('should handle empty response data', async () => {
      mockApiClient.post
        .mockResolvedValueOnce({
          status: 200,
          data: null
        })
        .mockResolvedValueOnce({
          status: 200,
          data: { tx: { hash: mockTxid } }  // blockcypher format
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
    });

    it('should properly encode URL parameters for counterparty', async () => {
      const specialCharHex = 'abc+def/123=456';
      mockApiClient.post.mockResolvedValue({
        status: 200,
        data: { result: mockTxid }
      });

      await broadcastTransaction(specialCharHex);
      
      const expectedUrl = expect.stringContaining('signedhex=abc%2Bdef%2F123%3D456');
      expect(mockApiClient.post).toHaveBeenCalledWith(
        expectedUrl,
        null,
        { headers: { 'Content-Type': 'application/json' } }
      );
    });

    it('should handle network timeout errors', async () => {
      mockApiClient.post
        .mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' })
        .mockResolvedValueOnce({
          status: 200,
          data: { tx: { hash: mockTxid } }  // blockcypher format
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
    });

    it('should handle malformed JSON responses', async () => {
      mockApiClient.post
        .mockRejectedValueOnce(new Error('JSON parse error'))
        .mockResolvedValueOnce({
          status: 200,
          data: { tx: { hash: mockTxid } }
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
    });

    it('should handle response format differences correctly', async () => {
      // Test counterparty format
      mockApiClient.post.mockResolvedValueOnce({
        status: 200,
        data: { result: mockTxid }
      });

      let result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
      expect(result.fees).toBeUndefined();

      // Reset and test blockcypher format
      vi.clearAllMocks();
      mockApiClient.post
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce({
          status: 200,
          data: { 
            tx: { 
              hash: mockTxid,
              fees: 1500
            }
          }
        });

      result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));
      expect(result.fees).toBe(1500);
    });

    it('should handle custom counterparty API base URL', async () => {
      // Clear the default mock and set a new one before the test
      mockGetSettings.mockClear();
      mockGetSettings.mockReturnValue({
        ...DEFAULT_SETTINGS,
        counterpartyApiBase: 'https://custom.api.com', // Custom API for this test
      });

      mockApiClient.post.mockResolvedValue({
        status: 200,
        data: { result: mockTxid }
      });

      await broadcastTransaction(mockSignedTxHex);
      
      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.stringContaining('custom.api.com'),
        null,
        { headers: { 'Content-Type': 'application/json' } }
      );
    });

    it('should handle very long transaction hex', async () => {
      const longHex = 'a'.repeat(10000);
      mockApiClient.post.mockResolvedValue({
        status: 200,
        data: { result: mockTxid }
      });

      const result = await broadcastTransaction(longHex);
      // Unparseable hex: no local txid computable, so fall back to the endpoint's.
      expect(result.txid).toBe(mockTxid);
    });

    it('should handle successful response with status code edge cases', async () => {
      // Test status 201 (Created)
      mockApiClient.post.mockResolvedValueOnce({
        status: 201,
        data: { result: mockTxid }
      });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));

      // Test status 202 (Accepted)
      vi.clearAllMocks();
      // Re-setup the settings mock after clearing
      mockGetSettings.mockReturnValue(DEFAULT_SETTINGS);
      // Test blockstream format for 202
      mockApiClient.post
        .mockRejectedValueOnce(new Error('First failed'))  // counterparty fails
        .mockRejectedValueOnce(new Error('Second failed'))  // blockcypher fails
        .mockResolvedValueOnce({
          status: 202,
          data: mockTxid  // blockstream returns plain string
        });

      const result2 = await broadcastTransaction(mockSignedTxHex);
      expect(result2.txid).toBe(computeTxid(mockSignedTxHex));
    });
  });

  describe('error handling', () => {
    it('should preserve last error message when all endpoints fail', async () => {
      const specificError = 'Transaction already exists';
      mockApiClient.post
        .mockRejectedValueOnce(new Error('First error'))
        .mockRejectedValueOnce(new Error('Second error'))
        .mockRejectedValueOnce(new Error('Third error'))
        .mockRejectedValueOnce(new Error(specificError));

      await expect(broadcastTransaction(mockSignedTxHex)).rejects.toThrow(specificError);
    });

    it('should handle unknown endpoint format gracefully', async () => {
      // This test simulates an internal error in formatResponse
      mockApiClient.post.mockResolvedValue({
        status: 200,
        data: { result: mockTxid }
      });

      // Mock a scenario where formatResponse would throw
      const originalConsoleError = console.error;
      console.error = vi.fn();

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(computeTxid(mockSignedTxHex));

      console.error = originalConsoleError;
    });

    it('should handle axios request config errors', async () => {
      mockApiClient.post.mockRejectedValue({
        config: {},
        request: {},
        response: {
          status: 500,
          data: 'Internal server error'
        }
      });

      await expect(broadcastTransaction(mockSignedTxHex)).rejects.toThrow();
    });
  });
});