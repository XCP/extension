import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOracle } from './oracleRequest';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchOracle', () => {
  it('retries transient server failures', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const request = fetchOracle('https://oracle.example/test');
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(request).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns a non-retryable response immediately', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOracle('https://oracle.example/test')).resolves.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
