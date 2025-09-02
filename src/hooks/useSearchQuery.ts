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

  // Extract search function to avoid recreation on every render
  const performSearch = useRef(async (
    query: string,
    controller: AbortController,
    endpoint: string,
    retries: number,
    retryDelay: number
  ) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(
          `${endpoint}?query=${encodeURIComponent(query)}`,
          {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' },
          }
        );

        if (!response.ok) {
          throw new Error(`Search failed with status: ${response.status}`);
        }

        const data = await response.json();
        return data.assets || [];
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw err; // Don't retry aborted requests
        }

        if (attempt === retries) {
          throw err; // Last attempt failed, throw error
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    return [];
  });

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

      try {
        const results = await performSearch.current(
          searchQuery,
          currentAbortController,
          apiEndpoint,
          maxRetries,
          retryDelayMs
        );

        // Only update state if request wasn't aborted
        if (!currentAbortController.signal.aborted) {
          setSearchResults(results);
          setIsSearching(false);
        }
      } catch (err) {
        // Only update error state if request wasn't aborted
        if (!currentAbortController.signal.aborted) {
          setSearchResults([]);
          setIsSearching(false);
          
          const errorMessage = err instanceof Error && err.message.includes('status:')
            ? `Search failed. Please try again.`
            : `Failed to load search results: ${err instanceof Error ? err.message : String(err)}`;
          setError(errorMessage);
          console.error("Asset search error:", err);
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
