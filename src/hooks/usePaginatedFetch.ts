import { useState, useEffect, useCallback, useRef, useMemo } from "react";

interface PaginatedResult<T> {
  result: T[];
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
  const [data, setData] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // Trigger for manual refresh - incrementing this causes the effect to re-run
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Refs for race condition prevention
  const isFetchingRef = useRef(false);
  const offsetRef = useRef(0);
  const hasLoadedRef = useRef(false);

  // Initial load - runs when enabled and hasn't loaded yet, or when refresh is triggered
  useEffect(() => {
    if (!enabled || hasLoadedRef.current) return;

    let cancelled = false;
    isFetchingRef.current = true;
    offsetRef.current = 0;
    setIsLoading(true);
    setError(null);

    fetchFn(0, pageSize)
      .then((res) => {
        if (!cancelled) {
          setData(res.result);
          offsetRef.current = pageSize;
          setHasMore(res.result.length >= pageSize && res.result.length < maxItems);
          hasLoadedRef.current = true;
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load initial data:", err);
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
          isFetchingRef.current = false;
        }
      });

    return () => {
      cancelled = true;
      isFetchingRef.current = false;
    };
  }, [enabled, fetchFn, pageSize, maxItems, refreshTrigger]);

  // Reset when fetchFn changes (e.g., different filters)
  useEffect(() => {
    hasLoadedRef.current = false;
  }, [fetchFn]);

  const loadMore = useCallback(() => {
    if (isFetchingRef.current || !hasMore) return;

    const currentDataLength = data.length;
    if (currentDataLength >= maxItems) return;

    isFetchingRef.current = true;
    setIsFetchingMore(true);
    setError(null);

    const currentOffset = offsetRef.current;

    fetchFn(currentOffset, pageSize)
      .then((res) => {
        setData((prev) => [...prev, ...res.result]);
        offsetRef.current = currentOffset + pageSize;
        setHasMore(res.result.length >= pageSize && currentDataLength + res.result.length < maxItems);
      })
      .catch((err) => {
        console.error("Failed to load more data:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        isFetchingRef.current = false;
        setIsFetchingMore(false);
      });
  }, [fetchFn, pageSize, maxItems, hasMore, data.length]);

  const reset = useCallback(() => {
    setData([]);
    setHasMore(true);
    setIsLoading(false);
    setError(null);
    offsetRef.current = 0;
    isFetchingRef.current = false;
    hasLoadedRef.current = false;
  }, []);

  const refresh = useCallback(() => {
    reset();
    // Increment trigger to cause useEffect to re-run after reset clears hasLoadedRef
    setRefreshTrigger((prev) => prev + 1);
  }, [reset]);

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
