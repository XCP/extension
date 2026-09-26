import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiError, apiClient, withRetry } from '@/core/api/client';
import { broadcastTransaction } from '@/core/bitcoin/transactionBroadcaster';
import { fetchTokenBalances } from '@/core/counterparty/api';
import { decodeRawTransaction, unpackCounterpartyData } from '@/core/counterparty/transaction';
import { validateCounterpartyApi } from '@/core/validation/api';

/**
 * A request that declares a Content-Type other than the three CORS-safelisted ones is preflighted:
 * the browser sends an OPTIONS round trip first, and Counterparty Core answers it without
 * Access-Control-Max-Age, so every distinct URL pays it again. A request with no body has nothing
 * for a Content-Type to describe, so it must not carry one.
 */

interface Sent { url: string; method: string; headers: Headers }

let sent: Sent[] = [];

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  sent = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    sent.push({ url: String(url), method: init.method ?? 'GET', headers: new Headers(init.headers) });
    const { pathname } = new URL(String(url));
    if (pathname.endsWith('/decode')) return json({ result: { txid: 'x', vin: [], vout: [] } });
    if (pathname.endsWith('/unpack')) return json({ result: { message_type: 'send', message_type_id: 0, message_data: {} } });
    if (pathname === '/v2' || pathname === '/v2/') {
      return json({ result: { server_ready: true, network: 'mainnet', version: '11.0.0', backend_height: 1, counterparty_height: 1 } });
    }
    if (pathname === '/v2/bitcoin/transactions') return json({ result: 'txid' });
    if (pathname === '/api/tx') return new Response('txid', { status: 200 });
    return json({ result: [], result_count: 0 });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requests without a body declare no Content-Type', () => {
  it('a plain GET', async () => {
    await apiClient.get('https://api.counterparty.io:4000/v2/assets/XCP');
    expect(sent[0]!.headers.has('content-type')).toBe(false);
  });

  it('every Counterparty GET the wallet sends', async () => {
    await fetchTokenBalances('bc1qaddress', { type: 'address', limit: 100 });
    await decodeRawTransaction('00');
    await unpackCounterpartyData('00');
    await validateCounterpartyApi('https://api.counterparty.io:4000');

    expect(sent.map(request => request.method)).toEqual(['GET', 'GET', 'GET', 'GET']);
    for (const request of sent) expect(request.headers.has('content-type'), request.url).toBe(false);
  });

  it('a POST with no body, such as the Counterparty broadcast', async () => {
    await apiClient.post('https://api.counterparty.io:4000/v2/bitcoin/transactions?signedhex=00', null, { retries: 0 });
    expect(sent[0]!.headers.has('content-type')).toBe(false);
  });

  it('the broadcast to the Counterparty node, while relays still label their text body', async () => {
    await broadcastTransaction('00');
    const node = sent.find(request => request.url.includes('/v2/bitcoin/transactions'));
    expect(node?.method).toBe('POST');
    expect(node?.headers.has('content-type')).toBe(false);
    const relays = sent.filter(request => request.url.endsWith('/api/tx'));
    expect(relays.length).toBeGreaterThan(0);
    for (const relay of relays) expect(relay.headers.get('content-type')).toBe('text/plain');
  });

  it('keeps the Content-Type of a POST that has a body', async () => {
    await apiClient.post('https://example.test/json', { a: 1 }, { retries: 0 });
    await apiClient.post('https://example.test/form', 'a=1', {
      retries: 0,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(sent[0]!.headers.get('content-type')).toBe('application/json');
    expect(sent[1]!.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
  });
});

describe('retries', () => {
  const timeout = (): ApiError => Object.assign(new Error('timed out'), { code: 'TIMEOUT' as const });

  it('does not re-send a timed-out request when told not to', async () => {
    const request = vi.fn().mockRejectedValue(timeout());
    await expect(withRetry(request, 1, false)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('still re-sends a timed-out request by default', async () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn().mockRejectedValueOnce(timeout()).mockResolvedValue('ok');
      const result = withRetry(request, 1);
      await vi.runAllTimersAsync();
      await expect(result).resolves.toBe('ok');
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
