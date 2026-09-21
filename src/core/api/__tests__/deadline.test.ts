import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../client';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('API response deadlines', () => {
  function stallBody(contentType: string) {
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => {
      const signal = options.signal!;
      return Promise.resolve({
        ok: true, status: 200, headers: new Headers({ 'content-type': contentType }),
        text: () => new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
      });
    }));
  }

  it.each(['application/json', 'text/plain'])('times out a stalled %s body after headers arrive', async contentType => {
    vi.useFakeTimers();
    stallBody(contentType);
    const pending = expect(apiClient.get('https://example.test/data', { timeout: 50, retries: 0 }))
      .rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(50);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves caller cancellation during JSON body reading', async () => {
    vi.useFakeTimers();
    stallBody('application/json');
    const controller = new AbortController();
    const pending = expect(apiClient.get('https://example.test/data', { signal: controller.signal, retries: 0 }))
      .rejects.toMatchObject({ code: 'CANCELLED' });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new Error('User cancelled'));
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
});
