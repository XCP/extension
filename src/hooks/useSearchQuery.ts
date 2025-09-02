import { useState, useEffect, useRef } from "react";

interface Asset {
  symbol: string;
  supply?: string | number;
}

interface UseSearchQueryOptions {
  /**
   * The API endpoint to use for searching.
   * @default "https://app.xcp.io/api/v1/simple-search"
   */
  apiEndpoint?: string;
  /**
   * The debounce delay in milliseconds.
   * @default 500
   */
  debounceMs?: number;
  /**
   * Maximum number of retry attempts on failure.
   * @default 2
   */
  maxRetries?: number;
  /**
   * Delay between retry attempts in milliseconds.
   * @default 1000
   */
  retryDelayMs?: number;
}

/**
 * Hook for searching assets with debouncing, cancellation, and retry logic.
 * 
 * @param initialQuery - The initial search query
 * @param options - Configuration options for the search behavior
 * @returns Object containing search state and controls
 */
export const useSearchQuery = (
  initialQuery: string = "",
  options?: UseSearchQueryOptions
) => {
  const {
    apiEndpoint = "https://app.xcp.io/api/v1/simple-search",
    debounceMs = 500,
    maxRetries = 2,
    retryDelayMs = 1000,
  } = options || {};

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Use AbortController for proper request cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear results if query is empty
    if (!searchQuery || searchQuery.trim() === '') {
      setSearchResults([]);
      setIsSearching(false);
      setError(null);
      return;
    }

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Clear existing debounce timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set up debounced search
    debounceTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      setError(null);

      // Create new AbortController for this request
      abortControllerRef.current = new AbortController();
      const currentAbortController = abortControllerRef.current;

      let retryCount = 0;
      let lastError: Error | null = null;

      // Retry logic
      while (retryCount <= maxRetries) {
        try {
          const response = await fetch(
            `${apiEndpoint}?query=${encodeURIComponent(searchQuery)}`,
            {
              signal: currentAbortController.signal,
              headers: {
                'Accept': 'application/json',
              },
            }
          );

          if (!response.ok) {
            throw new Error(`Search failed with status: ${response.status}`);
          }

          const data = await response.json();
          
          // Only update state if request wasn't aborted
          if (!currentAbortController.signal.aborted) {
            setSearchResults(data.assets || []);
            setIsSearching(false);
            return; // Success, exit retry loop
          }
          break;
        } catch (err) {
          // Don't retry if request was aborted
          if (err instanceof Error && err.name === 'AbortError') {
            break;
          }

          lastError = err instanceof Error ? err : new Error(String(err));
          retryCount++;

          // If we haven't exhausted retries, wait before trying again
          if (retryCount <= maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          }
        }
      }

      // Only update error state if request wasn't aborted
      if (!currentAbortController.signal.aborted) {
        setSearchResults([]);
        setIsSearching(false);
        
        if (lastError) {
          const errorMessage = lastError.message.includes('status:')
            ? `Search failed. Please try again.`
            : `Failed to load search results: ${lastError.message}`;
          setError(errorMessage);
          console.error("Asset search error:", lastError);
        }
      }
    }, debounceMs);

    // Cleanup function
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [searchQuery, apiEndpoint, debounceMs, maxRetries, retryDelayMs]);

  return { 
    searchQuery, 
    setSearchQuery, 
    searchResults, 
    isSearching, 
    error, 
    setError 
  };
};
