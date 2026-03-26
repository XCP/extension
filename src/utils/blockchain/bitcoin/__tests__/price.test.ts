import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchFromCoinbase,
  fetchFromKraken,
  fetchFromMempool,
  getBtcPrice,
  PriceData
} from '@/utils/blockchain/bitcoin/price';
import { apiClient } from '@/utils/apiClient';
import type { ApiResponse } from '@/utils/apiClient';

vi.mock('@/utils/apiClient');

/** Helper to build a typed ApiResponse for mocking */
function mockApiResponse<T>(data: T): ApiResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: {} };
}

describe('Bitcoin Price Utilities', () => {
  const mockedGet = vi.mocked(apiClient).get;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchFromCoinbase', () => {
    it('should fetch price from Coinbase successfully', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({ data: { amount: '45000.50' } })
      );

      const data = await fetchFromCoinbase();

      expect(data.bitcoin.usd).toBe(45000.50);
      expect(mockedGet).toHaveBeenCalledWith(
        'https://api.coinbase.com/v2/prices/spot?currency=USD',
        { retries: 0 }
      );
    });

    it('should handle integer price values', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({ data: { amount: '30000' } })
      );

      const data = await fetchFromCoinbase();
      expect(data.bitcoin.usd).toBe(30000);
    });

    it('should handle decimal price values', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({ data: { amount: '45000.123456' } })
      );

      const data = await fetchFromCoinbase();
      expect(data.bitcoin.usd).toBe(45000.123456);
    });

    it('should throw error when response is missing data', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({})
      );

      await expect(fetchFromCoinbase()).rejects.toThrow('Invalid response data');
    });

    it('should throw error when data field is missing', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({ notData: 'value' })
      );

      await expect(fetchFromCoinbase()).rejects.toThrow('Invalid response data');
    });

    it('should throw error when amount field is missing', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({ data: { notAmount: '30000' } })
      );

      await expect(fetchFromCoinbase()).rejects.toThrow('Invalid response data');
    });

    it('should throw error when amount is null', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({ data: { amount: null } })
      );

      await expect(fetchFromCoinbase()).rejects.toThrow('Invalid response data');
    });

    it('should handle network errors', async () => {
      mockedGet.mockRejectedValue(new Error('Network error'));

      await expect(fetchFromCoinbase()).rejects.toThrow('Network error');
    });

    it('should handle very large price values', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({ data: { amount: '999999999.99' } })
      );

      const data = await fetchFromCoinbase();
      expect(data.bitcoin.usd).toBe(999999999.99);
    });

    it('should handle zero price value', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({ data: { amount: '0' } })
      );

      const data = await fetchFromCoinbase();
      expect(data.bitcoin.usd).toBe(0);
    });
  });

  describe('fetchFromKraken', () => {
    it('should fetch price from Kraken successfully', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({
          result: {
            XXBTZUSD: {
              c: ['45000.50', '1.00000000']
            }
          }
        })
      );

      const data = await fetchFromKraken();

      expect(data.bitcoin.usd).toBe(45000.50);
      expect(mockedGet).toHaveBeenCalledWith(
        'https://api.kraken.com/0/public/Ticker?pair=XBTUSD',
        { retries: 0 }
      );
    });

    it('should throw error when result is missing', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({})
      );

      await expect(fetchFromKraken()).rejects.toThrow('Invalid response data');
    });

    it('should throw error when XXBTZUSD is missing', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({ result: {} })
      );

      await expect(fetchFromKraken()).rejects.toThrow('Invalid response data');
    });

    it('should throw error when c field is missing', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({
          result: {
            XXBTZUSD: { notC: 'value' }
          }
        })
      );

      await expect(fetchFromKraken()).rejects.toThrow('Invalid response data');
    });

    it('should handle network errors', async () => {
      mockedGet.mockRejectedValue(new Error('Kraken API error'));

      await expect(fetchFromKraken()).rejects.toThrow('Kraken API error');
    });

    it('should handle empty c array', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({
          result: {
            XXBTZUSD: {
              c: []
            }
          }
        })
      );

      const data = await fetchFromKraken();
      expect(data.bitcoin.usd).toBeNaN(); // parseFloat of undefined returns NaN
    });

    it('should handle very precise decimal values', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({
          result: {
            XXBTZUSD: {
              c: ['45000.12345678', '1.00000000']
            }
          }
        })
      );

      const data = await fetchFromKraken();
      expect(data.bitcoin.usd).toBe(45000.12345678);
    });
  });

  describe('fetchFromMempool', () => {
    it('should fetch price from Mempool.space successfully', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({ USD: 45000.75 })
      );

      const data = await fetchFromMempool();

      expect(data.bitcoin.usd).toBe(45000.75);
      expect(mockedGet).toHaveBeenCalledWith(
        'https://mempool.space/api/v1/prices',
        { retries: 0 }
      );
    });

    it('should throw error when response is empty', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({})
      );

      await expect(fetchFromMempool()).rejects.toThrow('Invalid response data');
    });

    it('should throw error when USD field is missing', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({ EUR: 42000 })
      );

      await expect(fetchFromMempool()).rejects.toThrow('Invalid response data');
    });

    it('should throw error when USD is not a number', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({ USD: 'not-a-number' })
      );

      await expect(fetchFromMempool()).rejects.toThrow('Invalid response data');
    });

    it('should throw error when USD is null', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({ USD: null })
      );

      await expect(fetchFromMempool()).rejects.toThrow('Invalid response data');
    });

    it('should handle network errors', async () => {
      mockedGet.mockRejectedValue(new Error('Mempool API error'));

      await expect(fetchFromMempool()).rejects.toThrow('Mempool API error');
    });

    it('should handle zero price', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({ USD: 0 })
      );

      const data = await fetchFromMempool();
      expect(data.bitcoin.usd).toBe(0);
    });

    it('should handle negative price (edge case)', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({ USD: -100 })
      );

      const data = await fetchFromMempool();
      expect(data.bitcoin.usd).toBe(-100);
    });
  });

  describe('getBtcPrice', () => {
    it('should return price from first successful fetcher', async () => {
      const mockFetcher1 = vi.fn().mockResolvedValue({ bitcoin: { usd: 45000 } });
      const mockFetcher2 = vi.fn().mockResolvedValue({ bitcoin: { usd: 46000 } });
      const mockFetcher3 = vi.fn().mockResolvedValue({ bitcoin: { usd: 47000 } });

      const price = await getBtcPrice([mockFetcher1, mockFetcher2, mockFetcher3]);

      expect(price).toBe(45000);
      expect(mockFetcher1).toHaveBeenCalled();
      // Promise.any returns the first fulfilled promise, so other fetchers might not be called
    });

    it('should return price from second fetcher if first fails', async () => {
      const mockFetcher1 = vi.fn().mockRejectedValue(new Error('First failed'));
      const mockFetcher2 = vi.fn().mockResolvedValue({ bitcoin: { usd: 46000 } });
      const mockFetcher3 = vi.fn().mockResolvedValue({ bitcoin: { usd: 47000 } });

      const price = await getBtcPrice([mockFetcher1, mockFetcher2, mockFetcher3]);

      expect(price).toBe(46000);
    });

    it('should return null when all fetchers fail', async () => {
      const mockFetcher1 = vi.fn().mockRejectedValue(new Error('First failed'));
      const mockFetcher2 = vi.fn().mockRejectedValue(new Error('Second failed'));
      const mockFetcher3 = vi.fn().mockRejectedValue(new Error('Third failed'));

      const price = await getBtcPrice([mockFetcher1, mockFetcher2, mockFetcher3]);

      expect(price).toBeNull();
    });

    it('should use default fetchers when none provided', async () => {
      // Mock apiClient.get to fail for Coinbase, succeed for Kraken
      mockedGet
        .mockRejectedValueOnce(new Error('Coinbase failed'))
        .mockResolvedValueOnce(
          mockApiResponse({
            result: {
              XXBTZUSD: {
                c: ['50000', '1.00000000']
              }
            }
          })
        );

      const price = await getBtcPrice();

      expect(typeof price).toBe('number');
      expect(price).toBeGreaterThan(0);
    });

    it('should handle invalid price data from fetcher', async () => {
      const mockFetcher1 = vi.fn().mockResolvedValue({ bitcoin: { usd: 'invalid' } });
      const mockFetcher2 = vi.fn().mockResolvedValue({ bitcoin: { usd: 46000 } });

      const price = await getBtcPrice([mockFetcher1, mockFetcher2]);

      expect(price).toBe(46000);
    });

    it('should handle missing bitcoin.usd field', async () => {
      const mockFetcher1 = vi.fn().mockResolvedValue({ notBitcoin: { usd: 45000 } });
      const mockFetcher2 = vi.fn().mockResolvedValue({ bitcoin: { usd: 46000 } });

      const price = await getBtcPrice([mockFetcher1, mockFetcher2]);

      expect(price).toBe(46000);
    });

    it('should handle null bitcoin.usd field', async () => {
      const mockFetcher1 = vi.fn().mockResolvedValue({ bitcoin: { usd: null } });
      const mockFetcher2 = vi.fn().mockResolvedValue({ bitcoin: { usd: 46000 } });

      const price = await getBtcPrice([mockFetcher1, mockFetcher2]);

      expect(price).toBe(46000);
    });

    it('should handle undefined bitcoin field', async () => {
      const mockFetcher1 = vi.fn().mockResolvedValue({ bitcoin: undefined });
      const mockFetcher2 = vi.fn().mockResolvedValue({ bitcoin: { usd: 46000 } });

      const price = await getBtcPrice([mockFetcher1, mockFetcher2]);

      expect(price).toBe(46000);
    });

    it('should handle empty fetchers array', async () => {
      const price = await getBtcPrice([]);

      expect(price).toBeNull();
    });

    it('should handle concurrent execution correctly', async () => {
      // Create fetchers with different delays to test concurrency
      const mockFetcher1 = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ bitcoin: { usd: 45000 } }), 100))
      );
      const mockFetcher2 = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ bitcoin: { usd: 46000 } }), 50))
      );
      const mockFetcher3 = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ bitcoin: { usd: 47000 } }), 200))
      );

      const startTime = Date.now();
      const price = await getBtcPrice([mockFetcher1, mockFetcher2, mockFetcher3]);
      const endTime = Date.now();

      // Should return the fastest successful result (46000 with 50ms delay)
      expect(price).toBe(46000);
      // Should complete in less than 150ms (faster than the slowest, with some margin for test environment variations)
      expect(endTime - startTime).toBeLessThan(150);
    });

    it('should validate price is a number', async () => {
      const mockFetcher1 = vi.fn().mockResolvedValue({ bitcoin: { usd: NaN } });
      const mockFetcher2 = vi.fn().mockResolvedValue({ bitcoin: { usd: 46000 } });

      const price = await getBtcPrice([mockFetcher1, mockFetcher2]);

      expect(price).toBe(46000);
    });

    it('should handle very large price values', async () => {
      const largePrice = Number.MAX_SAFE_INTEGER;
      const mockFetcher = vi.fn().mockResolvedValue({ bitcoin: { usd: largePrice } });

      const price = await getBtcPrice([mockFetcher]);

      expect(price).toBe(largePrice);
    });

    it('should handle zero price', async () => {
      const mockFetcher = vi.fn().mockResolvedValue({ bitcoin: { usd: 0 } });

      const price = await getBtcPrice([mockFetcher]);

      expect(price).toBe(0);
    });
  });

  describe('integration tests', () => {
    it('should work with real API structure from Coinbase', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({
          data: {
            base: 'BTC',
            currency: 'USD',
            amount: '45000.00'
          }
        })
      );

      const data = await fetchFromCoinbase();
      expect(data.bitcoin.usd).toBe(45000);
    });

    it('should work with real API structure from Kraken', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({
          error: [],
          result: {
            XXBTZUSD: {
              a: ['45000.00000', '1', '1.000'],
              b: ['44999.90000', '1', '1.000'],
              c: ['45000.00000', '0.01000000'],
              v: ['100.12345678', '200.12345678'],
              p: ['44950.12345', '44975.54321'],
              t: [500, 1000],
              l: ['44900.00000', '44900.00000'],
              h: ['45100.00000', '45200.00000'],
              o: '44950.00000'
            }
          }
        })
      );

      const data = await fetchFromKraken();
      expect(data.bitcoin.usd).toBe(45000);
    });

    it('should work with real API structure from Mempool', async () => {
      mockedGet.mockResolvedValue(
        mockApiResponse({
          USD: 45000,
          EUR: 42000,
          GBP: 35000,
          CAD: 60000,
          CHF: 41000,
          AUD: 65000,
          JPY: 6500000
        })
      );

      const data = await fetchFromMempool();
      expect(data.bitcoin.usd).toBe(45000);
    });

    it('should maintain PriceData interface compliance', () => {
      const testData: PriceData = { bitcoin: { usd: 45000 } };
      expect(testData.bitcoin.usd).toBe(45000);
      expect(typeof testData.bitcoin.usd).toBe('number');
    });
  });
});
