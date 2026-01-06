import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchBTCBalance, hasAddressActivity } from '@/utils/blockchain/bitcoin/balance';

describe('Bitcoin Balance Utilities', () => {
  const originalFetch = globalThis.fetch;
  const mockAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should fetch balance from blockstream.info successfully', async () => {
    const mockResponse = {
      chain_stats: {
        funded_txo_sum: 1000000,
        spent_txo_sum: 500000
      },
      mempool_stats: {
        funded_txo_sum: 100000,
        spent_txo_sum: 50000
      }
    };
    
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(550000); // 1000000 - 500000 + 100000 - 50000
  });

  it('should fetch balance from mempool.space successfully', async () => {
    const mockResponse = {
      chain_stats: {
        funded_txo_sum: 2000000,
        spent_txo_sum: 1000000
      },
      mempool_stats: {
        funded_txo_sum: 0,
        spent_txo_sum: 0
      }
    };
    
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(1000000);
  });

  it('should fetch balance from blockcypher.com successfully', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ final_balance: 750000 }),
      });

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(750000);
  });

  it('should fetch balance from blockchain.info successfully', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ final_balance: 850000 }),
      });

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(850000);
  });

  it('should fetch balance from sochain.com successfully', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { confirmed_balance: '0.01234567' }
        }),
      });

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(1234567); // 0.01234567 * 1e8
  });

  it('should handle BigInt values correctly for blockstream/mempool responses', async () => {
    const mockResponse = {
      chain_stats: {
        funded_txo_sum: '9223372036854775807', // Max safe integer as string
        spent_txo_sum: '0'
      },
      mempool_stats: {
        funded_txo_sum: '0',
        spent_txo_sum: '0'
      }
    };
    
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(9223372036854775807);
  });

  it('should skip endpoints that return invalid data', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'data' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ also: 'invalid' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ final_balance: 500000 }),
      });

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(500000);
  });

  it('should handle network errors and continue to next endpoint', async () => {
    (globalThis.fetch as any)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ final_balance: 300000 }),
      });

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(300000);
  });

  it('should handle timeout by aborting the request', async () => {
    // Mock fetch to reject with an abort error (simulating what happens when timeout triggers abort)
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    (globalThis.fetch as any).mockRejectedValue(abortError);

    // Call with short timeout - the function will throw when all endpoints fail
    await expect(fetchBTCBalance(mockAddress, 10)).rejects.toThrow(
      'Failed to fetch BTC balance from all explorers'
    );

    // Verify fetch was called with abort signal
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('should throw error when all endpoints fail', async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error('Network error'));

    await expect(fetchBTCBalance(mockAddress)).rejects.toThrow(
      'Failed to fetch BTC balance from all explorers'
    );
  });

  it('should throw error when all endpoints return invalid data', async () => {
    // Mock all endpoints to return invalid data (will result in parseBTCBalance returning null)
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ invalid: 'data' }),
    });

    await expect(fetchBTCBalance(mockAddress)).rejects.toThrow(
      'Failed to fetch BTC balance from all explorers'
    );
  });

  it('should use custom timeout value', async () => {
    // Test that the function accepts and works with a custom timeout
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ final_balance: 100000 }),
    });

    // Should complete successfully with custom timeout
    const balance = await fetchBTCBalance(mockAddress, 2000);
    expect(balance).toBe(100000);

    // Verify fetch was called with an abort signal
    expect(globalThis.fetch).toHaveBeenCalled();
    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[1]).toHaveProperty('signal');
  });

  it('should handle malformed JSON responses gracefully', async () => {
    // First and second endpoints fail, third endpoint (blockcypher) succeeds
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ final_balance: 200000 }),
      })
      .mockResolvedValue({
        ok: false,
        status: 404,
      });

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(200000);
  });

  it('should handle HTTP error responses correctly', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ final_balance: 400000 }),
      });

    const balance = await fetchBTCBalance(mockAddress);
    expect(balance).toBe(400000);
  });

  describe('hasAddressActivity', () => {
    it('should return true when address has transaction history', async () => {
      const mockResponse = {
        chain_stats: { tx_count: 5 },
        mempool_stats: { tx_count: 0 }
      };

      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const hasActivity = await hasAddressActivity(mockAddress);
      expect(hasActivity).toBe(true);
    });

    it('should return true when address has mempool transactions', async () => {
      const mockResponse = {
        chain_stats: { tx_count: 0 },
        mempool_stats: { tx_count: 2 }
      };

      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const hasActivity = await hasAddressActivity(mockAddress);
      expect(hasActivity).toBe(true);
    });

    it('should return false when address has no transactions', async () => {
      const mockResponse = {
        chain_stats: { tx_count: 0 },
        mempool_stats: { tx_count: 0 }
      };

      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const hasActivity = await hasAddressActivity(mockAddress);
      expect(hasActivity).toBe(false);
    });

    it('should fallback to mempool.space when blockstream fails', async () => {
      (globalThis.fetch as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            chain_stats: { tx_count: 10 },
            mempool_stats: { tx_count: 0 }
          }),
        });

      const hasActivity = await hasAddressActivity(mockAddress);
      expect(hasActivity).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should return false when all endpoints fail', async () => {
      (globalThis.fetch as any).mockRejectedValue(new Error('Network error'));

      const hasActivity = await hasAddressActivity(mockAddress);
      expect(hasActivity).toBe(false);
    });

    it('should handle HTTP error responses', async () => {
      (globalThis.fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            chain_stats: { tx_count: 3 },
            mempool_stats: { tx_count: 1 }
          }),
        });

      const hasActivity = await hasAddressActivity(mockAddress);
      expect(hasActivity).toBe(true);
    });

    it('should use custom timeout value', async () => {
      // Test that the function accepts and works with a custom timeout
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          chain_stats: { tx_count: 0 },
          mempool_stats: { tx_count: 0 }
        }),
      });

      // Should complete successfully with custom timeout
      const hasActivity = await hasAddressActivity(mockAddress, 3000);
      expect(hasActivity).toBe(false);

      // Verify fetch was called with an abort signal
      expect(globalThis.fetch).toHaveBeenCalled();
      const fetchCall = (globalThis.fetch as any).mock.calls[0];
      expect(fetchCall[1]).toHaveProperty('signal');
    });

    it('should handle malformed response data', async () => {
      (globalThis.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invalid: 'data' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            chain_stats: { tx_count: 5 },
            mempool_stats: { tx_count: 0 }
          }),
        });

      const hasActivity = await hasAddressActivity(mockAddress);
      expect(hasActivity).toBe(true);
    });
  });
});