import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePaginatedFetch } from '../usePaginatedFetch';

interface Item { id: string }
interface Page { result: Item[]; result_count?: number }
const page = (ids: string[], result_count?: number): Page => ({ result: ids.map(id => ({ id })), result_count });
const getKey = (item: Item) => item.id;
const fetcher = () => vi.fn<(offset: number, limit: number) => Promise<Page>>();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function complete(request: ReturnType<typeof deferred<Page>>, value: Page) {
  await act(async () => { request.resolve(value); await request.promise; });
}

describe('usePaginatedFetch request boundaries', () => {
  it('loads a changed stable fetch function after the previous initial page completed', async () => {
    const oldFetch = fetcher().mockResolvedValue(page(['old'], 1));
    const newFetch = fetcher().mockResolvedValue(page(['new'], 1));
    const { result, rerender } = renderHook(
      ({ fetchFn }) => usePaginatedFetch({ fetchFn, pageSize: 2 }),
      { initialProps: { fetchFn: oldFetch } },
    );
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'old' }]));
    rerender({ fetchFn: newFetch });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'new' }]));
    expect(newFetch).toHaveBeenCalledExactlyOnceWith(0, 2);
  });

  it('never exposes the old source during the render before a new source effect runs', async () => {
    const pending = deferred<Page>();
    const oldFetch = fetcher().mockResolvedValue(page(['old'], 1));
    const newFetch = fetcher().mockReturnValue(pending.promise);
    const observed: Item[][] = [];
    const { result, rerender } = renderHook(({ fetchFn }) => {
      const current = usePaginatedFetch({ fetchFn });
      if (fetchFn === newFetch) observed.push(current.data);
      return current;
    }, { initialProps: { fetchFn: oldFetch } });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'old' }]));
    rerender({ fetchFn: newFetch });
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.every(rows => rows.length === 0)).toBe(true);
    await complete(pending, page(['new'], 1));
  });

  it.each(['success', 'failure'] as const)('ignores a late old-address page %s while the replacement is loading', async (outcome) => {
    const stale = deferred<Page>();
    const replacement = deferred<Page>();
    const oldFetch = fetcher().mockResolvedValueOnce(page(['old-1', 'old-2'], 3)).mockReturnValueOnce(stale.promise);
    const newFetch = fetcher().mockReturnValueOnce(replacement.promise);
    const { result, rerender } = renderHook(
      ({ fetchFn }) => usePaginatedFetch({ fetchFn, pageSize: 2 }),
      { initialProps: { fetchFn: oldFetch } },
    );
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    act(() => result.current.loadMore());
    rerender({ fetchFn: newFetch });

    await act(async () => {
      if (outcome === 'success') stale.resolve(page(['stale'], 3));
      else stale.reject(new Error('Old address request failed'));
      await stale.promise.catch(() => {});
    });
    expect(result.current.data).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
    act(() => result.current.loadMore());
    expect(newFetch).toHaveBeenCalledTimes(1);
    await complete(replacement, page(['new'], 1));
    expect(result.current.data).toEqual([{ id: 'new' }]);
  });

  it('reset cancels a pending page and allows a fresh request at offset zero', async () => {
    const stale = deferred<Page>();
    const fresh = deferred<Page>();
    const fetchFn = fetcher().mockResolvedValueOnce(page(['a', 'b'], 3))
      .mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
    const { result } = renderHook(() => usePaginatedFetch({ fetchFn, pageSize: 2 }));
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    act(() => result.current.loadMore());
    act(() => result.current.reset());
    expect(result.current.data).toEqual([]);
    expect(result.current.isFetchingMore).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    act(() => result.current.loadMore());
    expect(fetchFn).toHaveBeenLastCalledWith(0, 2);
    await complete(stale, page(['stale'], 3));
    expect(result.current.data).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    await complete(fresh, page(['fresh'], 1));
    expect(result.current.data).toEqual([{ id: 'fresh' }]);
  });

  it('does not fetch while disabled and discards a pending page across disable/re-enable', async () => {
    const stale = deferred<Page>();
    const resumed = deferred<Page>();
    const fetchFn = fetcher().mockResolvedValueOnce(page(['a', 'b'], 3))
      .mockReturnValueOnce(stale.promise).mockReturnValueOnce(resumed.promise);
    const { result, rerender } = renderHook(
      ({ enabled }) => usePaginatedFetch({ fetchFn, pageSize: 2, enabled }),
      { initialProps: { enabled: false } },
    );
    act(() => result.current.loadMore());
    expect(fetchFn).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    act(() => result.current.loadMore());
    rerender({ enabled: false });
    act(() => result.current.loadMore());
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.current.isFetchingMore).toBe(false);
    rerender({ enabled: true });
    await complete(stale, page(['stale'], 3));
    expect(result.current.data).toEqual([{ id: 'a' }, { id: 'b' }]);
    act(() => result.current.loadMore());
    expect(fetchFn).toHaveBeenLastCalledWith(2, 2);
    await complete(resumed, page(['resumed'], 3));
    expect(result.current.data).toHaveLength(3);
  });

  it('blocks duplicate page requests and stops at the reported total using raw row counts', async () => {
    const more = deferred<Page>();
    const fetchFn = fetcher().mockResolvedValueOnce(page(['a', 'b'], 4)).mockReturnValueOnce(more.promise);
    const { result } = renderHook(() => usePaginatedFetch({ fetchFn, pageSize: 2, getKey }));
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    act(() => { result.current.loadMore(); result.current.loadMore(); });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await complete(more, page(['b', 'c'], 4));
    expect(result.current.data).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(result.current.hasMore).toBe(false);
    act(() => result.current.loadMore());
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('keeps the maximum item bound when it is not a multiple of the page size', async () => {
    const fetchFn = fetcher().mockResolvedValueOnce(page(['a', 'b']))
      .mockResolvedValueOnce(page(['c']));
    const { result } = renderHook(() => usePaginatedFetch({ fetchFn, pageSize: 2, maxItems: 3 }));
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.data).toHaveLength(3));
    expect(fetchFn).toHaveBeenLastCalledWith(2, 1);
    expect(result.current.hasMore).toBe(false);
  });

  it('supports an explicit infinite bound for searches beyond the default 100 rows', async () => {
    const fetchFn = fetcher().mockResolvedValueOnce(page(Array.from({ length: 100 }, (_, index) => `row-${index}`), 101))
      .mockResolvedValueOnce(page(['last'], 101));
    const { result } = renderHook(() => usePaginatedFetch({ fetchFn, pageSize: 100, maxItems: Infinity }));
    await waitFor(() => expect(result.current.data).toHaveLength(100));
    expect(result.current.hasMore).toBe(true);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.data).toHaveLength(101));
    expect(fetchFn).toHaveBeenLastCalledWith(100, 100);
    expect(result.current.hasMore).toBe(false);
  });

  it('refresh invalidates a delayed initial request and its failure cannot poison the replacement', async () => {
    const stale = deferred<Page>();
    const fresh = deferred<Page>();
    const fetchFn = fetcher().mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
    const { result } = renderHook(() => usePaginatedFetch({ fetchFn }));
    act(() => result.current.refresh());
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await act(async () => { stale.reject(new Error('Stale refresh')); await stale.promise.catch(() => {}); });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(true);
    await complete(fresh, page(['fresh'], 1));
    expect(result.current.data).toEqual([{ id: 'fresh' }]);
    expect(result.current.isLoading).toBe(false);
  });

  it('retains loaded rows on error, stops automatic retries, and refresh explicitly retries', async () => {
    const failed = deferred<Page>();
    const refresh = deferred<Page>();
    const fetchFn = fetcher().mockResolvedValueOnce(page(['a', 'b'], 3))
      .mockReturnValueOnce(failed.promise).mockReturnValueOnce(refresh.promise);
    const { result } = renderHook(() => usePaginatedFetch({ fetchFn, pageSize: 2 }));
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    act(() => result.current.loadMore());
    await act(async () => { failed.reject(new Error('Try later')); await failed.promise.catch(() => {}); });
    expect(result.current.data).toHaveLength(2);
    expect(result.current.error?.message).toBe('Try later');
    expect(result.current.isFetchingMore).toBe(false);
    act(() => { result.current.loadMore(); result.current.loadMore(); });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    act(() => result.current.refresh());
    expect(fetchFn).toHaveBeenLastCalledWith(0, 2);
    await complete(refresh, page(['fresh'], 1));
    expect(result.current.data).toEqual([{ id: 'fresh' }]);
    expect(result.current.error).toBeNull();
  });
});
