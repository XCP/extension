import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@/i18n/test-utils';
import { BalanceList } from './balance-list';

/**
 * How many requests the home screen's balance list costs for a wallet of 50 assets scrolled to the
 * end, with every network module real and only `fetch` stubbed. The default six pinned assets are
 * pinned; the wallet holds two of them.
 */

const ADDRESS = 'bc1qhomescreenrequests';
const PINNED = ['XCP', 'PEPECASH', 'BITCRYSTALS', 'BITCORN', 'CROPS', 'MINTS'];
const HELD = ['XCP', 'PEPECASH', ...Array.from({ length: 48 }, (_, i) => `ASSET${String(i).padStart(2, '0')}`)];

vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({
    activeWallet: { id: 'wallet1', name: 'Wallet' },
    activeAddress: { address: ADDRESS, name: 'Address' },
  }),
}));
vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { pinnedAssets: PINNED, zeldHuntSeconds: 0 } }),
}));
const cacheBalances = vi.fn();
vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({ setHeaderProps: vi.fn(), cacheBalances }),
}));
// Scrolled to the bottom: every page the list would load is loaded.
vi.mock('@/hooks/useInView', () => ({ useInView: () => ({ ref: vi.fn(), inView: true }) }));
vi.mock('@/hooks/useSearchQuery', () => ({
  useSearchQuery: () => ({
    searchQuery: '', setSearchQuery: vi.fn(), searchResults: [], isSearching: false, error: null, retry: vi.fn(),
  }),
}));
vi.mock('@/components/domain/balance/balance-menu', () => ({ BalanceMenu: () => null }));
vi.mock('@/components/domain/asset/asset-icon', () => ({ AssetIcon: () => null }));

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

const row = (asset: string) => ({
  address: ADDRESS,
  asset,
  quantity: 100_000_000,
  quantity_normalized: '1.00000000',
  asset_info: { asset_longname: null, description: '', issuer: '', divisible: true, locked: false },
});

const sent: string[] = [];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('request budget for the home balance list', () => {
  it('loads a 50-asset wallet', { retry: 0 }, async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = new URL(String(input));
      sent.push(`${url.hostname}${url.pathname}${url.search.includes('offset') ? `?offset=${url.searchParams.get('offset')}` : ''}`);
      const path = decodeURIComponent(url.pathname);
      if (url.hostname === 'blockstream.info') {
        return json({ chain_stats: { funded_txo_sum: 100_000, spent_txo_sum: 0 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 } });
      }
      if (path === `/v2/addresses/${ADDRESS}/balances`) {
        const limit = Number(url.searchParams.get('limit'));
        const offset = Number(url.searchParams.get('offset'));
        return json({ result: HELD.slice(offset, offset + limit).map(row), result_count: HELD.length });
      }
      const single = path.match(/\/balances\/([^/]+)$/);
      if (single) {
        const asset = single[1]!;
        return json({ result: HELD.includes(asset) ? [row(asset)] : [], result_count: HELD.includes(asset) ? 1 : 0 });
      }
      if (path === '/v2/addresses/mempool') return json({ result: [], result_count: 0, next_cursor: null });
      return new Response('not found', { status: 404 });
    }));

    render(<BalanceList />);

    await waitFor(() => expect(screen.getByText('ASSET47')).toBeInTheDocument(), { timeout: 5_000 });
    await waitFor(() => expect(screen.queryByText('Scroll to load more…')).not.toBeInTheDocument());
    // Let anything the list would still ask for go out.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const counterparty = sent.filter((request) => request.startsWith('api.counterparty.io'));
    // BTC balance, ZELD balance, pending ledger events, and one page of balances that also answers
    // every pinned asset: no per-asset reads and no second page.
    expect(counterparty, JSON.stringify(sent)).toHaveLength(2);
    expect(sent, JSON.stringify(sent)).toHaveLength(4);
  });
});
