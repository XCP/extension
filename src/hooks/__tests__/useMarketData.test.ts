import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/core/counterparty/api';
import { useMarketData } from '@/hooks/useMarketData';

vi.mock('@/core/counterparty/api');

function dispenser(tx_hash: string, oracle_address?: string | null, asset = 'XCP') {
  return { tx_hash, oracle_address, asset } as api.DispenserDetails;
}
function order(tx_hash: string, give_asset = 'XCP') {
  return { tx_hash, give_asset, get_asset: 'PEPECASH' } as api.OrderDetails;
}
const fixed = dispenser('fixed', null);
const oracle = dispenser('oracle', 'feed');
const options = {
  activeAddress: 'wallet', activeTab: 0, viewMode: 'explore' as 'explore' | 'manage',
  searchQuery: '', inView: false,
};
const response = <T,>(result: T[], total = result.length) => ({ result, result_count: total });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchAllDispensers).mockResolvedValue(response([oracle, fixed]));
  vi.mocked(api.fetchAddressDispensers).mockResolvedValue(response([oracle, fixed]));
  vi.mocked(api.fetchAssetDispensers).mockResolvedValue(response([oracle, fixed]));
  vi.mocked(api.fetchAllOrders).mockResolvedValue(response([]));
  vi.mocked(api.fetchOrders).mockResolvedValue(response([]));
  vi.mocked(api.fetchAssetOrders).mockResolvedValue(response([]));
});

describe('selected market requests', () => {
  it.each(['explore', 'manage'] as const)('does not fetch or search other listings from Pools in %s', async (viewMode) => {
    const { rerender } = renderHook(
      (props) => useMarketData({ ...options, viewMode, ...props }),
      { initialProps: { activeTab: 2, searchQuery: 'PEPEMEMECOIN', inView: false } }
    );
    await act(async () => {
      rerender({ activeTab: 2, searchQuery: 'PEPECASH', inView: true });
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    for (const fetcher of [
      api.fetchAllDispensers, api.fetchAllOrders, api.fetchAddressDispensers,
      api.fetchOrders, api.fetchAssetDispensers, api.fetchAssetOrders,
    ]) expect(fetcher).not.toHaveBeenCalled();
  });

  it('searches only orders after leaving Pools and pauses paging on return', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => order(`order-${i}`));
    vi.mocked(api.fetchAssetOrders).mockResolvedValue(response(rows, 21));
    const { result, rerender } = renderHook(
      props => useMarketData({ ...options, ...props }),
      { initialProps: { activeTab: 2, searchQuery: '', inView: false } }
    );
    rerender({ activeTab: 1, searchQuery: 'PEPEMEMECOIN', inView: false });
    await waitFor(() => expect(result.current.orderResults).toHaveLength(20));
    expect(api.fetchAssetOrders).toHaveBeenCalledWith('PEPEMEMECOIN', { offset: 0, limit: 20, status: 'open' });
    expect(api.fetchAllOrders).not.toHaveBeenCalled();
    expect(api.fetchAllDispensers).not.toHaveBeenCalled();
    expect(api.fetchOrders).not.toHaveBeenCalled();
    await act(async () => {
      rerender({ activeTab: 2, searchQuery: 'PEPECASH', inView: true });
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    expect(api.fetchAssetOrders).toHaveBeenCalledTimes(1);
    expect(api.fetchAssetDispensers).not.toHaveBeenCalled();
  });
});

describe('dispenser visibility and raw pagination', () => {
  it('excludes oracle listings from explore, manage, and asset search', async () => {
    const { result, rerender } = renderHook(props => useMarketData(props), { initialProps: options });
    await waitFor(() => expect(result.current.dispensers.data).toEqual([fixed]));
    expect(api.fetchAddressDispensers).not.toHaveBeenCalled();
    rerender({ ...options, viewMode: 'manage' });
    await waitFor(() => expect(result.current.filteredUserDispensers).toEqual([fixed]));
    rerender({ ...options, searchQuery: 'XCP' });
    await waitFor(() => expect(result.current.dispenserResults).toEqual([fixed]));
  });

  it.each(['explore', 'manage'] as const)('gets past an oracle-only first page in %s', async (viewMode) => {
    const fetcher = viewMode === 'explore' ? api.fetchAllDispensers : api.fetchAddressDispensers;
    vi.mocked(fetcher)
      .mockResolvedValueOnce(response(Array.from({ length: 20 }, (_, i) => dispenser(`oracle-${i}`, 'feed')), 21))
      .mockResolvedValueOnce(response([fixed], 21));
    const { result } = renderHook(() => useMarketData({ ...options, viewMode }));
    await waitFor(() => {
      const page = viewMode === 'explore' ? result.current.dispensers : result.current.userDispensers;
      expect(page.data).toEqual([fixed]);
      expect(page.hasMore).toBe(false);
    });
    expect(vi.mocked(fetcher).mock.calls[1]?.at(-1)).toMatchObject({ offset: 20 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses raw row counts on mixed pages and continues while the sentinel stays visible', async () => {
    vi.mocked(api.fetchAllDispensers)
      .mockResolvedValueOnce(response([fixed, ...Array.from({ length: 19 }, (_, i) => dispenser(`oracle-${i}`, 'feed'))], 42))
      .mockResolvedValueOnce(response(Array.from({ length: 20 }, (_, i) => dispenser(`more-oracles-${i}`, 'feed')), 42))
      .mockResolvedValueOnce(response([oracle, dispenser('second', '')], 42));
    const { result } = renderHook(() => useMarketData({ ...options, inView: true }));
    await waitFor(() => expect(result.current.dispensers.data.map(d => d.tx_hash)).toEqual(['fixed', 'second']));
    expect(api.fetchAllDispensers).toHaveBeenCalledTimes(3);
    expect(api.fetchAllDispensers).toHaveBeenLastCalledWith({ offset: 40, limit: 20, status: 'open' });
    expect(result.current.dispensers.hasMore).toBe(false);
  });
});

describe('market search pagination and ownership', () => {
  it.each([0, 1])('loads an asset search second page on tab %s', async activeTab => {
    const fetcher = activeTab === 0 ? api.fetchAssetDispensers : api.fetchAssetOrders;
    const rows = Array.from({ length: 21 }, (_, i) => activeTab === 0
      ? dispenser(`item-${i}`) : order(`item-${i}`));
    vi.mocked(fetcher).mockImplementation(async (_asset, params) => response(
      rows.slice(params?.offset ?? 0, (params?.offset ?? 0) + 20), 21) as never);
    const { result } = renderHook(() => useMarketData({ ...options, activeTab, searchQuery: 'PARENT.child' }));
    const page = () => activeTab === 0 ? result.current.dispenserSearch : result.current.orderSearch;
    await waitFor(() => expect(page().data).toHaveLength(20));
    act(() => page().loadMore());
    await waitFor(() => expect(page().data).toHaveLength(21));
    expect(fetcher).toHaveBeenLastCalledWith('PARENT.child', { offset: 20, limit: 20, status: 'open' });
    expect(page().hasMore).toBe(false);
  });

  it.each([0, 1])('searches managed positions beyond 100 rows without a visible sentinel on tab %s', async activeTab => {
    const fetcher = activeTab === 0 ? api.fetchAddressDispensers : api.fetchOrders;
    const rows = Array.from({ length: 121 }, (_, i) => activeTab === 0
      ? dispenser(`item-${i}`, null, i === 120 ? 'TARGET' : 'XCP')
      : order(`item-${i}`, i === 120 ? 'TARGET' : 'XCP'));
    vi.mocked(fetcher).mockImplementation(async (_address, params) => response(
      rows.slice(params?.offset ?? 0, (params?.offset ?? 0) + 20), 121) as never);
    const { result } = renderHook(() => useMarketData({
      ...options, activeTab, viewMode: 'manage', searchQuery: 'TARGET', inView: false,
    }));
    await waitFor(() => {
      const matches = activeTab === 0 ? result.current.filteredUserDispensers : result.current.filteredUserOrders;
      expect(matches.map(row => row.tx_hash)).toEqual(['item-120']);
    });
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(fetcher).toHaveBeenLastCalledWith('wallet', { offset: 120, limit: 20, status: 'open' });
  });

  it.each(['resolve', 'reject'] as const)('ignores an older search %s while the replacement is pending', async completion => {
    const old = deferred<ReturnType<typeof response<api.OrderDetails>>>();
    const current = deferred<ReturnType<typeof response<api.OrderDetails>>>();
    vi.mocked(api.fetchAssetOrders)
      .mockImplementationOnce(() => old.promise).mockImplementationOnce(() => current.promise);
    const { result, rerender } = renderHook(
      props => useMarketData({ ...options, activeTab: 1, ...props }),
      { initialProps: { searchQuery: 'OLD' } }
    );
    await waitFor(() => expect(api.fetchAssetOrders).toHaveBeenCalledTimes(1));
    rerender({ searchQuery: 'NEW' });
    expect(result.current.orderResults).toEqual([]);
    expect(result.current.orderSearchLoading).toBe(true);
    await waitFor(() => expect(api.fetchAssetOrders).toHaveBeenCalledTimes(2));
    await act(async () => {
      if (completion === 'resolve') old.resolve(response([order('old')]));
      else old.reject(new Error('Old failed'));
    });
    expect(result.current.orderResults).toEqual([]);
    expect(result.current.orderSearchError).toBeNull();
    expect(result.current.orderSearchLoading).toBe(true);
    await act(async () => current.resolve(response([order('new')])));
    expect(result.current.orderResults.map(row => row.tx_hash)).toEqual(['new']);
    expect(result.current.orderSearchLoading).toBe(false);
  });

  it('retains loaded search results on page failure, stops automatic retry, and recovers on refresh', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => order(`order-${i}`));
    vi.mocked(api.fetchAssetOrders)
      .mockResolvedValueOnce(response(rows, 21))
      .mockRejectedValueOnce(new Error('Rate limited'))
      .mockResolvedValueOnce(response(rows, 21))
      .mockResolvedValueOnce(response([order('last')], 21));
    const { result } = renderHook(() => useMarketData({
      ...options, activeTab: 1, searchQuery: 'XCP', inView: true,
    }));
    await waitFor(() => expect(result.current.orderSearchError).toBe('Rate limited'));
    expect(result.current.orderResults).toHaveLength(20);
    expect(result.current.orderSearch.isFetchingMore).toBe(false);
    expect(api.fetchAssetOrders).toHaveBeenCalledTimes(2);
    act(() => result.current.orderSearch.refresh());
    await waitFor(() => expect(result.current.orderResults).toHaveLength(21));
    expect(result.current.orderSearchError).toBeNull();
    expect(result.current.orderSearch.hasMore).toBe(false);
    expect(api.fetchAssetOrders).toHaveBeenCalledTimes(4);
  });
});
