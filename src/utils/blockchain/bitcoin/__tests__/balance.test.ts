import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBTCBalance, hasAddressActivity, clearBalanceCache } from '@/utils/blockchain/bitcoin/balance';
import { apiClient } from '@/utils/apiClient';
import type { ApiResponse } from '@/utils/apiClient';

vi.mock('@/utils/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

/** Helper to build a successful ApiResponse */
function okResponse<T>(data: T): ApiResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: {} };
}

describe('Bitcoin Balance Utilities', () => {
  const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear all caches to ensure test isolation
    clearBalanceCache();
  });

  it('should fetch balance from blockstream.info successfully', async () => {
    const mockData = {
      chain_stats: {
        funded_txo_sum: 1000000,
        spent_txo_sum: 500000
      },
      mempool_stats: {
        funded_txo_sum: 100000,
        spent_txo_sum: 50000
      }
    };

    vi.mocked(apiClient.get).mockResolvedValue(okResponse(mockData));

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(550000); // 1000000 - 500000 + 100000 - 50000
  });

  it('should fetch balance from mempool.space successfully', async () => {
    const mockData = {
      chain_stats: {
        funded_txo_sum: 2000000,
        spent_txo_sum: 1000000
      },
      mempool_stats: {
        funded_txo_sum: 0,
        spent_txo_sum: 0
      }
    };

    vi.mocked(apiClient.get).mockResolvedValue(okResponse(mockData));

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(1000000);
  });

  it('should fetch balance from blockcypher.com successfully', async () => {
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockResolvedValueOnce(okResponse({ final_balance: 750000 }));

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(750000);
  });

  it('should fetch balance from blockchain.info successfully', async () => {
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockRejectedValueOnce(new Error('HTTP 429'))
      .mockResolvedValueOnce(okResponse({ final_balance: 850000 }));

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(850000);
  });

  it('should fetch balance from sochain.com successfully', async () => {
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockRejectedValueOnce(new Error('HTTP 429'))
      .mockRejectedValueOnce(new Error('HTTP 404'))
      .mockResolvedValueOnce(okResponse({
        data: { confirmed_balance: '0.01234567' }
      }));

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(1234567); // 0.01234567 * 1e8
  });

  it('should handle BigInt values correctly for blockstream/mempool responses', async () => {
    const mockData = {
      chain_stats: {
        funded_txo_sum: 9223372036854775807, // Max safe integer as number
        spent_txo_sum: 0,
        tx_count: 1
      },
      mempool_stats: {
        funded_txo_sum: 0,
        spent_txo_sum: 0,
        tx_count: 0
      }
    };

    vi.mocked(apiClient.get).mockResolvedValue(okResponse(mockData));

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(9223372036854775807);
  });

  it('should skip endpoints that return invalid data', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(okResponse({ invalid: 'data' }))
      .mockResolvedValueOnce(okResponse({ also: 'invalid' }))
      .mockResolvedValueOnce(okResponse({ final_balance: 500000 }));

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(500000);
  });

  it('should handle network errors and continue to next endpoint', async () => {
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce(okResponse({ final_balance: 300000 }));

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(300000);
  });

  it('should handle timeout by throwing when all endpoints fail', async () => {
    const timeoutError = new Error('Request timed out');
    vi.mocked(apiClient.get).mockRejectedValue(timeoutError);

    await expect(fetchBTCBalance(mockAddress, 10)).rejects.toThrow(
      'Failed to fetch BTC balance from all explorers'
    );

    expect(apiClient.get).toHaveBeenCalled();
  });

  it('should throw error when all endpoints fail', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

    await expect(fetchBTCBalance(mockAddress)).rejects.toThrow(
      'Failed to fetch BTC balance from all explorers'
    );
  });

  it('should throw error when all endpoints return invalid data', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(okResponse({ invalid: 'data' }));

    await expect(fetchBTCBalance(mockAddress)).rejects.toThrow(
      'Failed to fetch BTC balance from all explorers'
    );
  });

  it('should use custom timeout value', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(okResponse({ final_balance: 100000 }));

    const balance = await fetchBTCBalance(mockAddress, 2000);
    expect(balance).toBe(100000);

    // Verify apiClient.get was called with the timeout option
    expect(apiClient.get).toHaveBeenCalled();
    expect(apiClient.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: 2000 })
    );
  });

  it('should handle malformed JSON responses gracefully', async () => {
    // First endpoint throws (simulating JSON parse failure inside apiClient),
    // second endpoint throws, third endpoint (blockcypher) succeeds
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(new Error('Failed to parse API response as JSON'))
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockResolvedValueOnce(okResponse({ final_balance: 200000 }));

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(200000);
  });

  it('should handle HTTP error responses correctly', async () => {
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(new Error('HTTP 404'))
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockResolvedValueOnce(okResponse({ final_balance: 400000 }));

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(400000);
  });

  describe('hasAddressActivity', () => {
    it('should return true when address has transaction history', async () => {
      const mockData = {
        chain_stats: { tx_count: 5 },
        mempool_stats: { tx_count: 0 }
      };

      vi.mocked(apiClient.get).mockResolvedValue(okResponse(mockData));

      const hasActivity = await hasAddressActivity(mockAddress);
      expect(hasActivity).toBe(true);
    });

    it('should return true when address has mempool transactions', async () => {
      const mockData = {
        chain_stats: { tx_count: 0 },
        mempool_stats: { tx_count: 2 }
      };

      vi.mocked(apiClient.get).mockResolvedValue(okResponse(mockData));

      const hasActivity = await hasAddressActivity(mockAddress);
      expect(hasActivity).toBe(true);
    });

    it('should return false when address has no transactions', async () => {
      const mockData = {
        chain_stats: { tx_count: 0 },
        mempool_stats: { tx_count: 0 }
      };

      vi.mocked(apiClient.get).mockResolvedValue(okResponse(mockData));

      const hasActivity = await hasAddressActivity(mockAddress);
      expect(hasActivity).toBe(false);
    });

    it('should fallback to mempool.space when blockstream fails', async () => {
      vi.mocked(apiClient.get)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(okResponse({
          chain_stats: { tx_count: 10 },
          mempool_stats: { tx_count: 0 }
        }));

      const hasActivity = await hasAddressActivity(mockAddress);
      expect(hasActivity).toBe(true);
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });

    it('should return false when all endpoints fail', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

      const hasActivity = await hasAddressActivity(mockAddress);
      expect(hasActivity).toBe(false);
    });

    it('should handle HTTP error responses', async () => {
      vi.mocked(apiClient.get)
        .mockRejectedValueOnce(new Error('HTTP 500'))
        .mockResolvedValueOnce(okResponse({
          chain_stats: { tx_count: 3 },
          mempool_stats: { tx_count: 1 }
        }));

      const hasActivity = await hasAddressActivity(mockAddress);
      expect(hasActivity).toBe(true);
    });

    it('should use custom timeout value', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(okResponse({
        chain_stats: { tx_count: 0 },
        mempool_stats: { tx_count: 0 }
      }));

      const hasActivity = await hasAddressActivity(mockAddress, 3000);
      expect(hasActivity).toBe(false);

      // Verify apiClient.get was called with the timeout option
      expect(apiClient.get).toHaveBeenCalled();
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 3000 })
      );
    });

    it('should handle malformed response data', async () => {
      vi.mocked(apiClient.get)
        .mockResolvedValueOnce(okResponse({ invalid: 'data' }))
        .mockResolvedValueOnce(okResponse({
          chain_stats: { tx_count: 5 },
          mempool_stats: { tx_count: 0 }
        }));

      const hasActivity = await hasAddressActivity(mockAddress);
      expect(hasActivity).toBe(true);
    });
  });
});
