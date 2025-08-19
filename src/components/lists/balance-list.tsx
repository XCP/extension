import React, { useState, useEffect, useCallback, type ReactElement } from "react";
import { useInView } from "react-intersection-observer";
import { useNavigate } from "react-router-dom";
import { Spinner } from "@/components/spinner";
import { BalanceMenu } from "@/components/menus/balance-menu";
import { useWallet } from "@/contexts/wallet-context";
import { fetchBTCBalance } from "@/utils/blockchain/bitcoin";
import { fetchTokenBalance, fetchTokenBalances } from "@/utils/blockchain/counterparty";
import type { TokenBalance } from "@/utils/blockchain/counterparty";
import { formatAmount, formatAsset } from "@/utils/format";
import { FaSearch, FaTimes } from "react-icons/fa";
import { useSearchQuery } from "@/hooks/useSearchQuery";
import { useSettings } from "@/contexts/settings-context";

const BalanceItemComponent = ({ token }: { token: TokenBalance }): ReactElement => {
  const navigate = useNavigate();
  const imageUrl = `https://app.xcp.io/img/icon/${token.asset}`;
  const handleClick = () => {
    navigate(`/compose/send/${encodeURIComponent(token.asset)}`);
  };
  const isDivisible = token.asset_info?.divisible ?? false;

  return (
    <div
      className="relative flex items-center p-3 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-gray-50"
      onClick={handleClick}
    >
      <div className="w-12 h-12 flex-shrink-0">
        <img src={imageUrl} alt={formatAsset(token.asset, { assetInfo: token.asset_info })} className="w-full h-full object-cover" />
      </div>
      <div className="ml-3 flex-grow">
        <div className="font-medium text-sm text-gray-900">
          {formatAsset(token.asset, { assetInfo: token.asset_info, shorten: true })}
        </div>
        <div className="text-sm text-gray-500">
          {formatAmount({
            value: Number(token.quantity_normalized),
            minimumFractionDigits: isDivisible ? 8 : 0,
            maximumFractionDigits: isDivisible ? 8 : 0,
            useGrouping: true,
          })}
        </div>
      </div>
      <div className="absolute top-2 right-2">
        <BalanceMenu asset={token.asset} />
      </div>
    </div>
  );
};

const SearchResultComponent = ({ asset }: { asset: { symbol: string } }): ReactElement => {
  const navigate = useNavigate();
  const imageUrl = `https://app.xcp.io/img/icon/${asset.symbol}`;
  return (
    <div
      className="relative flex items-center p-3 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-gray-50"
      onClick={() => navigate(`/balance/${asset.symbol}`)}
    >
      <div className="w-12 h-12 flex-shrink-0">
        <img src={imageUrl} alt={asset.symbol} className="w-full h-full object-cover" />
      </div>
      <div className="ml-3 flex-grow">
        <div className="font-medium text-sm text-gray-900">{asset.symbol}</div>
      </div>
    </div>
  );
};

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

  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "200px", threshold: 0 });

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
      if (!activeAddress || !activeWallet) setAllBalances([]);
      return;
    }

    let isCancelled = false;

    const loadInitialBalances = async () => {
      setIsInitialLoading(true);
      try {
        const balanceSats = await fetchBTCBalance(activeAddress.address);
        const balanceBTC = balanceSats / 1e8;
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
    if (!activeAddress || !activeWallet || !hasMore || isFetchingMore || !inView) return;

    const loadMoreBalances = async () => {
      let isCancelled = false;
      setIsFetchingMore(true);
      try {
        const fetchedBalances = await fetchTokenBalances(activeAddress.address, { limit: 10, offset });
        if (fetchedBalances.length < 10) setHasMore(false);
        fetchedBalances.forEach((balance) => {
          if (!isCancelled) upsertBalance(balance);
        });
        if (!isCancelled) setOffset((prev) => prev + 10);
      } catch (error) {
        console.error("Error fetching more balances:", error);
        if (!isCancelled) setHasMore(false);
      } finally {
        if (!isCancelled) setIsFetchingMore(false);
      }
    };

    loadMoreBalances();

    return () => {};
  }, [inView, activeAddress, activeWallet, hasMore, offset, upsertBalance]);

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
      <div className="relative mb-3">
        <input
          type="text"
          id="balance-search"
          name="balance-search"
          className="w-full p-2 pl-8 pr-8 border rounded-lg bg-white"
          placeholder="Search balances..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <FaSearch className="absolute left-3 top-3 text-gray-400" />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
            aria-label="Clear search"
          >
            <FaTimes />
          </button>
        )}
      </div>
      {searchQuery ? (
        isSearching ? (
          <Spinner message="Searching balances..." />
        ) : searchResults.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No results found</div>
        ) : (
          searchResults.map((asset) => <SearchResultComponent key={asset.symbol} asset={asset} />)
        )
      ) : (
        <>
          {pinnedBalances.map((balance) => (
            <BalanceItemComponent token={balance} key={balance.asset} />
          ))}
          {otherBalances.map((balance) => (
            <BalanceItemComponent token={balance} key={balance.asset} />
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
