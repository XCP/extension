import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/bitcoin/balance', () => ({ clearBalanceCache: vi.fn() }));
vi.mock('@/core/settings', () => ({
  getActiveSettings: () => ({ counterpartyApiBase: 'https://api.counterparty.io' }),
}));

const address = '1AddressAAAAAAAAAAAAAAAAAAAAAAAAAA';
const start = Date.UTC(2026, 8, 7, 12);

describe('Retry-After through the API client and shared request gate', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(start);
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['60', new Date(start + 60_000).toUTCString()])('preserves the full server deadline across a balance refresh: %s', async retryAfter => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":"rate limited"}', {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': retryAfter },
      }))
      .mockImplementation(async () => new Response('{"result":[],"result_count":0}', {
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTokenBalances } = await import('../api');
    const { invalidateAddressBalances } = await import('@/core/balances/invalidate');

    const first = fetchTokenBalances(address);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    invalidateAddressBalances(address);
    const refreshed = fetchTokenBalances(address);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(Promise.all([first, refreshed])).resolves.toEqual([[], []]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(Date.now()).toBe(start + 60_000);
  });

  it.each(['1.5', '-1', '60seconds', 'not a date'])('leaves malformed Retry-After values unavailable for the default backoff: %s', async retryAfter => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': retryAfter },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { apiClient } = await import('@/core/api/client');
    await expect(apiClient.get('https://api.counterparty.io/v2/', { retries: 0 }))
      .rejects.toMatchObject({ status: 429, retryAfter: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['0', new Date(start - 60_000).toUTCString()])('treats an already elapsed deadline as zero: %s', async retryAfter => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': retryAfter },
    })));
    const { apiClient } = await import('@/core/api/client');
    await expect(apiClient.get('https://api.counterparty.io/v2/', { retries: 0 }))
      .rejects.toMatchObject({ status: 429, retryAfter: 0 });
  });
});
