import { useState, useEffect, useCallback, useRef, type ReactElement } from "react";
import { useInView } from "@/hooks/useInView";
import { Spinner } from "@/components/spinner";
import { SearchInput } from "@/components/inputs/search-input";
import { BalanceMenu } from "@/components/menus/balance-menu";
import { BalanceCard } from "@/components/cards/balance-card";
import { SearchResultCard } from "@/components/cards/search-result-card";
import { useWallet } from "@/contexts/wallet-context";
import { fetchBTCBalance } from "@/utils/blockchain/bitcoin";
import { fetchTokenBalance, fetchTokenBalances } from "@/utils/blockchain/counterparty";
import type { TokenBalance } from "@/utils/blockchain/counterparty";
import { formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";
import { useSearchQuery } from "@/hooks/useSearchQuery";
import { useSettings } from "@/contexts/settings-context";



export const BalanceList = (): ReactElement => {
  const { activeWallet, activeAddress } = useWallet();
  const { settings } = useSettings();
  const [allBalances, setAllBalances] = useState<TokenBalance[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const { searchQuery, setSearchQuery, searchResults, isSearching } = useSearchQuery();

  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "300px", threshold: 0 });

  // Debug logging
  console.log('[BalanceList] State:', {
    inView,
    hasMore,
    isFetchingMore,
    offset,
    balanceCount: allBalances.length,
    initialLoaded
  });

  useEffect(() => {
    setInitialLoaded(false);
  }, [settings?.pinnedAssets]);

  const upsertBalance = useCallback((balance: TokenBalance) => {
    console.log('[upsertBalance] Called with:', {
      asset: balance?.asset,
      quantity_normalized: balance?.quantity_normalized,
      hasAssetInfo: !!balance?.asset_info
    });

    if (!balance?.asset || balance?.quantity_normalized === undefined) {
      console.log('[upsertBalance] REJECTED - missing asset or quantity_normalized');
      return;
    }

    setAllBalances((prev) => {
      const idx = prev.findIndex((b) => b.asset.toUpperCase() === balance.asset.toUpperCase());
      if (idx > -1) {
        const newBalances = [...prev];
        newBalances[idx] = balance;
        console.log('[upsertBalance] Updated existing:', balance.asset);
        return newBalances;
      }
      console.log('[upsertBalance] Added new:', balance.asset);
      return [...prev, balance];
    });
  }, []);

  useEffect(() => {
    if (!activeAddress || !activeWallet || initialLoaded) {
      if (!activeAddress || !activeWallet) {
        setAllBalances([]);
        setOffset(0);
        setHasMore(true);
      }
      return;
    }

    let isCancelled = false;

    const loadInitialBalances = async () => {
      console.log('[BalanceList] Loading initial balances...');
      setIsInitialLoading(true);
      try {
        const balanceSats = await fetchBTCBalance(activeAddress.address);
        const balanceBTC = fromSatoshis(balanceSats, true);
        const btcBalance: TokenBalance = {
          asset: "BTC",
          quantity_normalized: formatAmount({
            value: balanceBTC,
            maximumFractionDigits: 8,
            minimumFractionDigits: 8
          }),
          asset_info: {
            asset_longname: null,
            description: "Bitcoin",
            issuer: "",
            divisible: true,
            locked: true,
            supply: "21000000"
          },
        };
        if (!isCancelled) upsertBalance(btcBalance);

        const pinnedAssets = settings?.pinnedAssets || [];
        const nonBTCAssets = pinnedAssets.filter((asset) => asset.toUpperCase() !== "BTC");
        const balancePromises = nonBTCAssets.map((asset) =>
          fetchTokenBalance(activeAddress.address, asset)
            .then((balance) => ({ asset, balance }))
            .catch((error) => {
              console.error(`Error fetching ${asset} balance:`, error);
              return null;
            })
        );
        const results = await Promise.all(balancePromises);
        results.forEach((result) => {
          if (result && result.balance && !isCancelled) {
            upsertBalance(result.balance);
          }
        });
      } catch (error) {
        console.error("Error in loadInitialBalances:", error);
      } finally {
        if (!isCancelled) {
          console.log('[BalanceList] Initial load complete');
          setIsInitialLoading(false);
          setInitialLoaded(true);
          setOffset(0);
          setHasMore(true);
        }
      }
    };

    loadInitialBalances();

    return () => { isCancelled = true; };
  }, [activeAddress, activeWallet, upsertBalance, initialLoaded, settings?.pinnedAssets]);

  // Load more on scroll
  useEffect(() => {
    if (!activeAddress || !activeWallet || !hasMore || isFetchingMore || !inView) {
      return;
    }

    console.log('[BalanceList] Loading more from offset:', offset);

    const loadMoreBalances = async () => {
      setIsFetchingMore(true);
      try {
        const limit = 20; // Increased from 10 to 20
        const fetchedBalances = await fetchTokenBalances(activeAddress.address, { limit, offset });
        console.log('[BalanceList] Fetched', fetchedBalances.length, 'balances');

        if (fetchedBalances.length < limit) {
          setHasMore(false);
        }

        console.log('[BalanceList] Processing fetched balances...');
        fetchedBalances.forEach((balance) => {
          upsertBalance(balance);
        });

        setOffset((prev) => {
          console.log('[BalanceList] Updating offset from', prev, 'to', prev + limit);
          return prev + limit;
        });
      } catch (error) {
        console.error("Error fetching more balances:", error);
        setHasMore(false);
      } finally {
        setIsFetchingMore(false);
      }
    };

    loadMoreBalances();
  }, [inView, activeAddress, activeWallet, hasMore, offset, upsertBalance, isFetchingMore]);

  // BTC is always pinned, plus user's pinned assets
  const pinnedAssets = ["BTC"].concat((settings?.pinnedAssets || []).map((a) => a.toUpperCase()));

  const pinnedBalances = allBalances.filter((balance) => {
    const assetUpper = balance.asset.toUpperCase();
    const isPinned = pinnedAssets.includes(assetUpper);
    if (!isPinned) return false;

    // BTC always shows even if 0
    if (assetUpper === "BTC") return true;

    // XCP shows even if 0 only when pinned
    if (assetUpper === "XCP" && isPinned) return true;

    // Other pinned assets only show if non-zero
    return Number(balance.quantity_normalized) > 0;
  });

  const otherBalances = allBalances.filter((balance) =>
    !pinnedAssets.includes(balance.asset.toUpperCase())
  );

  if (isInitialLoading) return <Spinner message="Loading balances..." />;

  return (
    <div className="space-y-2">
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search balances..."
        name="balance-search"
        className="mb-3"
        showClearButton={true}
        isLoading={isSearching}
      />
      {searchQuery ? (
        isSearching ? (
          <Spinner message="Searching balances..." />
        ) : searchResults.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No results found</div>
        ) : (
          searchResults.map((asset) => <SearchResultCard key={asset.symbol} symbol={asset.symbol} navigationType="balance" />)
        )
      ) : (
        <>
          {pinnedBalances.map((balance) => (
            <BalanceCard token={balance} key={balance.asset} />
          ))}
          {otherBalances.map((balance) => (
            <BalanceCard token={balance} key={balance.asset} />
          ))}
          <div ref={loadMoreRef} className="flex flex-col justify-center items-center py-1">
            {hasMore ? (
              isFetchingMore ? (
                <Spinner className="py-4" />
              ) : (
                <div className="text-sm text-gray-500">Scroll to load more...</div>
              )
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};