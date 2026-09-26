import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createMockComposeResult, mockAddress, mockDestAddress, mockInputTxid } from '@/core/counterparty/__tests__/helpers/composeTestHelpers';
import { composeSend } from '@/core/counterparty/compose';
import { ReviewSend } from './review';

/**
 * How many requests one XCP send costs, from UTXO selection through the review screen, with every
 * network module real and only `fetch` stubbed. The wallet holds 30 UTXOs.
 */

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { fiat: 'usd' }, updateSettings: vi.fn(), isLoading: false }),
}));

vi.mock('@/contexts/composer-context-object', () => ({
  useComposer: () => ({ state: { decodedMessage: null } }),
  useComposerOptional: () => ({ state: { decodedMessage: null } }),
}));

const UTXO_COUNT = 30;

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

const sent: string[] = [];

function stubNetwork() {
  sent.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(String(input));
    sent.push(`${url.hostname}${url.pathname}`);
    const path = url.pathname;
    if (url.hostname === 'mempool.space' && path.endsWith('/utxo')) {
      return json(Array.from({ length: UTXO_COUNT }, (_, i) => ({
        txid: i === 0 ? mockInputTxid : (i + 1).toString(16).padStart(64, '0'),
        vout: 0,
        value: i === 0 ? 1_000_000 : 1_000 + i,
        status: { confirmed: true, block_height: 1, block_hash: '', block_time: 0 },
      })));
    }
    if (path === '/v2/utxos/withbalances') {
      const utxos = (url.searchParams.get('utxos') ?? '').split(',');
      return json({ result: Object.fromEntries(utxos.map((utxo) => [utxo, false])) });
    }
    if (path.includes('/compose/')) return json({ result: createMockComposeResult() });
    if (url.hostname === 'api.coinbase.com') return json({ data: { amount: '100000' } });
    if (url.hostname === 'api.kraken.com') return json({ result: { XXBTZUSD: { c: ['100000'] } } });
    if (url.hostname === 'mempool.space' && path === '/api/v1/prices') return json({ USD: 100000 });
    if (url.hostname === 'api.xcp.io') return json({ result: { xcp: { usd: 2 } } });
    return new Response('not found', { status: 404 });
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request budget for one send through review', () => {
  // Not retried: price quotes are cached for a minute, so a second attempt would measure the cache.
  it('composes and reviews an XCP send', { retry: 0 }, async () => {
    stubNetwork();
    const composed = await composeSend({
      sourceAddress: mockAddress,
      destination: mockDestAddress,
      asset: 'XCP',
      quantity: '100000000',
      sat_per_vbyte: 10,
    } as Parameters<typeof composeSend>[0]);
    const composeRequests = sent.length;

    render(<ReviewSend apiResponse={composed} onSign={vi.fn()} onBack={vi.fn()} error={null} isSigning={false} />);
    await waitFor(() => expect(screen.getByText('Review Transaction')).toBeInTheDocument());
    await waitFor(() => expect(sent.some((request) => request.startsWith('api.xcp.io'))).toBe(true));
    // Let every price request the screen will make go out.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const byHost = sent.reduce<Record<string, number>>((counts, request) => {
      const host = request.split('/')[0]!;
      counts[host] = (counts[host] ?? 0) + 1;
      return counts;
    }, {});
    console.info(`[request budget] send: ${sent.length} requests (compose ${composeRequests}, review ${sent.length - composeRequests})`, byHost, sent);

    // UTXO list, one membership batch, the compose itself and the ZELD guard's UTXO check; then
    // one BTC and one XCP quote, shared by both price consumers on the review screen.
    expect(composeRequests, JSON.stringify(sent)).toBe(4);
    expect(sent.length - composeRequests, JSON.stringify(sent)).toBe(2);
  });
});
