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
    const abortSpy = vi.fn();
    const mockController = {
      abort: abortSpy,
      signal: { aborted: false }
    };
    vi.spyOn(globalThis, 'AbortController').mockImplementation(() => mockController as any);
    
    (globalThis.fetch as any).mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ final_balance: 100000 })
      }), 10000))
    );

    const timeoutPromise = fetchBTCBalance(mockAddress, 100);
    
    // Wait a bit to ensure timeout is triggered
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(abortSpy).toHaveBeenCalled();
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
    const customTimeout = 2000;
    let timeoutUsed = 0;
    
    const mockController = {
      abort: vi.fn(),
      signal: { aborted: false }
    };
    vi.spyOn(globalThis, 'AbortController').mockImplementation(() => mockController as any);
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, timeout) => {
      timeoutUsed = timeout || 0;
      return originalSetTimeout(callback, timeout);
    });

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ final_balance: 100000 }),
    });

    await fetchBTCBalance(mockAddress, customTimeout);
    expect(timeoutUsed).toBe(customTimeout);
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
      const customTimeout = 3000;
      let timeoutUsed = 0;

      const mockController = {
        abort: vi.fn(),
        signal: { aborted: false }
      };
      vi.spyOn(globalThis, 'AbortController').mockImplementation(() => mockController as any);
      const originalSetTimeout = globalThis.setTimeout;
      vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, timeout) => {
        timeoutUsed = timeout || 0;
        return originalSetTimeout(callback, timeout);
      });

      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          chain_stats: { tx_count: 0 },
          mempool_stats: { tx_count: 0 }
        }),
      });

      await hasAddressActivity(mockAddress, customTimeout);
      expect(timeoutUsed).toBe(customTimeout);
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