import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { AssetCard } from "@/components/domain/asset/asset-card";
import { SearchResultCard } from "@/components/domain/asset/search-result-card";
import { SearchInput } from "@/components/ui/inputs/search-input";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchOwnedAssets, type OwnedAsset } from "@/core/counterparty/api";
import { useInView } from "@/hooks/useInView";
import { useSearchQuery } from "@/hooks/useSearchQuery";

const PAGE_SIZE = 20;

interface AssetListProps {
  /** Changes request a fresh load; the initial value is not a refresh request. */
  refreshNonce?: number;
  /** Called when a requested refresh finishes, successfully or not. */
  onRefreshed?: () => void;
}

export const AssetList = ({ refreshNonce, onRefreshed }: AssetListProps = {}): React.ReactElement => {
  const { activeAddress } = useWallet();
  const { cacheOwnedAssets } = useHeader();
  const address = activeAddress?.address;
  const [ownedAssets, setOwnedAssets] = useState<OwnedAsset[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(Boolean(address));
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const sessionRef = useRef<{ address: string; offset: number; busy: boolean; loaded: boolean; hasMore: boolean } | null>(null);
  const previousRefreshNonce = useRef(refreshNonce);
  // An old request must not stop the spinner for a newer refresh.
  const notifyRefreshed = useEffectEvent((completedNonce: number | undefined) => {
    if (completedNonce === refreshNonce) onRefreshed?.();
  });
  const { searchQuery, setSearchQuery, searchResults, isSearching, error: searchError, retry: retrySearch } = useSearchQuery();
  const isSearchActive = searchQuery.trim().length > 0;

  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "300px", threshold: 0 });

  const appendAssets = useCallback((newAssets: OwnedAsset[]) => {
    setOwnedAssets((prev) => {
      const existingKeys = new Set(prev.map((a) => a.asset));
      const unique = newAssets.filter((a) => !existingKeys.has(a.asset));
      return [...prev, ...unique];
    });
    cacheOwnedAssets(newAssets);
  }, [cacheOwnedAssets]);

  // Every address/refresh owns its requests. Late pages cannot update the next list or its cache.
  useEffect(() => {
    const requestedRefresh = previousRefreshNonce.current !== refreshNonce;
    previousRefreshNonce.current = refreshNonce;
    let settled = false;
    const settleRefresh = () => {
      if (!settled && requestedRefresh) {
        settled = true;
        notifyRefreshed(refreshNonce);
      }
    };
    const session = address ? { address, offset: 0, busy: true, loaded: false, hasMore: true } : null;
    sessionRef.current = session;
    let cancelled = false;

    const loadInitial = async () => {
      if (!session) return;
      setIsLoading(true);
      try {
        const assets = await fetchOwnedAssets(session.address, { limit: PAGE_SIZE, offset: 0 });
        if (sessionRef.current === session) {
          setOwnedAssets(assets);
          cacheOwnedAssets(assets);
          session.offset = PAGE_SIZE;
          session.loaded = true;
          session.hasMore = assets.length === PAGE_SIZE;
          setHasMore(session.hasMore);
          setInitialLoaded(true);
        }
      } catch (error) {
        if (sessionRef.current === session) {
          console.error("Error fetching owned assets:", error);
          setError("Failed to load owned assets.");
        }
      } finally {
        if (sessionRef.current === session) {
          session.busy = false;
          setIsLoading(false);
        }
        settleRefresh();
      }
    };

    queueMicrotask(() => {
      if (cancelled) return;
      setOwnedAssets([]);
      setHasMore(false);
      setInitialLoaded(false);
      setIsFetchingMore(false);
      setError(null);
      if (session) void loadInitial();
      else {
        setIsLoading(false);
        settleRefresh();
      }
    });
    return () => {
      cancelled = true;
      if (sessionRef.current === session) sessionRef.current = null;
      settleRefresh();
    };
  }, [address, cacheOwnedAssets, refreshNonce, retryNonce]);

  // Load more on scroll
  const loadMore = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || session.busy || !session.loaded || !session.hasMore) return;
    session.busy = true;
    setIsFetchingMore(true);
    setError(null);
    try {
      const assets = await fetchOwnedAssets(session.address, { limit: PAGE_SIZE, offset: session.offset });
      if (sessionRef.current !== session) return;
      appendAssets(assets);
      session.offset += PAGE_SIZE;
      session.hasMore = assets.length === PAGE_SIZE;
      setHasMore(session.hasMore);
    } catch (error) {
      if (sessionRef.current === session) {
        console.error("Error fetching more assets:", error);
        setError("Failed to load more assets.");
      }
    } finally {
      if (sessionRef.current === session) {
        session.busy = false;
        setIsFetchingMore(false);
      }
    }
  }, [appendAssets]);

  useEffect(() => {
    if (!inView || !initialLoaded || !hasMore || isFetchingMore || error || isSearchActive) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void loadMore(); });
    return () => { cancelled = true; };
  }, [inView, initialLoaded, hasMore, isFetchingMore, error, isSearchActive, loadMore]);

  return (
    <div className="space-y-2">
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search assets…"
        name="asset-search"
        className="mt-0.5 mb-3"
        showClearButton={true}
        isLoading={isSearching}
      />
      {isSearchActive ? (
        isSearching ? (
          <Spinner message="Searching assets…" />
        ) : searchError ? (
          <div role="alert" className="py-4 text-center text-sm text-red-600">
            <p>{searchError}</p>
            <button type="button" onClick={retrySearch} className="mt-2 text-blue-600 underline cursor-pointer">Retry</button>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No results found</div>
        ) : (
          searchResults.map((asset) => <SearchResultCard key={asset.symbol} symbol={asset.symbol} navigationType="asset" />)
        )
      ) : isLoading ? (
        <Spinner message="Loading owned assets…" />
      ) : (
        <>
          {error && (
            <div role="alert" className="py-4 text-center text-sm text-red-600">
              <p>{error}</p>
              <button type="button" onClick={() => initialLoaded ? void loadMore() : setRetryNonce((n) => n + 1)} className="mt-2 text-blue-600 underline cursor-pointer">Retry</button>
            </div>
          )}
          {ownedAssets.length === 0 ? (
            !error && (
              <div className="flex flex-col items-center justify-center text-center">
                <div className="bg-gray-50 rounded-lg p-6 max-w-sm w-full">
                  <div className="text-gray-600 text-lg font-medium mb-2">No Assets Owned</div>
                  <div className="text-gray-500 text-sm">This address hasn't issued any Counterparty assets.</div>
                </div>
              </div>
            )
          ) : (
            <>
              {ownedAssets.map((asset) => (
                <AssetCard key={asset.asset} asset={asset} />
              ))}
              <div ref={loadMoreRef} className="flex flex-col justify-center items-center py-1">
                {hasMore && !error ? (
                  isFetchingMore ? (
                    <Spinner className="py-4" />
                  ) : (
                    <div className="text-sm text-gray-500">Scroll to load more…</div>
                  )
                ) : null}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
