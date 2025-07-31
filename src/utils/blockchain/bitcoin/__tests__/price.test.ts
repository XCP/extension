import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchFromCoinbase } from '@/utils/blockchain/bitcoin/price';

describe('Bitcoin Price Utilities', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should fetch price from Coinbase successfully', async () => {
    const mockResponse = { data: { amount: '30000' } };
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
    const data = await fetchFromCoinbase();
    expect(data.bitcoin.usd).toBe(30000);
  });

  it('should throw an error on invalid response data', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    await expect(fetchFromCoinbase()).rejects.toThrow('Invalid data from Coinbase');
  });
});
