import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentBlockHeight } from '@/core/bitcoin/blockHeight';

interface UseBlockHeightOptions {
  autoFetch?: boolean;
  refreshInterval?: number | null;
}

/**
 * Hook for fetching and using the current Bitcoin block height
 *
 * @param options Configuration options
 * @param options.autoFetch Whether to fetch the block height automatically on mount (default: true)
 * @param options.refreshInterval Interval in milliseconds to refresh the block height (default: null, no refresh)
 * @returns Object containing the current block height, loading state, and error state
 */
export function useBlockHeight(options: UseBlockHeightOptions = {}) {
  const {
    autoFetch = true,
    refreshInterval = null
  } = options;

  const [blockHeight, setBlockHeight] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(autoFetch);
  const [error, setError] = useState<string | null>(null);

  // Set in the effect body, not the initializer, so StrictMode's remount turns it back on.
  const isMountedRef = useRef(false);
  // Overlapping callers share one request rather than skipping it: a caller that skipped never
  // settled its own loading state, which is how StrictMode's remount hung on "loading".
  const inFlightRef = useRef<Promise<number> | null>(null);

  /** Fetch, then apply the result unless the caller that asked has since gone away. */
  const fetchBlockHeight = useCallback(async (forceRefresh: boolean, isCancelled: () => boolean): Promise<number | null> => {
    if (!isCancelled()) {
      setIsLoading(true);
      setError(null);
    }

    let request = inFlightRef.current;
    if (!request) {
      request = getCurrentBlockHeight(forceRefresh).finally(() => { inFlightRef.current = null; });
      inFlightRef.current = request;
    }

    try {
      const height = await request;
      if (!isCancelled()) {
        setBlockHeight(height);
        setIsLoading(false);
      }
      return height;
    } catch (err: unknown) {
      if (!isCancelled()) {
        console.error('Error fetching block height:', err);
        // Use generic error to prevent leaking internal details
        setError('Unable to fetch current block height.');
        setIsLoading(false);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Initial fetch on mount if autoFetch is true. Each run owns its request: StrictMode's first run
  // is cancelled by its cleanup and the remount's run applies the (shared) result.
  useEffect(() => {
    if (!autoFetch) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    void fetchBlockHeight(false, () => cancelled);
    return () => { cancelled = true; };
  }, [autoFetch, fetchBlockHeight]);

  // Set up refresh interval if provided. fetchBlockHeight is stable, so this runs once per interval
  // setting rather than once per new height.
  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0) return;
    let cancelled = false;
    const intervalId = setInterval(() => {
      void fetchBlockHeight(true, () => cancelled); // Force refresh on interval
    }, refreshInterval);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [refreshInterval, fetchBlockHeight]);

  const refresh = useCallback(
    () => fetchBlockHeight(true, () => !isMountedRef.current),
    [fetchBlockHeight]
  );

  return {
    blockHeight,
    isLoading,
    error,
    refresh,
  };
}
