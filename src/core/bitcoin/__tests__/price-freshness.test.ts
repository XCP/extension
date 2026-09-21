import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheTTL } from '@/core/api/cache';
import { type ApiResponse, apiClient } from '@/core/api/client';

vi.mock('@/core/api/client');

function response<T>(data: T): ApiResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: {} };
}

describe('current BTC quote freshness', () => {
  let now = 1_000_000;
  const get = vi.mocked(apiClient.get);

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it.each(['usd', 'cny'] as const)('uses %s stats within the TTL but returns unavailable at expiry when providers fail', async currency => {
    const { getBtc24hStats } = await import('@/core/bitcoin/price');
    const stats = { price: currency === 'usd' ? 100000 : 700000, change24h: 1 };
    get.mockResolvedValueOnce(response({ bitcoin: { [currency]: stats.price, [`${currency}_24h_change`]: 1 } }));
    expect(await getBtc24hStats(currency)).toEqual(stats);

    now += CacheTTL.VERY_LONG - 1;
    get.mockRejectedValue(new Error('Provider unavailable'));
    expect(await getBtc24hStats(currency)).toEqual(stats);
    expect(get).toHaveBeenCalledTimes(1);

    now += 1;
    expect(await getBtc24hStats(currency)).toBeNull();
    expect(get).toHaveBeenCalledTimes(currency === 'usd' ? 3 : 2);
    if (currency === 'cny') {
      expect(get.mock.calls.every(([url]) => url.includes('vs_currencies=cny'))).toBe(true);
    }
  });

  it('does not reuse a day-old CNY quote and recovers when a fresh request succeeds', async () => {
    const { getBtc24hStats } = await import('@/core/bitcoin/price');
    get.mockResolvedValueOnce(response({ bitcoin: { cny: 700000, cny_24h_change: 0 } }));
    expect((await getBtc24hStats('cny'))?.price).toBe(700000);
    now += 24 * 60 * 60 * 1000;
    get.mockRejectedValueOnce(new Error('Provider unavailable'));
    expect(await getBtc24hStats('cny')).toBeNull();

    get.mockResolvedValueOnce(response({ bitcoin: { cny: 1400000, cny_24h_change: 1 } }));
    expect((await getBtc24hStats('cny'))?.price).toBe(1400000);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('deduplicates an expired quote refresh without returning the expired value', async () => {
    const { getBtc24hStats } = await import('@/core/bitcoin/price');
    get.mockResolvedValueOnce(response({ bitcoin: { cny: 700000, cny_24h_change: 0 } }));
    await getBtc24hStats('cny');
    now += CacheTTL.VERY_LONG;

    let fail!: (error: Error) => void;
    get.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    const first = getBtc24hStats('cny');
    const second = getBtc24hStats('cny');
    expect(get).toHaveBeenCalledTimes(2);
    fail(new Error('Provider unavailable'));
    expect(await Promise.all([first, second])).toEqual([null, null]);
  });

  it('does not revive a prior USD spot quote or stats quote when all spot providers fail', async () => {
    const { getBtc24hStats, getBtcPrice } = await import('@/core/bitcoin/price');
    get.mockResolvedValueOnce(response({ bitcoin: { usd: 100000, usd_24h_change: 0 } }));
    await getBtc24hStats('usd');
    get.mockResolvedValue(response({ data: { amount: '100000' } }));
    expect(await getBtcPrice()).toBe(100000);

    get.mockRejectedValue(new Error('All providers unavailable'));
    expect(await getBtcPrice()).toBeNull();
    expect(get).toHaveBeenCalledTimes(7);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('does not cache an unusable current CNY quote: %s', async price => {
    const { getBtc24hStats } = await import('@/core/bitcoin/price');
    get.mockResolvedValueOnce(response({ bitcoin: { cny: price, cny_24h_change: 0 } }));
    expect(await getBtc24hStats('cny')).toBeNull();
    get.mockResolvedValueOnce(response({ bitcoin: { cny: 700000, cny_24h_change: 0 } }));
    expect((await getBtc24hStats('cny'))?.price).toBe(700000);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it.each(['0', '-1', 'NaN', 'Infinity'])('rejects an unusable CoinCap USD fallback: %s', async priceUsd => {
    const { getBtc24hStats } = await import('@/core/bitcoin/price');
    get.mockRejectedValueOnce(new Error('CoinGecko unavailable'));
    get.mockResolvedValueOnce(response({ data: { priceUsd, changePercent24Hr: '0' } }));
    expect(await getBtc24hStats('usd')).toBeNull();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('does not accept an unusable USD spot quote: %s', async price => {
    const { getBtcPrice } = await import('@/core/bitcoin/price');
    expect(await getBtcPrice([async () => ({ bitcoin: { usd: price } })])).toBeNull();
  });

  it('keeps historical fallback separate from current quote availability', async () => {
    const { getBtcPriceHistory } = await import('@/core/bitcoin/price');
    const history = [{ timestamp: now, price: 700000 }];
    get.mockResolvedValueOnce(response({ prices: [[now, 700000]] }));
    expect(await getBtcPriceHistory('24h', 'cny')).toEqual(history);
    now += 24 * 60 * 60 * 1000;
    get.mockRejectedValue(new Error('History unavailable'));
    expect(await getBtcPriceHistory('24h', 'cny')).toEqual(history);
  });
});
