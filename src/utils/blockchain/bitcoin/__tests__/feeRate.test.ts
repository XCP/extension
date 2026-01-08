import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FeeRates } from '@/utils/blockchain/bitcoin/feeRate';

describe('Fee Rate Utilities', () => {
  const originalFetch = globalThis.fetch;
  const mockFeeRates: FeeRates = {
    fastestFee: 20,
    halfHourFee: 15,
    hourFee: 10
  };

  // Dynamic imports for fresh module state
  let fetchFromMempoolSpace: () => Promise<FeeRates>;
  let fetchFromBlockstream: () => Promise<FeeRates>;
  let getFeeRates: () => Promise<FeeRates>;

  beforeEach(async () => {
    // Reset module to get fresh cache state
    vi.resetModules();
    const feeRateModule = await import('@/utils/blockchain/bitcoin/feeRate');
    fetchFromMempoolSpace = feeRateModule.fetchFromMempoolSpace;
    fetchFromBlockstream = feeRateModule.fetchFromBlockstream;
    getFeeRates = feeRateModule.getFeeRates;

    globalThis.fetch = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('fetchFromMempoolSpace', () => {
    it('should fetch fee rates successfully', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockFeeRates,
      });

      const feeRates = await fetchFromMempoolSpace();
      expect(feeRates).toEqual(mockFeeRates);
      expect(globalThis.fetch).toHaveBeenCalledWith('https://mempool.space/api/v1/fees/recommended');
    });

    it('should throw error when API response is not ok', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(fetchFromMempoolSpace()).rejects.toThrow(
        'Failed to fetch fee rates from mempool.space'
      );
    });

    it('should throw error when fastestFee is not a number', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          fastestFee: 'invalid',
          halfHourFee: 15,
          hourFee: 10
        }),
      });

      await expect(fetchFromMempoolSpace()).rejects.toThrow(
        'Invalid data format from mempool.space'
      );
    });

    it('should throw error when halfHourFee is not a number', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          fastestFee: 20,
          halfHourFee: null,
          hourFee: 10
        }),
      });

      await expect(fetchFromMempoolSpace()).rejects.toThrow(
        'Invalid data format from mempool.space'
      );
    });

    it('should throw error when hourFee is not a number', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          fastestFee: 20,
          halfHourFee: 15,
          hourFee: undefined
        }),
      });

      await expect(fetchFromMempoolSpace()).rejects.toThrow(
        'Invalid data format from mempool.space'
      );
    });

    it('should throw error when required fields are missing', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          fastestFee: 20,
          // Missing halfHourFee and hourFee
        }),
      });

      await expect(fetchFromMempoolSpace()).rejects.toThrow(
        'Invalid data format from mempool.space'
      );
    });

    it('should handle network errors', async () => {
      (globalThis.fetch as any).mockRejectedValue(new Error('Network error'));

      await expect(fetchFromMempoolSpace()).rejects.toThrow('Network error');
    });

    it('should handle JSON parsing errors', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      await expect(fetchFromMempoolSpace()).rejects.toThrow('Invalid JSON');
    });

    it('should handle zero fee rates', async () => {
      const zeroFeeRates = {
        fastestFee: 0,
        halfHourFee: 0,
        hourFee: 0
      };

      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => zeroFeeRates,
      });

      const feeRates = await fetchFromMempoolSpace();
      expect(feeRates).toEqual(zeroFeeRates);
    });

    it('should handle negative fee rates', async () => {
      const negativeFeeRates = {
        fastestFee: -1,
        halfHourFee: -2,
        hourFee: -3
      };

      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => negativeFeeRates,
      });

      const feeRates = await fetchFromMempoolSpace();
      expect(feeRates).toEqual(negativeFeeRates);
    });
  });

  describe('fetchFromBlockstream', () => {
    it('should fetch fee rates successfully', async () => {
      const blockstreamResponse = {
        "1": 25,
        "2": 20, // fastestFee
        "3": 15, // halfHourFee
        "6": 10, // hourFee
        "12": 8,
        "24": 5
      };

      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => blockstreamResponse,
      });

      const feeRates = await fetchFromBlockstream();
      expect(feeRates).toEqual(mockFeeRates);
      expect(globalThis.fetch).toHaveBeenCalledWith('https://blockstream.info/api/fee-estimates');
    });

    it('should throw error when API response is not ok', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: false,
        status: 429,
      });

      await expect(fetchFromBlockstream()).rejects.toThrow(
        'Failed to fetch fee rates from blockstream.info'
      );
    });

    it('should throw error when block 2 fee is not a number', async () => {
      const blockstreamResponse = {
        "2": "invalid",
        "3": 15,
        "6": 10
      };

      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => blockstreamResponse,
      });

      await expect(fetchFromBlockstream()).rejects.toThrow(
        'Invalid data format from blockstream.info'
      );
    });

    it('should throw error when block 3 fee is not a number', async () => {
      const blockstreamResponse = {
        "2": 20,
        "3": null,
        "6": 10
      };

      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => blockstreamResponse,
      });

      await expect(fetchFromBlockstream()).rejects.toThrow(
        'Invalid data format from blockstream.info'
      );
    });

    it('should throw error when block 6 fee is not a number', async () => {
      const blockstreamResponse = {
        "2": 20,
        "3": 15,
        "6": undefined
      };

      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => blockstreamResponse,
      });

      await expect(fetchFromBlockstream()).rejects.toThrow(
        'Invalid data format from blockstream.info'
      );
    });

    it('should throw error when required block targets are missing', async () => {
      const blockstreamResponse = {
        "1": 25,
        "12": 8,
        // Missing "2", "3", "6"
      };

      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => blockstreamResponse,
      });

      await expect(fetchFromBlockstream()).rejects.toThrow(
        'Invalid data format from blockstream.info'
      );
    });

    it('should handle network errors', async () => {
      (globalThis.fetch as any).mockRejectedValue(new Error('Connection timeout'));

      await expect(fetchFromBlockstream()).rejects.toThrow('Connection timeout');
    });

    it('should handle JSON parsing errors', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => { throw new Error('Malformed JSON'); },
      });

      await expect(fetchFromBlockstream()).rejects.toThrow('Malformed JSON');
    });

    it('should handle empty response object', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(fetchFromBlockstream()).rejects.toThrow(
        'Invalid data format from blockstream.info'
      );
    });

    it('should handle fractional fee rates', async () => {
      const blockstreamResponse = {
        "2": 20.5,
        "3": 15.3,
        "6": 10.1
      };

      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => blockstreamResponse,
      });

      const feeRates = await fetchFromBlockstream();
      expect(feeRates).toEqual({
        fastestFee: 20.5,
        halfHourFee: 15.3,
        hourFee: 10.1
      });
    });
  });

  describe('getFeeRates', () => {
    it('should return fee rates from first successful source', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockFeeRates,
      });

      const feeRates = await getFeeRates();
      expect(feeRates).toEqual(mockFeeRates);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('should try second source if first fails', async () => {
      const blockstreamResponse = {
        "2": 20,
        "3": 15,
        "6": 10
      };

      (globalThis.fetch as any)
        .mockRejectedValueOnce(new Error('Mempool.space failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => blockstreamResponse,
        });

      const feeRates = await getFeeRates();
      expect(feeRates).toEqual(mockFeeRates);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('should skip invalid responses and continue to next source', async () => {
      const blockstreamResponse = {
        "2": 25,
        "3": 20,
        "6": 15
      };

      (globalThis.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            fastestFee: 'invalid',
            halfHourFee: 15,
            hourFee: 10
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => blockstreamResponse,
        });

      const feeRates = await getFeeRates();
      expect(feeRates).toEqual({
        fastestFee: 25,
        halfHourFee: 20,
        hourFee: 15
      });
    });

    it('should throw error when all sources fail', async () => {
      (globalThis.fetch as any).mockRejectedValue(new Error('All sources failed'));

      await expect(getFeeRates()).rejects.toThrow(
        'Unable to fetch fee rates from any source'
      );
    });

    it('should throw error when all sources return invalid data', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ invalid: 'data' }),
      });

      await expect(getFeeRates()).rejects.toThrow(
        'Unable to fetch fee rates from any source'
      );
    });

    it('should validate returned fee rates structure', async () => {
      (globalThis.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            fastestFee: 20,
            halfHourFee: 15,
            // Missing hourFee
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            "2": 20,
            "3": 15,
            "6": 10
          }),
        });

      const feeRates = await getFeeRates();
      expect(feeRates).toEqual(mockFeeRates);
    });

    it('should handle HTTP errors gracefully', async () => {
      const blockstreamResponse = {
        "2": 30,
        "3": 25,
        "6": 20
      };

      (globalThis.fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => blockstreamResponse,
        });

      const feeRates = await getFeeRates();
      expect(feeRates).toEqual({
        fastestFee: 30,
        halfHourFee: 25,
        hourFee: 20
      });
    });

    it('should handle mix of network and validation errors', async () => {
      const blockstreamResponse = {
        "2": 35,
        "3": 30,
        "6": 25
      };

      (globalThis.fetch as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => blockstreamResponse,
        });

      const feeRates = await getFeeRates();
      expect(feeRates).toEqual({
        fastestFee: 35,
        halfHourFee: 30,
        hourFee: 25
      });
    });

    it('should handle partial invalid data in response', async () => {
      (globalThis.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            fastestFee: 20,
            halfHourFee: NaN, // Invalid
            hourFee: 10
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            "2": 40,
            "3": 35,
            "6": 30
          }),
        });

      const feeRates = await getFeeRates();
      expect(feeRates).toEqual({
        fastestFee: 40,
        halfHourFee: 35,
        hourFee: 30
      });
    });
  });
});