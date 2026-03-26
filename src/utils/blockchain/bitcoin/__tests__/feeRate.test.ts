import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FeeRates } from '@/utils/blockchain/bitcoin/feeRate';
import { apiClient } from '@/utils/apiClient';
import type { ApiResponse } from '@/utils/apiClient';

vi.mock('@/utils/apiClient');

/** Helper to build a successful ApiResponse */
function okResponse<T>(data: T): ApiResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: {} };
}

describe('Fee Rate Utilities', () => {
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

    vi.clearAllMocks();
  });

  describe('fetchFromMempoolSpace', () => {
    it('should fetch fee rates successfully', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(okResponse(mockFeeRates));

      const feeRates = await fetchFromMempoolSpace();
      expect(feeRates).toEqual(mockFeeRates);
      expect(apiClient.get).toHaveBeenCalledWith(
        'https://mempool.space/api/v1/fees/recommended',
        { retries: 0 }
      );
    });

    it('should throw error when API response is not ok', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Request failed with status 500'));

      await expect(fetchFromMempoolSpace()).rejects.toThrow(
        'Request failed with status 500'
      );
    });

    it('should throw error when fastestFee is not a number', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(okResponse({
        fastestFee: 'invalid',
        halfHourFee: 15,
        hourFee: 10
      }));

      await expect(fetchFromMempoolSpace()).rejects.toThrow(
        'Invalid response data format'
      );
    });

    it('should throw error when halfHourFee is not a number', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(okResponse({
        fastestFee: 20,
        halfHourFee: null,
        hourFee: 10
      }));

      await expect(fetchFromMempoolSpace()).rejects.toThrow(
        'Invalid response data format'
      );
    });

    it('should throw error when hourFee is not a number', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(okResponse({
        fastestFee: 20,
        halfHourFee: 15,
        hourFee: undefined
      }));

      await expect(fetchFromMempoolSpace()).rejects.toThrow(
        'Invalid response data format'
      );
    });

    it('should throw error when required fields are missing', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(okResponse({
        fastestFee: 20,
        // Missing halfHourFee and hourFee
      }));

      await expect(fetchFromMempoolSpace()).rejects.toThrow(
        'Invalid response data format'
      );
    });

    it('should handle network errors', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

      await expect(fetchFromMempoolSpace()).rejects.toThrow('Network error');
    });

    it('should handle zero fee rates', async () => {
      const zeroFeeRates = {
        fastestFee: 0,
        halfHourFee: 0,
        hourFee: 0
      };

      vi.mocked(apiClient.get).mockResolvedValue(okResponse(zeroFeeRates));

      const feeRates = await fetchFromMempoolSpace();
      expect(feeRates).toEqual(zeroFeeRates);
    });

    it('should handle negative fee rates', async () => {
      const negativeFeeRates = {
        fastestFee: -1,
        halfHourFee: -2,
        hourFee: -3
      };

      vi.mocked(apiClient.get).mockResolvedValue(okResponse(negativeFeeRates));

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

      vi.mocked(apiClient.get).mockResolvedValue(okResponse(blockstreamResponse));

      const feeRates = await fetchFromBlockstream();
      expect(feeRates).toEqual(mockFeeRates);
      expect(apiClient.get).toHaveBeenCalledWith(
        'https://blockstream.info/api/fee-estimates',
        { retries: 0 }
      );
    });

    it('should throw error when API response is not ok', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Request failed with status 429'));

      await expect(fetchFromBlockstream()).rejects.toThrow(
        'Request failed with status 429'
      );
    });

    it('should throw error when block 2 fee is not a number', async () => {
      const blockstreamResponse = {
        "2": "invalid",
        "3": 15,
        "6": 10
      };

      vi.mocked(apiClient.get).mockResolvedValue(okResponse(blockstreamResponse));

      await expect(fetchFromBlockstream()).rejects.toThrow(
        'Invalid response data format'
      );
    });

    it('should throw error when block 3 fee is not a number', async () => {
      const blockstreamResponse = {
        "2": 20,
        "3": null,
        "6": 10
      };

      vi.mocked(apiClient.get).mockResolvedValue(okResponse(blockstreamResponse));

      await expect(fetchFromBlockstream()).rejects.toThrow(
        'Invalid response data format'
      );
    });

    it('should throw error when block 6 fee is not a number', async () => {
      const blockstreamResponse = {
        "2": 20,
        "3": 15,
        "6": undefined
      };

      vi.mocked(apiClient.get).mockResolvedValue(okResponse(blockstreamResponse));

      await expect(fetchFromBlockstream()).rejects.toThrow(
        'Invalid response data format'
      );
    });

    it('should throw error when required block targets are missing', async () => {
      const blockstreamResponse = {
        "1": 25,
        "12": 8,
        // Missing "2", "3", "6"
      };

      vi.mocked(apiClient.get).mockResolvedValue(okResponse(blockstreamResponse));

      await expect(fetchFromBlockstream()).rejects.toThrow(
        'Invalid response data format'
      );
    });

    it('should handle network errors', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Connection timeout'));

      await expect(fetchFromBlockstream()).rejects.toThrow('Connection timeout');
    });

    it('should handle empty response object', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(okResponse({}));

      await expect(fetchFromBlockstream()).rejects.toThrow(
        'Invalid response data format'
      );
    });

    it('should handle fractional fee rates', async () => {
      const blockstreamResponse = {
        "2": 20.5,
        "3": 15.3,
        "6": 10.1
      };

      vi.mocked(apiClient.get).mockResolvedValue(okResponse(blockstreamResponse));

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
      vi.mocked(apiClient.get).mockResolvedValue(okResponse(mockFeeRates));

      const feeRates = await getFeeRates();
      expect(feeRates).toEqual(mockFeeRates);
      expect(apiClient.get).toHaveBeenCalledTimes(1);
    });

    it('should try second source if first fails', async () => {
      const blockstreamResponse = {
        "2": 20,
        "3": 15,
        "6": 10
      };

      vi.mocked(apiClient.get)
        .mockRejectedValueOnce(new Error('Mempool.space failed'))
        .mockResolvedValueOnce(okResponse(blockstreamResponse));

      const feeRates = await getFeeRates();
      expect(feeRates).toEqual(mockFeeRates);
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });

    it('should skip invalid responses and continue to next source', async () => {
      const blockstreamResponse = {
        "2": 25,
        "3": 20,
        "6": 15
      };

      vi.mocked(apiClient.get)
        .mockResolvedValueOnce(okResponse({
          fastestFee: 'invalid',
          halfHourFee: 15,
          hourFee: 10
        }))
        .mockResolvedValueOnce(okResponse(blockstreamResponse));

      const feeRates = await getFeeRates();
      expect(feeRates).toEqual({
        fastestFee: 25,
        halfHourFee: 20,
        hourFee: 15
      });
    });

    it('should throw error when all sources fail', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('All sources failed'));

      await expect(getFeeRates()).rejects.toThrow(
        'Unable to fetch fee rates from any source'
      );
    });

    it('should throw error when all sources return invalid data', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(okResponse({ invalid: 'data' }));

      await expect(getFeeRates()).rejects.toThrow(
        'Unable to fetch fee rates from any source'
      );
    });

    it('should validate returned fee rates structure', async () => {
      vi.mocked(apiClient.get)
        .mockResolvedValueOnce(okResponse({
          fastestFee: 20,
          halfHourFee: 15,
          // Missing hourFee
        }))
        .mockResolvedValueOnce(okResponse({
          "2": 20,
          "3": 15,
          "6": 10
        }));

      const feeRates = await getFeeRates();
      expect(feeRates).toEqual(mockFeeRates);
    });

    it('should handle HTTP errors gracefully', async () => {
      const blockstreamResponse = {
        "2": 30,
        "3": 25,
        "6": 20
      };

      vi.mocked(apiClient.get)
        .mockRejectedValueOnce(new Error('Request failed with status 500'))
        .mockResolvedValueOnce(okResponse(blockstreamResponse));

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

      vi.mocked(apiClient.get)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(okResponse(blockstreamResponse));

      const feeRates = await getFeeRates();
      expect(feeRates).toEqual({
        fastestFee: 35,
        halfHourFee: 30,
        hourFee: 25
      });
    });

    it('should handle partial invalid data in response', async () => {
      vi.mocked(apiClient.get)
        .mockResolvedValueOnce(okResponse({
          fastestFee: 20,
          halfHourFee: NaN, // Invalid
          hourFee: 10
        }))
        .mockResolvedValueOnce(okResponse({
          "2": 40,
          "3": 35,
          "6": 30
        }));

      const feeRates = await getFeeRates();
      expect(feeRates).toEqual({
        fastestFee: 40,
        halfHourFee: 35,
        hourFee: 30
      });
    });
  });
});
