import { useState, useEffect, useRef, useCallback } from 'react';
import { getCurrentBlockHeight } from '@/utils/blockchain/bitcoin/blockHeight';

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
  
  const isMountedRef = useRef(true);
  const isFetchingRef = useRef(false);

  const fetchBlockHeight = useCallback(async (forceRefresh = false): Promise<number | null> => {
    // Prevent overlapping requests
    if (isFetchingRef.current) {
      return blockHeight;
    }
    
    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);
    
    try {
      const height = await getCurrentBlockHeight(forceRefresh);
      
      if (isMountedRef.current) {
        setBlockHeight(height);
        setIsLoading(false);
      }
      
      return height;
    } catch (err: unknown) {
      if (isMountedRef.current) {
        console.error('Error fetching block height:', err);
        // Use generic error to prevent leaking internal details
        setError('Unable to fetch current block height.');
        setIsLoading(false);
      }
      return null;
    } finally {
      isFetchingRef.current = false;
    }
  }, [blockHeight]);

  // Initial fetch on mount if autoFetch is true
  useEffect(() => {
    if (autoFetch) {
      fetchBlockHeight();
    } else {
      setIsLoading(false);
    }
  }, [autoFetch]);

  // Set up refresh interval if provided
  useEffect(() => {
    if (refreshInterval && refreshInterval > 0) {
      const intervalId = setInterval(() => {
        fetchBlockHeight(true); // Force refresh on interval
      }, refreshInterval);
      
      return () => clearInterval(intervalId);
    }
  }, [refreshInterval, fetchBlockHeight]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return { 
    blockHeight, 
    isLoading, 
    error, 
    refresh: () => fetchBlockHeight(true) 
  };
} 