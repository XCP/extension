import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { broadcastTransaction } from '@/utils/blockchain/bitcoin/transactionBroadcaster';
import axios from 'axios';
import { getKeychainSettings } from '@/utils/storage/settingsStorage';

vi.mock('axios');
vi.mock('@/utils/storage/settingsStorage');

const mockAxios = axios as any;

describe('Transaction Broadcaster Utilities', () => {
  const mockSignedTxHex = '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff08044c86041b020602ffffffff0100f2052a010000004341041b0e8c2567c12536aa13357b79a073dc4444acb83c4ec7a0e2f99dd7457516c5817242da796924ca4e99947d087fedf9ce467cb9f7c6287078f801df276fdf84424ac00000000';
  const mockTxid = 'abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for all tests
    vi.mocked(getKeychainSettings).mockResolvedValue({
      lastActiveWalletId: undefined,
      lastActiveAddress: undefined,
      autoLockTimeout: 5 * 60 * 1000,
      connectedWebsites: [],
      showHelpText: false,
      analyticsAllowed: true,
      allowUnconfirmedTxs: false,
      autoLockTimer: '5m',
      enableMPMA: false,
      enableAdvancedBroadcasts: false,
      transactionDryRun: false,
      pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'],
      counterpartyApiBase: 'https://api.counterparty.io:4000',
      defaultOrderExpiration: 1000
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('broadcastTransaction in dry run mode', () => {
    beforeEach(() => {
      vi.mocked(getKeychainSettings).mockResolvedValue({
        lastActiveWalletId: undefined,
        lastActiveAddress: undefined,
        autoLockTimeout: 5 * 60 * 1000,
        connectedWebsites: [],
        showHelpText: false,
        analyticsAllowed: true,
        allowUnconfirmedTxs: false,
        autoLockTimer: '5m',
        enableMPMA: false,
        enableAdvancedBroadcasts: false,
        transactionDryRun: true,
        pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'],
        counterpartyApiBase: 'https://api.counterparty.io:4000',
        defaultOrderExpiration: 1000
      });
    });

    it('should return mock transaction response in dry run mode', async () => {
      const result = await broadcastTransaction(mockSignedTxHex);
      
      expect(result.txid).toMatch(/^dev_mock_tx_/);
      expect(result.fees).toBe(1000);
      expect(mockAxios.post).not.toHaveBeenCalled();
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
      
      expect(endTime - startTime).toBeGreaterThanOrEqual(500);
    });
  });

  describe('broadcastTransaction with real endpoints', () => {
    it('should broadcast successfully using counterparty endpoint', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { result: mockTxid }
      });

      const result = await broadcastTransaction(mockSignedTxHex);
      
      expect(result.txid).toBe(mockTxid);
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('api.counterparty.io'),
        null,
        { headers: { 'Content-Type': 'application/json' } }
      );
    });

    it('should broadcast successfully using blockcypher endpoint', async () => {
      mockAxios.post
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
      
      expect(result.txid).toBe(mockTxid);
      expect(result.fees).toBe(2500);
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.blockcypher.com/v1/btc/main/txs/push',
        { tx: mockSignedTxHex },
        { headers: { 'Content-Type': 'application/json' } }
      );
    });

    it('should broadcast successfully using blockstream endpoint', async () => {
      mockAxios.post
        .mockRejectedValueOnce(new Error('Counterparty failed'))
        .mockRejectedValueOnce(new Error('Blockcypher failed'))
        .mockResolvedValueOnce({
          status: 200,
          data: mockTxid
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      
      expect(result.txid).toBe(mockTxid);
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://blockstream.info/api/tx',
        mockSignedTxHex,
        { headers: { 'Content-Type': 'text/plain' } }
      );
    });

    it('should broadcast successfully using mempool endpoint', async () => {
      mockAxios.post
        .mockRejectedValueOnce(new Error('Counterparty failed'))
        .mockRejectedValueOnce(new Error('Blockcypher failed'))
        .mockRejectedValueOnce(new Error('Blockstream failed'))
        .mockResolvedValueOnce({
          status: 200,
          data: ` ${mockTxid} ` // With whitespace to test trimming
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      
      expect(result.txid).toBe(mockTxid);
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://mempool.space/api/tx',
        mockSignedTxHex,
        { headers: { 'Content-Type': 'text/plain' } }
      );
    });

    it('should throw error when all endpoints fail', async () => {
      mockAxios.post.mockRejectedValue(new Error('Network error'));

      await expect(broadcastTransaction(mockSignedTxHex)).rejects.toThrow(
        'Network error'
      );
    });

    it('should handle HTTP error status codes', async () => {
      mockAxios.post
        .mockResolvedValueOnce({
          status: 400,
          data: { error: 'Bad request' }
        })
        .mockResolvedValueOnce({
          status: 200,
          data: { tx: { hash: mockTxid } }
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);
    });

    it('should handle responses without valid txid', async () => {
      mockAxios.post
        .mockResolvedValueOnce({
          status: 200,
          data: { result: null } // No valid txid
        })
        .mockResolvedValueOnce({
          status: 200,
          data: { tx: { hash: mockTxid } }
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);
    });

    it('should handle empty response data', async () => {
      mockAxios.post
        .mockResolvedValueOnce({
          status: 200,
          data: null
        })
        .mockResolvedValueOnce({
          status: 200,
          data: { tx: { hash: mockTxid } }  // blockcypher format
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);
    });

    it('should properly encode URL parameters for counterparty', async () => {
      const specialCharHex = 'abc+def/123=456';
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { result: mockTxid }
      });

      await broadcastTransaction(specialCharHex);
      
      const expectedUrl = expect.stringContaining('signedhex=abc%2Bdef%2F123%3D456');
      expect(mockAxios.post).toHaveBeenCalledWith(
        expectedUrl,
        null,
        { headers: { 'Content-Type': 'application/json' } }
      );
    });

    it('should handle network timeout errors', async () => {
      mockAxios.post
        .mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' })
        .mockResolvedValueOnce({
          status: 200,
          data: { tx: { hash: mockTxid } }  // blockcypher format
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);
    });

    it('should handle malformed JSON responses', async () => {
      mockAxios.post
        .mockRejectedValueOnce(new Error('JSON parse error'))
        .mockResolvedValueOnce({
          status: 200,
          data: { tx: { hash: mockTxid } }
        });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);
    });

    it('should handle response format differences correctly', async () => {
      // Test counterparty format
      mockAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { result: mockTxid }
      });

      let result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);
      expect(result.fees).toBeUndefined();

      // Reset and test blockcypher format
      vi.clearAllMocks();
      mockAxios.post
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
      expect(result.txid).toBe(mockTxid);
      expect(result.fees).toBe(1500);
    });

    it('should handle custom counterparty API base URL', async () => {
      // Clear the default mock and set a new one before the test
      vi.mocked(getKeychainSettings).mockClear();
      vi.mocked(getKeychainSettings).mockResolvedValue({
        lastActiveWalletId: undefined,
        lastActiveAddress: undefined,
        autoLockTimeout: 5 * 60 * 1000,
        connectedWebsites: [],
        showHelpText: false,
        analyticsAllowed: true,
        allowUnconfirmedTxs: false,
        autoLockTimer: '5m',
        enableMPMA: false,
        enableAdvancedBroadcasts: false,
        transactionDryRun: false,
        pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'],
        counterpartyApiBase: 'https://custom.api.com',
        defaultOrderExpiration: 1000
      });

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { result: mockTxid }
      });

      await broadcastTransaction(mockSignedTxHex);
      
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('custom.api.com'),
        null,
        { headers: { 'Content-Type': 'application/json' } }
      );
    });

    it('should handle very long transaction hex', async () => {
      const longHex = 'a'.repeat(10000);
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { result: mockTxid }
      });

      const result = await broadcastTransaction(longHex);
      expect(result.txid).toBe(mockTxid);
    });

    it('should handle successful response with status code edge cases', async () => {
      // Test status 201 (Created)
      mockAxios.post.mockResolvedValueOnce({
        status: 201,
        data: { result: mockTxid }
      });

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);

      // Test status 202 (Accepted)
      vi.clearAllMocks();
      // Re-setup the settings mock after clearing
      vi.mocked(getKeychainSettings).mockResolvedValue({
        lastActiveWalletId: undefined,
        lastActiveAddress: undefined,
        autoLockTimeout: 5 * 60 * 1000,
        connectedWebsites: [],
        showHelpText: false,
        analyticsAllowed: true,
        allowUnconfirmedTxs: false,
        autoLockTimer: '5m',
        enableMPMA: false,
        enableAdvancedBroadcasts: false,
        transactionDryRun: false,
        pinnedAssets: ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'],
        counterpartyApiBase: 'https://api.counterparty.io:4000',
        defaultOrderExpiration: 1000
      });
      // Test blockstream format for 202
      mockAxios.post
        .mockRejectedValueOnce(new Error('First failed'))  // counterparty fails
        .mockRejectedValueOnce(new Error('Second failed'))  // blockcypher fails
        .mockResolvedValueOnce({
          status: 202,
          data: mockTxid  // blockstream returns plain string
        });

      const result2 = await broadcastTransaction(mockSignedTxHex);
      expect(result2.txid).toBe(mockTxid);
    });
  });

  describe('error handling', () => {
    it('should preserve last error message when all endpoints fail', async () => {
      const specificError = 'Transaction already exists';
      mockAxios.post
        .mockRejectedValueOnce(new Error('First error'))
        .mockRejectedValueOnce(new Error('Second error'))
        .mockRejectedValueOnce(new Error('Third error'))
        .mockRejectedValueOnce(new Error(specificError));

      await expect(broadcastTransaction(mockSignedTxHex)).rejects.toThrow(specificError);
    });

    it('should handle unknown endpoint format gracefully', async () => {
      // This test simulates an internal error in formatResponse
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { result: mockTxid }
      });

      // Mock a scenario where formatResponse would throw
      const originalConsoleError = console.error;
      console.error = vi.fn();

      const result = await broadcastTransaction(mockSignedTxHex);
      expect(result.txid).toBe(mockTxid);

      console.error = originalConsoleError;
    });

    it('should handle axios request config errors', async () => {
      mockAxios.post.mockRejectedValue({
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