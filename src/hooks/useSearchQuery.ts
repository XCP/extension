import { type SetStateAction, useCallback, useEffect, useState } from "react";
import { analytics } from "@/platform/fathom";

interface Asset {
  symbol: string;
  supply?: string | number;
}

interface UseSearchQueryOptions {
  /** The search endpoint. @default "https://api.xcp.io/v2/assets" */
  apiEndpoint?: string;
  /** Debounce delay in milliseconds. @default 500 */
  debounceMs?: number;
  /** Maximum number of retry attempts on failure. @default 2 */
  maxRetries?: number;
  /** Delay between retry attempts in milliseconds. @default 1000 */
  retryDelayMs?: number;
  /** Maximum time for each request, including its response body. @default 15000 */
  requestTimeoutMs?: number;
}

interface SearchState {
  key: string;
  results: Asset[];
  error: string | null;
  pending: boolean;
}

class SearchHttpError extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number = 0) {
    super(`Search failed with status: ${status}`);
  }
}

function retryAfterMs(response: Response): number {
  const value = response.headers?.get("Retry-After");
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

function abortError(): DOMException {
  return new DOMException("Search cancelled", "AbortError");
}

function waitForRetry(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function searchAttempt(
  query: string,
  endpoint: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<Asset[]> {
  if (signal.aborted) throw abortError();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(abortError());
      controller.abort();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      reject(new Error("Search request timed out. Please try again."));
      controller.abort();
    }, timeoutMs);
  });
  try {
    // Racing the complete operation also bounds a stalled response body, even
    // when a custom fetch implementation ignores the AbortSignal.
    return await Promise.race([
      (async () => {
        const response = await fetch(`${endpoint}?query=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new SearchHttpError(response.status, retryAfterMs(response));
        const data = await response.json();
        if (Array.isArray(data.result)) {
          return data.result.map((row: { asset: string; supply_normalized?: string | null }) => ({
            symbol: row.asset,
            supply: row.supply_normalized ?? undefined,
          }));
        }
        // Preserve custom-endpoint injection; the maintained default uses result.
        if (Array.isArray(data.assets)) return data.assets as Asset[];
        throw new Error("Invalid search response");
      })(),
      interrupted,
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

/** Asset search with immediate pending state, cancellation, and bounded retries. */
export const useSearchQuery = (initialQuery: string = "", options?: UseSearchQueryOptions) => {
  const {
    apiEndpoint = "https://api.xcp.io/v2/assets",
    debounceMs = 500,
    maxRetries = 2,
    retryDelayMs = 1000,
    requestTimeoutMs = 15000,
  } = options || {};
  const [query, setQuery] = useState({ value: initialQuery, revision: 0 });
  const searchQuery = query.value;
  const requestKey = JSON.stringify([query, apiEndpoint, debounceMs, maxRetries, retryDelayMs, requestTimeoutMs]);
  const [state, setState] = useState<SearchState>({ key: "", results: [], error: null, pending: false });
  const isCurrent = state.key === requestKey;
  const isSearching = searchQuery.trim().length > 0 && (!isCurrent || state.pending);

  const setSearchQuery = useCallback((next: SetStateAction<string>) => {
    setQuery((current) => {
      const value = typeof next === "function" ? next(current.value) : next;
      return value === current.value ? current : { value, revision: current.revision + 1 };
    });
  }, []);

  const retry = useCallback(() => {
    if (!searchQuery.trim() || isSearching) return;
    setQuery((current) => ({ ...current, revision: current.revision + 1 }));
  }, [searchQuery, isSearching]);

  const setError = useCallback((next: SetStateAction<string | null>) => {
    setState((current) => {
      const previous = current.key === requestKey
        ? current
        : { key: requestKey, results: [], error: null, pending: searchQuery.trim().length > 0 };
      return { ...previous, error: typeof next === "function" ? next(previous.error) : next };
    });
  }, [requestKey, searchQuery]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    const controller = new AbortController();
    const performSearch = async () => {
      try {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const results = await searchAttempt(searchQuery, apiEndpoint, controller.signal, requestTimeoutMs);
            if (controller.signal.aborted) return;
            setState({ key: requestKey, results, error: null, pending: false });
            if (results.length > 0) void analytics.track("asset_searched").catch(() => {});
            return;
          } catch (err) {
            if (controller.signal.aborted) return;
            // A long rate-limit window should be shown to the user instead of
            // keeping search pending or retrying earlier than the server allows.
            const serverDelay = err instanceof SearchHttpError ? err.retryAfterMs : 0;
            if (attempt === maxRetries || serverDelay > 60_000) throw err;
            await waitForRetry(Math.max(retryDelayMs, serverDelay), controller.signal);
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof SearchHttpError
          ? err.status === 429
            ? "Search is temporarily rate limited. Please try again."
            : "Search failed. Please try again."
          : `Failed to load search results: ${err instanceof Error ? err.message : String(err)}`;
        setState({ key: requestKey, results: [], error: message, pending: false });
      }
    };
    const timer = setTimeout(() => { void performSearch(); }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, requestKey, apiEndpoint, debounceMs, maxRetries, retryDelayMs, requestTimeoutMs]);

  // Old rows/errors never stand in for a new query during its debounce window.
  return {
    searchQuery,
    setSearchQuery,
    searchResults: isCurrent && searchQuery.trim() ? state.results : [],
    isSearching,
    error: isCurrent ? state.error : null,
    setError,
    retry,
  };
};
