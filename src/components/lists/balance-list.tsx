import { useState, useEffect, useCallback, type ReactElement } from "react";
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

  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "100px", threshold: 0.1 });

  useEffect(() => {
    setInitialLoaded(false);
  }, [settings?.pinnedAssets]);

  const upsertBalance = useCallback((balance: TokenBalance) => {
    if (!balance?.asset || !balance?.quantity_normalized) return;
    setAllBalances((prev) => {
      const idx = prev.findIndex((b) => b.asset.toUpperCase() === balance.asset.toUpperCase());
      if (idx > -1) {
        const newBalances = [...prev];
        newBalances[idx] = balance;
        return newBalances;
      }
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
          asset_info: { asset_longname: null, description: "Bitcoin", issuer: "", divisible: true, locked: true, supply: "21000000" },
        };
        if (!isCancelled) upsertBalance(btcBalance);

        const pinnedAssets = settings?.pinnedAssets || [];
        const nonBTCAssets = pinnedAssets.filter((asset) => asset.toUpperCase() !== "BTC");
        const balancePromises = nonBTCAssets.map((asset) =>
          fetchTokenBalance(activeAddress.address, asset)
            .then((balance) => ({ asset, balance }))
            .catch((error) => { console.error(`Error fetching ${asset} balance:`, error); return null; })
        );
        const results = await Promise.all(balancePromises);
        results.forEach((result) => {
          if (result && result.balance && !isCancelled) upsertBalance(result.balance);
        });
      } catch (error) {
        console.error("Error in loadInitialBalances:", error);
      } finally {
        if (!isCancelled) {
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

  useEffect(() => {
    if (!activeAddress || !activeWallet || !hasMore || isFetchingMore || !initialLoaded) return;

    if (inView) {
      let isCancelled = false;

      const loadMoreBalances = async () => {
        setIsFetchingMore(true);
        try {
          const fetchedBalances = await fetchTokenBalances(activeAddress.address, { limit: 10, offset });
          if (!isCancelled) {
            if (fetchedBalances.length < 10) setHasMore(false);

            // Get pinned assets including BTC and XCP
            const pinnedAssetsList = (settings?.pinnedAssets || [])
              .map(a => a.toUpperCase())
              .concat(["BTC", "XCP"]);

            setAllBalances((prev) => {
              // Create a set of existing assets for quick lookup
              const existingAssets = new Set(prev.map(b => b.asset.toUpperCase()));

              // Filter out:
              // 1. Assets that already exist (duplicates)
              // 2. Pinned assets that were already loaded initially
              const newBalances = fetchedBalances.filter(balance => {
                const assetUpper = balance.asset.toUpperCase();
                // Skip if already exists OR if it's a pinned asset (already loaded initially)
                return !existingAssets.has(assetUpper) && !pinnedAssetsList.includes(assetUpper);
              });

              return [...prev, ...newBalances];
            });
            setOffset((prev) => prev + fetchedBalances.length);
          }
        } catch (error) {
          console.error("Error fetching more balances:", error);
          if (!isCancelled) setHasMore(false);
        } finally {
          if (!isCancelled) setIsFetchingMore(false);
        }
      };

      loadMoreBalances();

      return () => { isCancelled = true; };
    }
  }, [inView, activeAddress, activeWallet, hasMore, offset, isFetchingMore, initialLoaded, settings?.pinnedAssets]);

  const pinnedAssets = (settings?.pinnedAssets || []).map((a) => a.toUpperCase()).concat("BTC");
  const pinnedBalances = allBalances.filter((balance) => {
    const isPinned = pinnedAssets.includes(balance.asset.toUpperCase());
    const isSpecialAsset = balance.asset.toUpperCase() === "BTC" || balance.asset.toUpperCase() === "XCP";
    const hasNonZeroBalance = Number(balance.quantity_normalized) > 0;
    return isPinned && (isSpecialAsset || hasNonZeroBalance);
  });
  const otherBalances = allBalances.filter((balance) => !pinnedAssets.includes(balance.asset.toUpperCase()));

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
