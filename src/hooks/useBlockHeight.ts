import { useState, useEffect } from 'react';
import { getCurrentBlockHeight } from '@/utils/blockchain/bitcoin';

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
  const [loading, setLoading] = useState<boolean>(autoFetch);
  const [error, setError] = useState<string | null>(null);

  const fetchBlockHeight = async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    
    try {
      const height = await getCurrentBlockHeight(forceRefresh);
      setBlockHeight(height);
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching block height:', err);
      setError(err.message || 'Unable to fetch current block height.');
      setLoading(false);
    }
  };

  // Initial fetch on mount if autoFetch is true
  useEffect(() => {
    if (autoFetch) {
      fetchBlockHeight();
    } else {
      setLoading(false);
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
  }, [refreshInterval]);

  return { 
    blockHeight, 
    loading, 
    error, 
    refresh: () => fetchBlockHeight(true) 
  };
} 