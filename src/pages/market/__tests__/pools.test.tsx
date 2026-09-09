import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAddressPools, fetchPools, type PaginatedResponse, type Pool, type PoolPosition } from '@/core/counterparty/api';
import { asBaseUnits } from '@/core/numeric';
import MarketPage from '../index';

const mocks = vi.hoisted(() => ({
  inView: false,
  ref: vi.fn(),
  setHeaderProps: vi.fn(),
  lockKeychain: vi.fn(),
  activeAddress: { address: '1F6zwfr9VePPFJYFfQt9FWmMmJ1iVn1ziJ', name: 'Test address' },
  settings: { fiat: 'usd', priceUnit: 'sats' },
  emptyList: { data: [], isLoading: false, isFetchingMore: false, error: null },
  search: vi.fn(),
}));

vi.mock('@/core/counterparty/api', () => ({ fetchPools: vi.fn(), fetchAddressPools: vi.fn() }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: mocks.setHeaderProps }) }));
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => ({ settings: mocks.settings }) }));
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({ activeAddress: mocks.activeAddress, lockKeychain: mocks.lockKeychain }),
}));
vi.mock('@/hooks/useInView', () => ({ useInView: () => ({ ref: mocks.ref, inView: mocks.inView }) }));
vi.mock('@/hooks/useMarketPrices', () => ({ useMarketPrices: () => ({ btc: null, xcp: null }) }));
vi.mock('@/hooks/usePendingStatus', () => ({
  usePendingCancellations: () => ({ orderHashes: new Set(), dispenserHashes: new Set() }),
}));
vi.mock('@/hooks/useMarketData', () => ({
  useMarketData: () => ({
    dispensers: mocks.emptyList,
    orders: mocks.emptyList,
    userDispensers: mocks.emptyList,
    userOrders: mocks.emptyList,
    filteredUserDispensers: [],
    filteredUserOrders: [],
    dispenserResults: [],
    orderResults: [],
    dispenserSearch: mocks.emptyList,
    orderSearch: mocks.emptyList,
    dispenserSearchLoading: false,
    orderSearchLoading: false,
    dispenserSearchError: null,
    orderSearchError: null,
    handleDispenserSearch: mocks.search,
    handleOrderSearch: mocks.search,
    PAGE_SIZE: 20,
  }),
}));
vi.mock('@/components/domain/dispenser/manage-dispenser-card', () => ({ ManageDispenserCard: () => null }));
vi.mock('@/components/domain/dispenser/market-dispenser-card', () => ({ MarketDispenserCard: () => null }));
vi.mock('@/components/domain/price/price-ticker', () => ({ PriceTicker: () => null }));
vi.mock('@/components/ui/cards/manage-order-card', () => ({ ManageOrderCard: () => null }));
vi.mock('@/components/ui/cards/market-order-card', () => ({ MarketOrderCard: () => null }));
vi.mock('@/components/ui/cards/pool-card', () => ({
  PoolCard: ({ pool, onClick }: { pool: Pool; onClick: () => void }) => (
    <button type="button" data-testid="pool" onClick={onClick}>{pool.asset_a} / {pool.asset_b}</button>
  ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function pool(asset: string): PoolPosition {
  return { asset_a: asset, asset_b: 'XCP', lp_asset: `LP${asset}`, reserve_a: 100, reserve_b: 200, quantity: asBaseUnits(100_000_000) };
}

const firstPage = (prefix = 'ASSET') => Array.from({ length: 20 }, (_, index) => pool(`${prefix}${index}`));
const page = <T extends Pool>(result: T[], result_count = 21): PaginatedResponse<T> => ({ result, result_count });

function renderPools(mode = 'explore') {
  const element = () => <MemoryRouter initialEntries={[`/market?tab=pools&mode=${mode}`]}><MarketPage /></MemoryRouter>;
  const rendered = render(element());
  return {
    ...rendered,
    async setInView(value: boolean) {
      await act(async () => {
        mocks.inView = value;
        rendered.rerender(element());
      });
    },
  };
}

async function resolve<T>(request: ReturnType<typeof deferred<T>>, value: T) {
  // Real effects must run between request start and completion: resolving every
  // fetch immediately can conceal cleanup that cancels its own load-more request.
  await act(async () => { request.resolve(value); await request.promise; });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.inView = false;
  mocks.activeAddress = { address: '1F6zwfr9VePPFJYFfQt9FWmMmJ1iVn1ziJ', name: 'Test address' };
});
afterEach(cleanup);

describe('Market pools pagination', () => {
  it.each(['explore', 'manage'])('appends a delayed second %s page and ends its spinner', async (mode) => {
    const initial = deferred<PaginatedResponse<PoolPosition>>();
    const more = deferred<PaginatedResponse<PoolPosition>>();
    const fetch = mode === 'manage' ? vi.mocked(fetchAddressPools) : vi.mocked(fetchPools);
    fetch.mockReturnValueOnce(initial.promise).mockReturnValueOnce(more.promise);
    const view = renderPools(mode);

    await resolve(initial, page(firstPage()));
    expect(screen.getAllByTestId('pool')).toHaveLength(20);
    await view.setInView(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    // Scrolling away while the network request is pending must not discard it.
    await view.setInView(false);

    await resolve(more, page([pool('PEPEMEMECOIN')]));
    expect.soft(screen.queryByText('PEPEMEMECOIN / XCP')).toBeInTheDocument();
    expect.soft(screen.queryByRole('status')).not.toBeInTheDocument();
    expect.soft(screen.getAllByTestId('pool')).toHaveLength(21);
    if (mode === 'manage') {
      expect(fetchAddressPools).toHaveBeenLastCalledWith(mocks.activeAddress.address, { limit: 20, offset: 20 });
    } else {
      expect(fetchPools).toHaveBeenLastCalledWith({ limit: 20, offset: 20 });
    }
  });

  it.each(['view', 'tab', 'address'])('ignores an old page after a %s switch and allows the new session to paginate', async (switchKind) => {
    const initial = deferred<PaginatedResponse<PoolPosition>>();
    const stale = deferred<PaginatedResponse<PoolPosition>>();
    const replacement = deferred<PaginatedResponse<PoolPosition>>();
    const replacementMore = deferred<PaginatedResponse<PoolPosition>>();
    const initialFetch = switchKind === 'address' ? vi.mocked(fetchAddressPools) : vi.mocked(fetchPools);
    const replacementFetch = switchKind === 'tab' ? vi.mocked(fetchPools) : vi.mocked(fetchAddressPools);
    initialFetch.mockReturnValueOnce(initial.promise).mockReturnValueOnce(stale.promise);
    replacementFetch.mockReturnValueOnce(replacement.promise).mockReturnValueOnce(replacementMore.promise);
    const view = renderPools(switchKind === 'address' ? 'manage' : 'explore');
    await resolve(initial, page(firstPage()));
    await view.setInView(true);
    expect(initialFetch).toHaveBeenCalledTimes(2);
    await view.setInView(false);

    if (switchKind === 'view') {
      await act(async () => { fireEvent.click(within(screen.getByRole('tablist', { name: 'View mode' })).getAllByRole('tab')[1]!); });
    } else if (switchKind === 'address') {
      mocks.activeAddress = { address: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT', name: 'Other address' };
      await view.setInView(false);
    } else {
      await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Orders' })); });
      await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Pools' })); });
    }
    await resolve(replacement, page(firstPage('NEW')));
    expect(screen.getAllByTestId('pool')).toHaveLength(20);
    expect(screen.getByText('NEW0 / XCP')).toBeInTheDocument();

    await view.setInView(true);
    expect(replacementFetch).toHaveBeenCalledTimes(switchKind === 'view' ? 2 : 4);
    if (switchKind === 'address') {
      expect(fetchAddressPools).toHaveBeenLastCalledWith(mocks.activeAddress.address, { limit: 20, offset: 20 });
    }
    await resolve(stale, page([pool('STALE')]));
    expect(screen.queryByText('STALE / XCP')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    await resolve(replacementMore, page([pool('FRESH')]));
    expect(screen.getByText('FRESH / XCP')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps loaded rows on load-more failure, ends the spinner, and retries the same offset', async () => {
    const initial = deferred<PaginatedResponse<PoolPosition>>();
    const failed = deferred<PaginatedResponse<PoolPosition>>();
    const retry = deferred<PaginatedResponse<PoolPosition>>();
    vi.mocked(fetchPools).mockReturnValueOnce(initial.promise).mockReturnValueOnce(failed.promise).mockReturnValueOnce(retry.promise);
    const view = renderPools();
    await resolve(initial, page(firstPage()));
    await view.setInView(true);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();

    await act(async () => { failed.reject(new Error('Pool request failed')); await failed.promise.catch(() => {}); });
    expect.soft(screen.queryByRole('status')).not.toBeInTheDocument();
    expect.soft(screen.queryByText('Pool request failed')).toBeInTheDocument();
    expect(screen.getAllByTestId('pool')).toHaveLength(20);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /retry/i })); });
    expect(fetchPools).toHaveBeenLastCalledWith({ limit: 20, offset: 20 });
    expect(fetchPools).toHaveBeenCalledTimes(3);
    await resolve(retry, page([pool('PEPEMEMECOIN')]));
    expect(screen.getByText('PEPEMEMECOIN / XCP')).toBeInTheDocument();
    expect(screen.queryByText('Pool request failed')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('searches remaining pages when the first page has no matches and the sentinel is not visible', async () => {
    const initial = deferred<PaginatedResponse<PoolPosition>>();
    const more = deferred<PaginatedResponse<PoolPosition>>();
    const last = deferred<PaginatedResponse<PoolPosition>>();
    vi.mocked(fetchPools).mockReturnValueOnce(initial.promise).mockReturnValueOnce(more.promise).mockReturnValueOnce(last.promise);
    renderPools();
    await resolve(initial, page(firstPage(), 41));
    expect(fetchPools).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'PEPEMEMECOIN' } });
    });
    expect(fetchPools).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status', { name: 'Searching pools…' })).toBeInTheDocument();
    expect(screen.queryByText('No pools matching "PEPEMEMECOIN"')).not.toBeInTheDocument();
    await resolve(more, page(firstPage('MIDDLE'), 41));
    expect(fetchPools).toHaveBeenCalledTimes(3);
    expect(fetchPools).toHaveBeenLastCalledWith({ limit: 20, offset: 40 });
    expect(screen.getByRole('status', { name: 'Searching pools…' })).toBeInTheDocument();
    expect(screen.queryByText('No pools matching "PEPEMEMECOIN"')).not.toBeInTheDocument();
    await resolve(last, page([pool('PEPEMEMECOIN')], 41));
    expect(screen.getByText('PEPEMEMECOIN / XCP')).toBeInTheDocument();
    expect(screen.getAllByTestId('pool')).toHaveLength(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('retries the initial page at offset zero after an initial failure', async () => {
    const failed = deferred<PaginatedResponse<PoolPosition>>();
    const retry = deferred<PaginatedResponse<PoolPosition>>();
    vi.mocked(fetchPools).mockReturnValueOnce(failed.promise).mockReturnValueOnce(retry.promise);
    renderPools();

    await act(async () => { failed.reject(new Error('Initial pool request failed')); await failed.promise.catch(() => {}); });
    expect(screen.getByText('Initial pool request failed')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /retry/i })); });
    expect(fetchPools).toHaveBeenCalledTimes(2);
    expect(fetchPools).toHaveBeenLastCalledWith({ limit: 20, offset: 0 });
    await resolve(retry, page([pool('PEPEMEMECOIN')], 1));
    expect(screen.getByText('PEPEMEMECOIN / XCP')).toBeInTheDocument();
    expect(screen.queryByText('Initial pool request failed')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
