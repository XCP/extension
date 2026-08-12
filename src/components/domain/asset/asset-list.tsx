import { useCallback, useEffect, useRef, useState } from "react";
import { AssetCard } from "@/components/domain/asset/asset-card";
import { SearchResultCard } from "@/components/domain/asset/search-result-card";
import { SearchInput } from "@/components/ui/inputs/search-input";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchOwnedAssets, type OwnedAsset } from "@/core/counterparty/api";
import { useInView } from "@/hooks/useInView";
import { useRefreshSignal } from "@/hooks/useRefreshSignal";
import { useSearchQuery } from "@/hooks/useSearchQuery";

const PAGE_SIZE = 20;

interface AssetListProps {
  /** Changes to ask for a fresh load; see `useRefreshSignal`. */
  refreshNonce?: number;
  /** Called when a requested refresh finishes, successfully or not. */
  onRefreshed?: () => void;
}

export const AssetList = ({ refreshNonce, onRefreshed }: AssetListProps = {}): React.ReactElement => {
  const { activeAddress } = useWallet();
  const { cacheOwnedAssets } = useHeader();
  const [ownedAssets, setOwnedAssets] = useState<OwnedAsset[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // See BalanceList: the ref confines the completion callback to refreshes that were requested.
  const refreshRequestedRef = useRef(false);
  useRefreshSignal(refreshNonce, () => {
    refreshRequestedRef.current = true;
    setInitialLoaded(false);
  });
  const settleRefresh = () => {
    if (refreshRequestedRef.current) {
      refreshRequestedRef.current = false;
      latestOnRefreshed.current?.();
    }
  };

  // Ref, not a dependency: callers pass an inline arrow that changes every parent render.
  const latestOnRefreshed = useRef(onRefreshed);
  latestOnRefreshed.current = onRefreshed;
  const { searchQuery, setSearchQuery, searchResults, isSearching } = useSearchQuery();

  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "300px", threshold: 0 });

  // Reset when address changes
  useEffect(() => {
    if (!activeAddress?.address) {
      setOwnedAssets([]);
      setOffset(0);
      setHasMore(true);
      setInitialLoaded(false);
    }
  }, [activeAddress]);

  const appendAssets = useCallback((newAssets: OwnedAsset[]) => {
    setOwnedAssets((prev) => {
      const existingKeys = new Set(prev.map((a) => a.asset));
      const unique = newAssets.filter((a) => !existingKeys.has(a.asset));
      return [...prev, ...unique];
    });
    cacheOwnedAssets(newAssets);
  }, [cacheOwnedAssets]);

  // Initial load
  useEffect(() => {
    if (!activeAddress?.address || initialLoaded) {
      // A refresh that raced the address going away is still over; without this the caller's
      // spinner would wait on a load that is never going to start.
      if (!activeAddress?.address) settleRefresh();
      return;
    }

    let isCancelled = false;

    const loadInitial = async () => {
      setIsLoading(true);
      try {
        const assets = await fetchOwnedAssets(activeAddress.address, { limit: PAGE_SIZE, offset: 0 });
        if (!isCancelled) {
          setOwnedAssets(assets);
          cacheOwnedAssets(assets);
          setOffset(PAGE_SIZE);
          if (assets.length < PAGE_SIZE) setHasMore(false);
          setInitialLoaded(true);
        }
      } catch (error) {
        console.error("Error fetching owned assets:", error);
      } finally {
        if (!isCancelled) setIsLoading(false);
        // Outside the cancelled guard: a cancelled load still ends the refresh the caller is
        // showing a spinner for.
        settleRefresh();
      }
    };

    loadInitial();
    return () => { isCancelled = true; };
  }, [activeAddress, cacheOwnedAssets, initialLoaded]);

  // Load more on scroll
  useEffect(() => {
    if (!activeAddress?.address || !hasMore || isFetchingMore || !inView || !initialLoaded) return;

    const loadMore = async () => {
      setIsFetchingMore(true);
      try {
        const assets = await fetchOwnedAssets(activeAddress.address, { limit: PAGE_SIZE, offset });
        if (assets.length < PAGE_SIZE) setHasMore(false);
        if (assets.length > 0) {
          appendAssets(assets);
          setOffset((prev) => prev + PAGE_SIZE);
        } else {
          setHasMore(false);
        }
      } catch (error) {
        console.error("Error fetching more assets:", error);
        setHasMore(false);
      } finally {
        setIsFetchingMore(false);
      }
    };

    loadMore();
  }, [inView, activeAddress, hasMore, offset, appendAssets, isFetchingMore, initialLoaded]);

  if (isLoading) return <Spinner message="Loading owned assets…" />;

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
      {searchQuery ? (
        isSearching ? (
          <Spinner message="Searching assets…" />
        ) : searchResults.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No results found</div>
        ) : (
          searchResults.map((asset) => <SearchResultCard key={asset.symbol} symbol={asset.symbol} navigationType="asset" />)
        )
      ) : ownedAssets.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center">
          <div className="bg-gray-50 rounded-lg p-6 max-w-sm w-full">
            <div className="text-gray-600 text-lg font-medium mb-2">No Assets Owned</div>
            <div className="text-gray-500 text-sm">This address hasn't issued any Counterparty assets.</div>
          </div>
        </div>
      ) : (
        <>
          {ownedAssets.map((asset) => (
            <AssetCard key={asset.asset} asset={asset} />
          ))}
          <div ref={loadMoreRef} className="flex flex-col justify-center items-center py-1">
            {hasMore ? (
              isFetchingMore ? (
                <Spinner className="py-4" />
              ) : (
                <div className="text-sm text-gray-500">Scroll to load more…</div>
              )
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};
