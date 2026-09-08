import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAssetDetails, fetchOrderMatchesByPair, fetchOrdersByPair, type Order, type OrderMatch, type PaginatedResponse } from '@/core/counterparty/api';
import { asDisplayUnits } from '@/core/numeric';
import AssetOrdersPage from '../[baseAsset]/[quoteAsset]';

const mocks = vi.hoisted(() => ({
  pair: { baseAsset: 'OLD', quoteAsset: 'XCP' }, inView: false,
  ref: vi.fn(), navigate: vi.fn(), setHeaderProps: vi.fn(), copy: vi.fn(), isCopied: () => false,
}));
vi.mock('react-router', () => ({ useParams: () => mocks.pair, useNavigate: () => mocks.navigate }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: mocks.setHeaderProps }) }));
vi.mock('@/hooks/useInView', () => ({ useInView: () => ({ ref: mocks.ref, inView: mocks.inView }) }));
vi.mock('@/hooks/useCopyToClipboard', () => ({ useCopyToClipboard: () => ({ copy: mocks.copy, isCopied: mocks.isCopied }) }));
vi.mock('@/core/counterparty/api', () => ({ fetchAssetDetails: vi.fn(), fetchOrdersByPair: vi.fn(), fetchOrderMatchesByPair: vi.fn() }));
vi.mock('@/components/domain/asset/asset-header', () => ({ AssetHeader: () => null }));
vi.mock('@/components/ui/cards/order-book-level-card', () => ({
  OrderBookLevelCard: ({ formattedPrice, formattedAmount }: { formattedPrice: string; formattedAmount: string }) =>
    <div data-testid="level">{formattedPrice}: {formattedAmount}</div>,
}));
vi.mock('@/components/ui/cards/market-match-card', () => ({
  MarketMatchCard: ({ match }: { match: OrderMatch }) => <div data-testid="match">{match.id}</div>,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const page = <T,>(result: T[], result_count = result.length): PaginatedResponse<T> => ({ result, result_count });
function order(id: string, asset = 'OLD', price = '1'): Order {
  return {
    tx_hash: id, give_asset: asset, get_asset: 'XCP', block_time: 1, status: 'open', expire_index: 1,
    give_quantity_normalized: asDisplayUnits('1'), give_remaining_normalized: asDisplayUnits('1'),
    get_quantity_normalized: asDisplayUnits(price), get_remaining_normalized: asDisplayUnits(price),
  };
}
function match(id: string): OrderMatch {
  return {
    id, tx0_hash: id, tx0_index: 1, tx0_address: 'test', tx1_hash: id, tx1_index: 2, tx1_address: 'test',
    forward_asset: 'OLD', backward_asset: 'XCP', forward_quantity: 1, backward_quantity: 1,
    forward_quantity_normalized: asDisplayUnits('1'), backward_quantity_normalized: asDisplayUnits('1'),
    tx0_block_index: 1, tx1_block_index: 1, block_index: 1, block_time: 1, match_expire_index: 2,
    fee_paid: 0, fee_paid_normalized: asDisplayUnits('0'), status: 'completed',
  };
}
const firstMatches = () => Array.from({ length: 20 }, (_, i) => match(`first-${i}`));
async function resolve<T>(request: ReturnType<typeof deferred<T>>, value: T) {
  await act(async () => { request.resolve(value); await request.promise; });
}
async function flush() { await act(async () => {}); }
async function refresh() {
  const header = mocks.setHeaderProps.mock.calls.at(-1)![0] as { rightButton: { onClick: () => void } };
  await act(async () => { header.rightButton.onClick(); });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.pair = { baseAsset: 'OLD', quoteAsset: 'XCP' };
  mocks.inView = false;
  vi.mocked(fetchAssetDetails).mockResolvedValue(null);
  vi.mocked(fetchOrdersByPair).mockResolvedValue(page([order('book')]));
  vi.mocked(fetchOrderMatchesByPair).mockResolvedValue(page([]));
});
afterEach(cleanup);

describe('Order pair pagination ownership', () => {
  it('publishes the complete order book atomically after all pages finish', async () => {
    const last = deferred<PaginatedResponse<Order>>();
    vi.mocked(fetchOrdersByPair)
      .mockResolvedValueOnce(page(Array.from({ length: 20 }, (_, i) => order(`order-${i}`)), 21))
      .mockReturnValueOnce(last.promise);
    render(<AssetOrdersPage />);
    await flush();
    expect(fetchOrdersByPair).toHaveBeenLastCalledWith('OLD', 'XCP', { limit: 20, offset: 20, status: 'open' });
    expect(screen.queryByTestId('level')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    await resolve(last, page([order('last', 'OLD', '2')], 21));
    expect(screen.getAllByTestId('level').map(row => row.textContent)).toEqual(['1: 20', '2: 1']);
  });

  it('ignores a stale pair book and stops its remaining pages after switching pairs', async () => {
    const stale = deferred<PaginatedResponse<Order>>();
    vi.mocked(fetchOrdersByPair).mockReturnValueOnce(stale.promise).mockResolvedValue(page([order('new', 'NEW', '7')]));
    const view = render(<AssetOrdersPage />);
    mocks.pair = { baseAsset: 'NEW', quoteAsset: 'XCP' };
    view.rerender(<AssetOrdersPage />);
    await flush();
    expect(screen.getByTestId('level')).toHaveTextContent('7: 1');
    await resolve(stale, page(Array.from({ length: 20 }, (_, i) => order(`stale-${i}`)), 21));
    expect(fetchOrdersByPair).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('level')).toHaveTextContent('7: 1');
  });

  it('shows a book error without partial levels and retries the book from zero', async () => {
    const failed = deferred<PaginatedResponse<Order>>();
    vi.mocked(fetchOrdersByPair)
      .mockResolvedValueOnce(page(Array.from({ length: 20 }, (_, i) => order(`order-${i}`)), 21))
      .mockReturnValueOnce(failed.promise).mockResolvedValueOnce(page([order('retry', 'OLD', '3')]));
    render(<AssetOrdersPage />);
    await flush();
    await act(async () => { failed.reject(new Error('Order book failed')); await failed.promise.catch(() => {}); });
    expect(screen.getByRole('alert')).toHaveTextContent('Order book failed');
    expect(screen.queryByTestId('level')).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /retry/i })); });
    expect(fetchOrdersByPair).toHaveBeenLastCalledWith('OLD', 'XCP', { limit: 20, offset: 0, status: 'open' });
    expect(screen.getByTestId('level')).toHaveTextContent('3: 1');
  });

  it('ignores pre-refresh history and does not paginate offset zero while refreshed initial data is pending', async () => {
    const stale = deferred<PaginatedResponse<OrderMatch>>();
    const fresh = deferred<PaginatedResponse<OrderMatch>>();
    vi.mocked(fetchOrderMatchesByPair).mockResolvedValueOnce(page(firstMatches(), 21))
      .mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
    const view = render(<AssetOrdersPage />);
    await flush();
    mocks.inView = true;
    view.rerender(<AssetOrdersPage />);
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'History' })); });
    expect(fetchOrderMatchesByPair).toHaveBeenCalledTimes(2);
    await refresh();
    expect(fetchOrderMatchesByPair).toHaveBeenCalledTimes(3);
    await resolve(stale, page([match('stale')], 21));
    expect(screen.queryByText('stale')).not.toBeInTheDocument();
    expect(fetchOrderMatchesByPair).toHaveBeenCalledTimes(3);
    await resolve(fresh, page([match('fresh')], 1));
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('fresh')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('retains loaded history on page error, stops automatic retries, and lets Retry reload history', async () => {
    const failed = deferred<PaginatedResponse<OrderMatch>>();
    vi.mocked(fetchOrderMatchesByPair).mockResolvedValueOnce(page(firstMatches(), 21))
      .mockReturnValueOnce(failed.promise).mockResolvedValueOnce(page([match('retried')], 1));
    const view = render(<AssetOrdersPage />);
    await flush();
    mocks.inView = true;
    view.rerender(<AssetOrdersPage />);
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'History' })); });
    await act(async () => { failed.reject(new Error('History failed')); await failed.promise.catch(() => {}); });
    expect(screen.getAllByTestId('match')).toHaveLength(20);
    expect(screen.getByRole('alert')).toHaveTextContent('History failed');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await act(async () => { view.rerender(<AssetOrdersPage />); });
    expect(fetchOrderMatchesByPair).toHaveBeenCalledTimes(2);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /retry/i })); });
    expect(screen.getByText('retried')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not continue an unmounted order-book pagination loop', async () => {
    const stale = deferred<PaginatedResponse<Order>>();
    vi.mocked(fetchOrdersByPair).mockReturnValueOnce(stale.promise);
    const { unmount } = render(<AssetOrdersPage />);
    unmount();
    await resolve(stale, page(Array.from({ length: 20 }, (_, i) => order(`order-${i}`)), 21));
    expect(fetchOrdersByPair).toHaveBeenCalledTimes(1);
  });

  it('accepts delayed history after scrolling away and deduplicates overlapping rows', async () => {
    const more = deferred<PaginatedResponse<OrderMatch>>();
    vi.mocked(fetchOrderMatchesByPair).mockResolvedValueOnce(page(firstMatches(), 22)).mockReturnValueOnce(more.promise);
    const view = render(<AssetOrdersPage />);
    await flush();
    mocks.inView = true;
    view.rerender(<AssetOrdersPage />);
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'History' })); });
    expect(fetchOrderMatchesByPair).toHaveBeenLastCalledWith('OLD', 'XCP', { limit: 20, offset: 20 });
    expect(screen.getByRole('status')).toBeInTheDocument();
    mocks.inView = false;
    view.rerender(<AssetOrdersPage />);
    await resolve(more, page([match('first-19'), match('new-last')], 22));
    expect(screen.getAllByTestId('match')).toHaveLength(21);
    expect(screen.getByText('new-last')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(fetchOrderMatchesByPair).toHaveBeenCalledTimes(2);
  });

  it('shows initial history errors and retries history without discarding a successful order book', async () => {
    const failed = deferred<PaginatedResponse<OrderMatch>>();
    vi.mocked(fetchOrderMatchesByPair).mockReturnValueOnce(failed.promise).mockResolvedValueOnce(page([match('fresh-history')], 1));
    render(<AssetOrdersPage />);
    await flush();
    expect(screen.getByTestId('level')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'History' })); });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('No OLD/XCP matches')).not.toBeInTheDocument();
    await act(async () => { failed.reject(new Error('Initial history failed')); await failed.promise.catch(() => {}); });
    expect(screen.getByRole('alert')).toHaveTextContent('Initial history failed');
    expect(screen.queryByText('No OLD/XCP matches')).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /retry/i })); });
    expect(fetchOrderMatchesByPair).toHaveBeenLastCalledWith('OLD', 'XCP', { limit: 20, offset: 0 });
    expect(screen.getByText('fresh-history')).toBeInTheDocument();
    expect(fetchOrdersByPair).toHaveBeenCalledTimes(1);
  });

  it('still auto-selects the buy tab if the first successful book arrives through Retry', async () => {
    vi.mocked(fetchOrdersByPair).mockRejectedValueOnce(new Error('Initial book failed'))
      .mockResolvedValueOnce(page([{ ...order('buy'), give_asset: 'XCP', get_asset: 'OLD' }]));
    render(<AssetOrdersPage />);
    await flush();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /retry/i })); });
    expect(screen.getByRole('tab', { name: 'Buy' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('level')).toBeInTheDocument();
  });
});
