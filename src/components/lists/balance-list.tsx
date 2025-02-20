import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FaSpinner } from "react-icons/fa";
import { formatAmount, formatAsset } from "@/utils/format";
import { BalanceMenu } from "@/components/menus/balance-menu";
import type { TokenBalance } from "@/utils/blockchain/counterparty";
import { useWallet } from "@/contexts/wallet-context";
import { fetchBTCBalance } from "@/utils/blockchain/bitcoin/balance";
import { fetchTokenBalance, fetchTokenBalances } from "@/utils/blockchain/counterparty";
import { useInView } from "react-intersection-observer";

export interface BalanceItem {
  asset: string;
  balance?: TokenBalance;
  loading: boolean;
}

interface BalanceItemProps {
  token: TokenBalance;
}

const BalanceItemComponent = ({ token }: BalanceItemProps) => {
  const navigate = useNavigate();
  const imageUrl = `https://app.xcp.io/img/icon/${token.asset}`;

  const handleClick = () => {
    // If it's BTC, go to send page, otherwise go to balance view
    if (token.asset === 'BTC') {
      navigate(`/compose/send/${encodeURIComponent(token.asset)}`);
    } else {
      navigate(`/balance/${encodeURIComponent(token.asset)}`);
    }
  };

  return (
    <div
      className="relative flex items-center p-3 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-gray-50"
      onClick={handleClick}
    >
      <div className="w-12 h-12 flex-shrink-0">
        <img
          src={imageUrl}
          alt={formatAsset(token.asset, { assetInfo: token.asset_info })}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="ml-3 flex-grow">
        <div className="font-medium text-sm text-gray-900">
          {formatAsset(token.asset, { assetInfo: token.asset_info, shorten: true })}
        </div>
        <div className="text-sm text-gray-500">
          {formatAmount({
            value: Number(token.quantity_normalized),
            minimumFractionDigits: token.asset_info.divisible ? 8 : 0,
            maximumFractionDigits: token.asset_info.divisible ? 8 : 0,
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

interface BalanceListProps {
  visible: boolean;
  scrollContainer: HTMLDivElement | null;
}

export const BalanceList = ({ visible, scrollContainer }: BalanceListProps) => {
  const { activeWallet, activeAddress } = useWallet();
  const [tokenBalances, setTokenBalances] = useState<BalanceItem[]>([]);
  const [pinnedBalances, setPinnedBalances] = useState<BalanceItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  // To avoid refetching duplicates
  const existingAssetsRef = useRef<Set<string>>(new Set());

  // Set up the intersection observer using the passed scrollContainer
  const { ref: loadMoreRef, inView } = useInView({
    root: scrollContainer,
    rootMargin: "100px",
    threshold: 0,
  });

  // Fetch initial balances including BTC and pinned assets
  useEffect(() => {
    if (!activeAddress || !activeWallet) return;
    let isCancelled = false;

    async function loadInitialBalances() {
      setIsInitialLoading(true);
      setOffset(0);
      setHasMore(true);
      existingAssetsRef.current = new Set();

      const pinnedAssets = activeWallet.pinnedAssetBalances || [];
      const initialBalances: BalanceItem[] = [
        { asset: "BTC", loading: true },
        ...pinnedAssets.map(asset => ({ asset, loading: true }))
      ];

      setPinnedBalances(initialBalances);
      setTokenBalances([]); // Clear regular balances

      // Fetch BTC balance
      try {
        const balanceSats = await fetchBTCBalance(activeAddress.address);
        const balanceBTC = balanceSats / 1e8;
        const btcBalance: TokenBalance = {
          asset: "BTC",
          quantity_normalized: balanceBTC.toFixed(8),
          asset_info: {
            asset_longname: null,
            description: "Bitcoin",
            issuer: "",
            divisible: true,
            locked: true,
            supply: "21000000",
          },
        };

        if (!isCancelled) {
          setPinnedBalances(prev => 
            prev.map(item =>
              item.asset === "BTC" ? { asset: "BTC", balance: btcBalance, loading: false } : item
            )
          );
          existingAssetsRef.current.add("BTC");
        }
      } catch (error) {
        console.error("Error fetching BTC balance:", error);
        if (!isCancelled) {
          setPinnedBalances(prev => prev.filter(item => item.asset !== "BTC"));
        }
      }

      // Fetch pinned asset balances
      for (const asset of pinnedAssets) {
        if (asset === "BTC") continue; // Skip BTC as it's already handled
        try {
          const balance = await fetchTokenBalance(activeAddress.address, asset);
          if (!isCancelled && balance) {
            setPinnedBalances(prev =>
              prev.map(item =>
                item.asset === asset ? { asset, balance, loading: false } : item
              )
            );
            existingAssetsRef.current.add(asset);
          }
        } catch (error) {
          console.error(`Error fetching ${asset} balance:`, error);
          if (!isCancelled) {
            setPinnedBalances(prev => prev.filter(item => item.asset !== asset));
          }
        }
      }

      setIsInitialLoading(false);
    }

    loadInitialBalances();

    return () => {
      isCancelled = true;
    };
  }, [activeAddress, activeWallet]);

  // Infinite scroll: load more token balances
  useEffect(() => {
    if (!activeAddress || !activeWallet || !hasMore || isFetchingMore || isInitialLoading) return;
    if (!inView) return;

    let isCancelled = false;

    async function loadMoreBalances() {
      setIsFetchingMore(true);
      try {
        const fetchedBalances = await fetchTokenBalances(activeAddress.address, { 
          limit: 10, 
          offset: offset,
          sort: 'asset:asc'
        });

        // Filter out duplicates, zero balances, and pinned assets
        const pinnedAssets = new Set([
          "BTC",
          ...(activeWallet.pinnedAssetBalances || [])
        ]);

        const filtered = fetchedBalances.filter((balance) => {
          const normalized = balance.asset.toUpperCase();
          const quantity = Number(balance.quantity_normalized);
          return (
            quantity > 0 &&
            !existingAssetsRef.current.has(normalized) &&
            !pinnedAssets.has(normalized)
          );
        });

        // Mark tokens that pass filtering as seen
        filtered.forEach((balance) =>
          existingAssetsRef.current.add(balance.asset.toUpperCase())
        );

        if (filtered.length > 0) {
          setTokenBalances((prev) => [
            ...prev,
            ...filtered.map((balance) => ({
              asset: balance.asset.toUpperCase(),
              balance,
              loading: false,
            })),
          ]);
        }

        setOffset((prev) => prev + 10);

        // If fewer than 10 tokens were returned from the API, assume no more data
        if (fetchedBalances.length < 10) {
          setHasMore(false);
        }
      } catch (error) {
        console.error("Error fetching more token balances:", error);
        setHasMore(false);
      } finally {
        if (!isCancelled) {
          setIsFetchingMore(false);
        }
      }
    }

    loadMoreBalances();

    return () => {
      isCancelled = true;
    };
  }, [inView, activeAddress, activeWallet, hasMore, isFetchingMore, offset, isInitialLoading]);

  if (isInitialLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <FaSpinner className="animate-spin text-4xl text-blue-500" />
      </div>
    );
  }

  if (pinnedBalances.length === 0 && tokenBalances.length === 0) {
    return <div className="text-center mt-4">No balances to display.</div>;
  }

  return (
    <div className="space-y-2">
      {/* Pinned Balances */}
      {pinnedBalances.map((item) =>
        item.loading ? (
          <div
            key={`${item.asset}-loading`}
            className="relative flex items-center p-3 bg-white rounded-lg shadow-sm animate-pulse"
          >
            <div className="w-12 h-12 bg-gray-200 rounded-md"></div>
            <div className="ml-3 flex-grow">
              <div className="h-4 w-24 bg-gray-200 rounded mb-2"></div>
              <div className="h-4 w-16 bg-gray-200 rounded"></div>
            </div>
          </div>
        ) : (
          item.balance && (
            <BalanceItemComponent token={item.balance} key={`${item.asset}-balance`} />
          )
        )
      )}

      {/* Other Balances */}
      {tokenBalances.map((item) => (
        item.balance && (
          <BalanceItemComponent token={item.balance} key={`${item.asset}-balance`} />
        )
      ))}

      <div ref={loadMoreRef} className="flex flex-col justify-center items-center">
        {hasMore &&
          (isFetchingMore ? (
            <div className="py-4">
              <FaSpinner className="animate-spin text-2xl text-blue-500" />
            </div>
          ) : (
            <div className="text-sm text-gray-500 py-4">Scroll to load more</div>
          ))}
      </div>
    </div>
  );
};
