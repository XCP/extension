import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLiveApi, LiveApiRateLimitError, parseRetryAfter, resetLiveApiQueue } from './liveApi';

const URL_ = 'https://api.example/v2/transactions/unpack?datahex=00';
const NO_SPACING = { spacingMs: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  resetLiveApiQueue();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const status = (code: number, headers: Record<string, string> = {}) =>
  new Response(code === 200 ? '{}' : 'busy', { status: code, headers });

describe('fetchLiveApi', () => {
  it('retries transient server failures with exponential backoff', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(status(200));
    vi.stubGlobal('fetch', fetchMock);

    const request = fetchLiveApi(URL_, { ...NO_SPACING, baseDelayMs: 1_000 });
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second wait doubles.
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    await expect(request).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('waits as long as Retry-After asks on a 429', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(status(429, { 'Retry-After': '7' }))
      .mockResolvedValueOnce(status(200));
    vi.stubGlobal('fetch', fetchMock);

    const request = fetchLiveApi(URL_, { ...NO_SPACING, baseDelayMs: 1_000 });
    await vi.advanceTimersByTimeAsync(6_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(request).resolves.toMatchObject({ status: 200 });
  });

  it('caps a Retry-After longer than the per-wait ceiling', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(status(429, { 'Retry-After': '3600' }))
      .mockResolvedValueOnce(status(200));
    vi.stubGlobal('fetch', fetchMock);

    const request = fetchLiveApi(URL_, { ...NO_SPACING, maxDelayMs: 5_000, maxTotalWaitMs: 10_000 });
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(request).resolves.toMatchObject({ status: 200 });
  });

  it('fails by name when the rate limit outlasts the budget', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => status(429));
    vi.stubGlobal('fetch', fetchMock);

    const request = fetchLiveApi(URL_, {
      ...NO_SPACING, maxAttempts: 10, baseDelayMs: 1_000, maxDelayMs: 4_000, maxTotalWaitMs: 6_000,
    });
    const outcome = expect(request).rejects.toThrow(LiveApiRateLimitError);
    await vi.advanceTimersByTimeAsync(60_000);
    await outcome;
    await expect(request).rejects.toThrow(/still rate limited \(HTTP 429\) after 3 attempts and 3s/);
    // Waits of 1s and 2s fit the 6s budget; the next (4s) would not, so it stops at three calls.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops after maxAttempts even inside the time budget', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => status(429));
    vi.stubGlobal('fetch', fetchMock);

    const request = fetchLiveApi(URL_, { ...NO_SPACING, maxAttempts: 2, baseDelayMs: 10 });
    const outcome = expect(request).rejects.toThrow(LiveApiRateLimitError);
    await vi.advanceTimersByTimeAsync(1_000);
    await outcome;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns an exhausted 5xx rather than throwing, so the caller can report it', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => status(502));
    vi.stubGlobal('fetch', fetchMock);

    const request = fetchLiveApi(URL_, { ...NO_SPACING, maxAttempts: 2, baseDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(request).resolves.toMatchObject({ status: 502 });
  });

  it('returns a non-retryable response immediately', async () => {
    const fetchMock = vi.fn().mockResolvedValue(status(400));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchLiveApi(URL_, NO_SPACING)).resolves.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('retries a network error and rethrows it once attempts run out', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    const request = fetchLiveApi(URL_, { ...NO_SPACING, maxAttempts: 3, baseDelayMs: 10 });
    const outcome = expect(request).rejects.toThrow('fetch failed');
    await vi.advanceTimersByTimeAsync(1_000);
    await outcome;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('spaces the starts of consecutive requests', async () => {
    const starts: number[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      starts.push(Date.now());
      return status(200);
    }));

    const all = Promise.all([
      fetchLiveApi(URL_, { spacingMs: 500 }),
      fetchLiveApi(URL_, { spacingMs: 500 }),
      fetchLiveApi(URL_, { spacingMs: 500 }),
    ]);
    await vi.advanceTimersByTimeAsync(2_000);
    await all;

    expect(starts).toHaveLength(3);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(500);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(500);
  });
});

describe('parseRetryAfter', () => {
  it('reads delta-seconds', () => {
    expect(parseRetryAfter('12')).toBe(12_000);
  });

  it('reads an HTTP date relative to now', () => {
    const now = Date.parse('2026-09-26T12:00:00Z');
    expect(parseRetryAfter('Sat, 26 Sep 2026 12:00:05 GMT', now)).toBe(5_000);
    expect(parseRetryAfter('Sat, 26 Sep 2026 11:59:00 GMT', now)).toBe(0);
  });

  it('ignores a missing or unreadable header', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
  });
});
