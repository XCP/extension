import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface PaginatedResult<T> {
  result: T[];
  result_count?: number;
}

interface PaginationSource<T> {
  fetchFn: (offset: number, limit: number) => Promise<PaginatedResult<T>>;
  pageSize: number;
  maxItems: number;
}

interface PaginationSession<T> extends PaginationSource<T> {
  data: T[];
  enabled: boolean;
  cancelled: boolean;
  generation: number;
  busy: boolean;
  loaded: boolean;
  offset: number;
  hasMore: boolean;
  error: Error | null;
}

interface PaginationState<T> extends PaginationSource<T> {
  data: T[];
  hasMore: boolean;
  isLoading: boolean;
  isFetchingMore: boolean;
  error: Error | null;
}

function emptyState<T>(source: PaginationSource<T>): PaginationState<T> {
  return {
    fetchFn: source.fetchFn, pageSize: source.pageSize, maxItems: source.maxItems,
    data: [], hasMore: source.maxItems > 0, isLoading: false, isFetchingMore: false, error: null,
  };
}

function sameSource<T>(left: PaginationSource<T>, right: PaginationSource<T>): boolean {
  return left.fetchFn === right.fetchFn && left.pageSize === right.pageSize && left.maxItems === right.maxItems;
}

interface UsePaginatedFetchOptions<T> {
  fetchFn: (offset: number, limit: number) => Promise<PaginatedResult<T>>;
  /** Function to extract unique key from item for deduplication */
  getKey?: (item: T) => string;
  /** Number of items per page (default: 20) */
  pageSize?: number;
  /** Maximum total items to fetch (default: 100) */
  maxItems?: number;
  /** Whether to enable fetching (default: true). Use for lazy loading. */
  enabled?: boolean;
}

interface UsePaginatedFetchReturn<T> {
  data: T[];
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  loadMore: () => void;
  reset: () => void;
  refresh: () => void;
}

/**
 * Hook for paginated data fetching with infinite scroll support.
 * Handles initial load, pagination state, load more, and deduplication.
 *
 * @example
 * const { data, isLoading, loadMore, hasMore } = usePaginatedFetch({
 *   fetchFn: (offset, limit) => fetchItems({ offset, limit }),
 *   getKey: (item) => item.id,
 *   enabled: isTabActive,
 * });
 */
export function usePaginatedFetch<T>({
  fetchFn,
  getKey,
  pageSize = 20,
  maxItems = 100,
  enabled = true,
}: UsePaginatedFetchOptions<T>): UsePaginatedFetchReturn<T> {
  const [state, setState] = useState<PaginationState<T>>(() => emptyState({ fetchFn, pageSize, maxItems }));
  const sessionRef = useRef<PaginationSession<T> | null>(null);

  const requestPage = useCallback(async (session: PaginationSession<T>) => {
    if (session.cancelled || !session.enabled || session.busy || !session.hasMore || session.error) return;
    const offset = session.offset;
    const limit = Math.min(session.pageSize, session.maxItems - offset);
    if (limit <= 0) return;

    // Lock before the first await: multiple observers in the same render can ask for this page.
    session.busy = true;
    const generation = session.generation;
    const initial = !session.loaded;
    const isCurrent = () => sessionRef.current === session && !session.cancelled && session.generation === generation;
    setState((previous) => ({ ...previous, isLoading: initial, isFetchingMore: !initial, error: null }));

    try {
      const response = await session.fetchFn(offset, limit);
      if (!isCurrent()) return;
      const rows = response.result.slice(0, limit);
      session.offset = offset + rows.length;
      session.loaded = true;
      const total = response.result_count;
      const hasKnownTotal = typeof total === 'number' && Number.isSafeInteger(total) && total >= 0;
      session.hasMore = rows.length === limit && session.offset < session.maxItems
        && (!hasKnownTotal || session.offset < total);
      session.data = initial ? rows : [...session.data, ...rows];
      setState((previous) => isCurrent() ? {
        ...previous,
        data: session.data,
        hasMore: session.hasMore,
      } : previous);
    } catch (error) {
      if (!isCurrent()) return;
      session.error = error instanceof Error ? error : new Error(String(error));
      // Keep the rows already shown. Scroll observers cannot retry a failed page in a loop;
      // refresh/reset explicitly clear the error before another request is allowed.
      setState((previous) => isCurrent() ? { ...previous, error: session.error } : previous);
    } finally {
      if (isCurrent()) {
        session.busy = false;
        setState((previous) => isCurrent() ? { ...previous, isLoading: false, isFetchingMore: false } : previous);
      }
    }
  }, []);

  useEffect(() => {
    const previous = sessionRef.current;
    const source = { fetchFn, pageSize, maxItems };
    const resume = previous !== null && sameSource(previous, source);
    const session: PaginationSession<T> = {
      ...source, enabled, cancelled: false, generation: 0, busy: false,
      data: resume ? previous.data : [],
      loaded: resume ? previous.loaded : false,
      offset: resume ? previous.offset : 0,
      hasMore: resume ? previous.hasMore : maxItems > 0,
      error: resume ? previous.error : null,
    };
    sessionRef.current = session;
    setState({ ...emptyState(source), data: session.data, hasMore: session.hasMore, error: session.error });
    if (enabled && !session.loaded) void requestPage(session);

    // Changing address/filter, disabling, or unmounting invalidates every request of this
    // session, including a loadMore that started outside the initial-load effect.
    return () => { session.cancelled = true; };
  }, [enabled, fetchFn, pageSize, maxItems, requestPage]);

  const currentSession = useCallback(() => {
    const session = sessionRef.current;
    return session && !session.cancelled && session.enabled === enabled
      && sameSource(session, { fetchFn, pageSize, maxItems }) ? session : null;
  }, [enabled, fetchFn, pageSize, maxItems]);

  const loadMore = useCallback(() => {
    const session = currentSession();
    if (session) void requestPage(session);
  }, [currentSession, requestPage]);

  const reset = useCallback(() => {
    const session = currentSession();
    if (!session) return;
    // Retain the session for its effect cleanup, but invalidate any work already in flight.
    session.generation += 1;
    session.busy = false;
    session.loaded = false;
    session.data = [];
    session.offset = 0;
    session.hasMore = maxItems > 0;
    session.error = null;
    setState(emptyState(session));
  }, [currentSession, maxItems]);

  const refresh = useCallback(() => {
    reset();
    loadMore();
  }, [reset, loadMore]);

  // Effects reset the stored state after a source change. Hide the old source immediately,
  // including the render before that effect runs, so another address's rows never leak through.
  const visible = sameSource(state, { fetchFn, pageSize, maxItems }) ? state : emptyState({ fetchFn, pageSize, maxItems });
  const { data, hasMore, isLoading, isFetchingMore, error } = visible;

  // Deduplicate data as defensive measure
  const deduplicatedData = useMemo(() => {
    if (!getKey) return data;
    const seen = new Set<string>();
    return data.filter((item) => {
      const key = getKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data, getKey]);

  return {
    data: deduplicatedData,
    isLoading,
    isFetchingMore,
    hasMore,
    error,
    loadMore,
    reset,
    refresh,
  };
}
