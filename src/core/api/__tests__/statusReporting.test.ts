import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/core/api/client';
import { type ApiStatusEvent, clearApiStatus, subscribeApiStatus } from '@/core/api/status';
import { fetchZeldBalance } from '@/core/zeld/api';

/**
 * The app-wide banner says the wallet's own backend is in trouble. An optional service, or one
 * source among fallbacks, failing is not that, and its callers already degrade quietly.
 */

let events: ApiStatusEvent[] = [];
let unsubscribe: () => void;

beforeEach(() => {
  clearApiStatus();
  events = [];
  unsubscribe = subscribeApiStatus(event => { events.push(event); });
  events = [];
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad Gateway', { status: 502 })));
});

afterEach(() => {
  unsubscribe();
  clearApiStatus();
  vi.unstubAllGlobals();
});

describe('API status banner', () => {
  it('is raised by a 5xx by default', async () => {
    await expect(apiClient.get('https://api.counterparty.io:4000/v2/', { retries: 0 })).rejects.toThrow();
    expect(events).toEqual([expect.objectContaining({ type: 'server-error', statusCode: 502 })]);
  });

  it('is not raised by a request that opts out', async () => {
    await expect(apiClient.get('https://api.kraken.com/0/public/Ticker', { retries: 0, reportStatus: false })).rejects.toThrow();
    expect(events).toEqual([]);
  });

  it('is not raised when the ZELD indexer is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/api/address/')
      ? Response.json([{ txid: 'ab'.repeat(32), vout: 0, value: 546, status: { confirmed: true } }])
      : new Response('Bad Gateway', { status: 502 })));
    await expect(fetchZeldBalance('19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX')).rejects.toThrow();
    expect(events).toEqual([]);
  });

  it('honors status opt-out on batch POST requests', async () => {
    await expect(apiClient.post('https://api.zeldhash.com/utxos', { utxos: [] }, { retries: 0, reportStatus: false })).rejects.toThrow();
    expect(events).toEqual([]);
  });
});
