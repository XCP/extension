import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  fetchFromCoinbase, 
  fetchFromKraken, 
  fetchFromMempool, 
  getBtcPrice,
  PriceData 
} from '@/utils/blockchain/bitcoin/price';

describe('Bitcoin Price Utilities', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('fetchFromCoinbase', () => {
    it('should fetch price from Coinbase successfully', async () => {
      const mockResponse = { data: { amount: '45000.50' } };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const data = await fetchFromCoinbase();
      
      expect(data.bitcoin.usd).toBe(45000.50);
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.coinbase.com/v2/prices/spot?currency=USD');
    });

    it('should handle integer price values', async () => {
      const mockResponse = { data: { amount: '30000' } };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const data = await fetchFromCoinbase();
      expect(data.bitcoin.usd).toBe(30000);
    });

    it('should handle decimal price values', async () => {
      const mockResponse = { data: { amount: '45000.123456' } };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const data = await fetchFromCoinbase();
      expect(data.bitcoin.usd).toBe(45000.123456);
    });

    it('should throw error when response is missing data', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(fetchFromCoinbase()).rejects.toThrow('Invalid data from Coinbase');
    });

    it('should throw error when data field is missing', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ notData: 'value' }),
      });

      await expect(fetchFromCoinbase()).rejects.toThrow('Invalid data from Coinbase');
    });

    it('should throw error when amount field is missing', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { notAmount: '30000' } }),
      });

      await expect(fetchFromCoinbase()).rejects.toThrow('Invalid data from Coinbase');
    });

    it('should throw error when amount is null', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { amount: null } }),
      });

      await expect(fetchFromCoinbase()).rejects.toThrow('Invalid data from Coinbase');
    });

    it('should handle network errors', async () => {
      (globalThis.fetch as any).mockRejectedValue(new Error('Network error'));

      await expect(fetchFromCoinbase()).rejects.toThrow('Network error');
    });

    it('should handle JSON parsing errors', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      await expect(fetchFromCoinbase()).rejects.toThrow('Invalid JSON');
    });

    it('should handle very large price values', async () => {
      const mockResponse = { data: { amount: '999999999.99' } };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const data = await fetchFromCoinbase();
      expect(data.bitcoin.usd).toBe(999999999.99);
    });

    it('should handle zero price value', async () => {
      const mockResponse = { data: { amount: '0' } };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const data = await fetchFromCoinbase();
      expect(data.bitcoin.usd).toBe(0);
    });
  });

  describe('fetchFromKraken', () => {
    it('should fetch price from Kraken successfully', async () => {
      const mockResponse = {
        result: {
          XXBTZUSD: {
            c: ['45000.50', '1.00000000']
          }
        }
      };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const data = await fetchFromKraken();
      
      expect(data.bitcoin.usd).toBe(45000.50);
      expect(globalThis.fetch).toHaveBeenCalledWith('https://api.kraken.com/0/public/Ticker?pair=XBTUSD');
    });

    it('should throw error when result is missing', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(fetchFromKraken()).rejects.toThrow('Invalid data from Kraken');
    });

    it('should throw error when XXBTZUSD is missing', async () => {
      const mockResponse = { result: {} };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(fetchFromKraken()).rejects.toThrow('Invalid data from Kraken');
    });

    it('should throw error when c field is missing', async () => {
      const mockResponse = {
        result: {
          XXBTZUSD: { notC: 'value' }
        }
      };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(fetchFromKraken()).rejects.toThrow('Invalid data from Kraken');
    });

    it('should handle network errors', async () => {
      (globalThis.fetch as any).mockRejectedValue(new Error('Kraken API error'));

      await expect(fetchFromKraken()).rejects.toThrow('Kraken API error');
    });

    it('should handle empty c array', async () => {
      const mockResponse = {
        result: {
          XXBTZUSD: {
            c: []
          }
        }
      };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const data = await fetchFromKraken();
      expect(data.bitcoin.usd).toBeNaN(); // parseFloat of undefined returns NaN
    });

    it('should handle very precise decimal values', async () => {
      const mockResponse = {
        result: {
          XXBTZUSD: {
            c: ['45000.12345678', '1.00000000']
          }
        }
      };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const data = await fetchFromKraken();
      expect(data.bitcoin.usd).toBe(45000.12345678);
    });
  });

  describe('fetchFromMempool', () => {
    it('should fetch price from Mempool.space successfully', async () => {
      const mockResponse = { USD: 45000.75 };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const data = await fetchFromMempool();
      
      expect(data.bitcoin.usd).toBe(45000.75);
      expect(globalThis.fetch).toHaveBeenCalledWith('https://mempool.space/api/v1/prices');
    });

    it('should throw error when response is empty', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(fetchFromMempool()).rejects.toThrow('Invalid data from Mempool.space');
    });

    it('should throw error when USD field is missing', async () => {
      const mockResponse = { EUR: 42000 };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(fetchFromMempool()).rejects.toThrow('Invalid data from Mempool.space');
    });

    it('should throw error when USD is not a number', async () => {
      const mockResponse = { USD: 'not-a-number' };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(fetchFromMempool()).rejects.toThrow('Invalid data from Mempool.space');
    });

    it('should throw error when USD is null', async () => {
      const mockResponse = { USD: null };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(fetchFromMempool()).rejects.toThrow('Invalid data from Mempool.space');
    });

    it('should handle network errors', async () => {
      (globalThis.fetch as any).mockRejectedValue(new Error('Mempool API error'));

      await expect(fetchFromMempool()).rejects.toThrow('Mempool API error');
    });

    it('should handle zero price', async () => {
      const mockResponse = { USD: 0 };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const data = await fetchFromMempool();
      expect(data.bitcoin.usd).toBe(0);
    });

    it('should handle negative price (edge case)', async () => {
      const mockResponse = { USD: -100 };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

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
      // Mock all default APIs to fail except one
      (globalThis.fetch as any)
        .mockRejectedValueOnce(new Error('Coinbase failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            result: {
              XXBTZUSD: {
                c: ['50000', '1.00000000']
              }
            }
          }),
        });

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
      const realCoinbaseResponse = {
        data: {
          base: 'BTC',
          currency: 'USD',
          amount: '45000.00'
        }
      };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => realCoinbaseResponse,
      });

      const data = await fetchFromCoinbase();
      expect(data.bitcoin.usd).toBe(45000);
    });

    it('should work with real API structure from Kraken', async () => {
      const realKrakenResponse = {
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
      };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => realKrakenResponse,
      });

      const data = await fetchFromKraken();
      expect(data.bitcoin.usd).toBe(45000);
    });

    it('should work with real API structure from Mempool', async () => {
      const realMempoolResponse = {
        USD: 45000,
        EUR: 42000,
        GBP: 35000,
        CAD: 60000,
        CHF: 41000,
        AUD: 65000,
        JPY: 6500000
      };
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => realMempoolResponse,
      });

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
