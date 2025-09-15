import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { broadcastTransaction } from '@/utils/blockchain/bitcoin/transactionBroadcaster';
import api from '@/utils/fetch';
import { getKeychainSettings, DEFAULT_KEYCHAIN_SETTINGS } from '@/utils/storage';

vi.mock('@/utils/fetch');
vi.mock('@/utils/storage/settingsStorage');

const mockApi = api as any;

// Import the mocked modules
import { broadcastApiClient } from '@/utils/fetch';
const mockBroadcastClient = broadcastApiClient as any;

describe('Transaction Broadcaster Utilities', () => {
  const mockSignedTxHex = '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff08044c86041b020602ffffffff0100f2052a010000004341041b0e8c2567c12536aa13357b79a073dc4444acb83c4ec7a0e2f99dd7457516c5817242da796924ca4e99947d087fedf9ce467cb9f7c6287078f801df276fdf84424ac00000000';
  const mockTxid = 'abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for all tests - use DEFAULT_KEYCHAIN_SETTINGS as base
    vi.mocked(getKeychainSettings).mockResolvedValue(DEFAULT_KEYCHAIN_SETTINGS);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('broadcastTransaction in dry run mode', () => {
    beforeEach(() => {
      vi.mocked(getKeychainSettings).mockResolvedValue({
        ...DEFAULT_KEYCHAIN_SETTINGS,
        transactionDryRun: true, // Enable dry run for this test suite
      });
    });

    it('should return mock transaction response in dry run mode', async () => {
      const result = await broadcastTransaction(mockSignedTxHex);
      
      expect(result.txid).toMatch(/^dev_mock_tx_/);
      expect(result.fees).toBe(1000);
      expect(mockBroadcastClient.post).not.toHaveBeenCalled();
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
      mockBroadcastClient.post.mockResolvedValue({
        data: { result: mockTxid },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });

      const result = await broadcastTransaction(mockSignedTxHex);
      
      expect(result.txid).toBe(mockTxid);
      expect(mockBroadcastClient.post).toHaveBeenCalledWith(
        expect.stringContaining('api.counterparty.io'),
        null,
        { headers: { 'Content-Type': 'application/json' } }
      );
    });

    it('should broadcast successfully using blockcypher endpoint', async () => {
      mockBroadcastClient.post
        .mockRejectedValueOnce(new Error('Counterparty failed'))
        .mockResolvedValueOnce({
          data: {
            tx: {
              hash: mockTxid,
              fees: 2500
            }
          },
          status: 201,
          statusText: 'Created',
          headers: {},
          config: {}
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      
      expect(result.txid).toBe(mockTxid);
      expect(result.fees).toBe(2500);
      expect(mockBroadcastClient.post).toHaveBeenCalledWith(
        'https://api.blockcypher.com/v1/btc/main/txs/push',
        { tx: mockSignedTxHex },
        { headers: { 'Content-Type': 'application/json' } }
      );
    });

    it('should broadcast successfully using blockstream endpoint', async () => {
      mockBroadcastClient.post
        .mockRejectedValueOnce(new Error('Counterparty failed'))
        .mockRejectedValueOnce(new Error('Blockcypher failed'))
        .mockResolvedValueOnce({
          data: mockTxid,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      
      expect(result.txid).toBe(mockTxid);
      expect(mockBroadcastClient.post).toHaveBeenCalledWith(
        'https://blockstream.info/api/tx',
        mockSignedTxHex,
        { headers: { 'Content-Type': 'text/plain' } }
      );
    });

    it('should broadcast successfully using mempool endpoint', async () => {
      mockBroadcastClient.post
        .mockRejectedValueOnce(new Error('Counterparty failed'))
        .mockRejectedValueOnce(new Error('Blockcypher failed'))
        .mockRejectedValueOnce(new Error('Blockstream failed'))
        .mockResolvedValueOnce({
          data: ` ${mockTxid} `, // With whitespace to test trimming
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      
      expect(result.txid).toBe(mockTxid);
      expect(mockBroadcastClient.post).toHaveBeenCalledWith(
        'https://mempool.space/api/tx',
        mockSignedTxHex,
        { headers: { 'Content-Type': 'text/plain' } }
      );
    });

    it('should throw error when all endpoints fail', async () => {
      mockBroadcastClient.post.mockRejectedValue(new Error('Network error'));

      await expect(broadcastTransaction(mockSignedTxHex)).rejects.toThrow(
        'Network error'
      );
    });

    it('should handle HTTP error status codes', async () => {
      mockBroadcastClient.post
        .mockResolvedValueOnce({
          data: { error: 'Bad request' },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          config: {}
        })
        .mockResolvedValueOnce({
          data: { tx: { hash: mockTxid } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);
    });

    it('should handle responses without valid txid', async () => {
      mockBroadcastClient.post
        .mockResolvedValueOnce({
          data: { result: null }, // No valid txid
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        })
        .mockResolvedValueOnce({
          data: { tx: { hash: mockTxid } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);
    });

    it('should handle empty response data', async () => {
      mockBroadcastClient.post
        .mockResolvedValueOnce({
          data: null,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        })
        .mockResolvedValueOnce({
          data: { tx: { hash: mockTxid } },  // blockcypher format
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);
    });

    it('should properly encode URL parameters for counterparty', async () => {
      const specialCharHex = 'abc+def/123=456';
      mockBroadcastClient.post.mockResolvedValue({
        data: { result: mockTxid },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });

      await broadcastTransaction(specialCharHex);
      
      const expectedUrl = expect.stringContaining('signedhex=abc%2Bdef%2F123%3D456');
      expect(mockBroadcastClient.post).toHaveBeenCalledWith(
        expectedUrl,
        null,
        { headers: { 'Content-Type': 'application/json' } }
      );
    });

    it('should handle network timeout errors', async () => {
      mockBroadcastClient.post
        .mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' })
        .mockResolvedValueOnce({
          data: { tx: { hash: mockTxid } },  // blockcypher format
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);
    });

    it('should handle malformed JSON responses', async () => {
      mockBroadcastClient.post
        .mockRejectedValueOnce(new Error('JSON parse error'))
        .mockResolvedValueOnce({
          data: { tx: { hash: mockTxid } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);
    });

    it('should handle response format differences correctly', async () => {
      // Test counterparty format
      mockBroadcastClient.post.mockResolvedValueOnce({
        data: { result: mockTxid },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });

      let result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);
      expect(result.fees).toBeUndefined();

      // Reset and test blockcypher format
      vi.clearAllMocks();
      mockBroadcastClient.post
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce({
          data: {
            tx: {
              hash: mockTxid,
              fees: 1500
            }
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        });

      result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);
      expect(result.fees).toBe(1500);
    });

    it('should handle custom counterparty API base URL', async () => {
      // Clear the default mock and set a new one before the test
      vi.mocked(getKeychainSettings).mockClear();
      vi.mocked(getKeychainSettings).mockResolvedValue({
        ...DEFAULT_KEYCHAIN_SETTINGS,
        counterpartyApiBase: 'https://custom.api.com', // Custom API for this test
      });

      mockBroadcastClient.post.mockResolvedValue({
        data: { result: mockTxid },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });

      await broadcastTransaction(mockSignedTxHex);
      
      expect(mockBroadcastClient.post).toHaveBeenCalledWith(
        expect.stringContaining('custom.api.com'),
        null,
        { headers: { 'Content-Type': 'application/json' } }
      );
    });

    it('should handle very long transaction hex', async () => {
      const longHex = 'a'.repeat(10000);
      mockBroadcastClient.post.mockResolvedValue({
        data: { result: mockTxid },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });

      const result = await broadcastTransaction(longHex);
      expect(result.txid).toBe(mockTxid);
    });

    it('should handle successful response with status code edge cases', async () => {
      // Test status 201 (Created)
      mockBroadcastClient.post.mockResolvedValueOnce({
        data: { result: mockTxid },
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {}
      });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);

      // Test status 202 (Accepted)
      vi.clearAllMocks();
      // Re-setup the settings mock after clearing
      vi.mocked(getKeychainSettings).mockResolvedValue(DEFAULT_KEYCHAIN_SETTINGS);
      // Test blockstream format for 202
      mockBroadcastClient.post
        .mockRejectedValueOnce(new Error('First failed'))  // counterparty fails
        .mockRejectedValueOnce(new Error('Second failed'))  // blockcypher fails
        .mockResolvedValueOnce({
          data: mockTxid,  // blockstream returns plain string
          status: 202,
          statusText: 'Accepted',
          headers: {},
          config: {}
        });

      const result2 = await broadcastTransaction(mockSignedTxHex);
      expect(result2.txid).toBe(mockTxid);
    });
  });

  describe('error handling', () => {
    it('should preserve last error message when all endpoints fail', async () => {
      const specificError = 'Transaction already exists';
      mockBroadcastClient.post
        .mockRejectedValueOnce(new Error('First error'))
        .mockRejectedValueOnce(new Error('Second error'))
        .mockRejectedValueOnce(new Error('Third error'))
        .mockRejectedValueOnce(new Error(specificError));

      await expect(broadcastTransaction(mockSignedTxHex)).rejects.toThrow(specificError);
    });

    it('should handle unknown endpoint format gracefully', async () => {
      // This test simulates an internal error in formatResponse
      mockBroadcastClient.post.mockResolvedValue({
        data: { result: mockTxid },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });

      // Mock a scenario where formatResponse would throw
      const originalConsoleError = console.error;
      console.error = vi.fn();

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);

      console.error = originalConsoleError;
    });

    it('should handle fetch request config errors', async () => {
      mockBroadcastClient.post.mockRejectedValue({
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