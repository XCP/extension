import React, { useState, useEffect, useRef } from "react";
import { useInView } from "react-intersection-observer";
import { useNavigate } from "react-router-dom";
import { FaSpinner } from "react-icons/fa";
import { BalanceMenu } from "@/components/menus/balance-menu";
import { useWallet } from "@/contexts/wallet-context";
import { fetchBTCBalance } from "@/utils/blockchain/bitcoin/balance";
import { fetchTokenBalance, fetchTokenBalances } from "@/utils/blockchain/counterparty";
import type { TokenBalance } from "@/utils/blockchain/counterparty";
import { formatAmount, formatAsset } from "@/utils/format";


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
    if (token.asset === "BTC") {
      navigate(`/compose/send/${encodeURIComponent(token.asset)}`);
    } else {
      navigate(`/balance/${encodeURIComponent(token.asset)}`);
    }
  };

  const isDivisible = token.asset_info?.divisible ?? false;

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

interface BalanceListProps {}

export const BalanceList = ({}: BalanceListProps) => {
  const { activeWallet, activeAddress } = useWallet();
  const [tokenBalances, setTokenBalances] = useState<BalanceItem[]>([]);
  const [pinnedBalances, setPinnedBalances] = useState<BalanceItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const existingAssetsRef = useRef<Set<string>>(new Set());

  const { ref: loadMoreRef, inView } = useInView({
    rootMargin: "200px",
    threshold: 0,
    triggerOnce: false,
  });

  useEffect(() => {
    if (!activeAddress || !activeWallet) return;
    let isCancelled = false;
    async function loadInitialBalances() {
      try {
        setIsInitialLoading(true);
        setOffset(0);
        setHasMore(true);
        existingAssetsRef.current = new Set();
        const pinnedAssets = activeWallet?.pinnedAssetBalances ?? [];
        const initialBalances: BalanceItem[] = [
          { asset: "BTC", loading: true },
          ...pinnedAssets.map(asset => ({ asset, loading: true }))
        ];
        setPinnedBalances(initialBalances);
        setTokenBalances([]);
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
        for (const asset of pinnedAssets) {
          if (asset === "BTC") continue;
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
      } catch (error) {
        console.error("Error in loadInitialBalances:", error);
      } finally {
        if (!isCancelled) {
          setIsInitialLoading(false);
        }
      }
    }
    loadInitialBalances();
    return () => {
      isCancelled = true;
    };
  }, [activeAddress, activeWallet]);

  useEffect(() => {
    if (!activeAddress || !activeWallet || !hasMore || isInitialLoading) {
      return;
    }
    if (!inView) {
      return;
    }
    let isCancelled = false;
    async function loadMoreBalances() {
      setIsFetchingMore(true);
      try {
        if (!activeAddress) return;
        const fetchedBalances = await fetchTokenBalances(activeAddress.address, { 
          limit: 10, 
          offset: offset,
          sort: "asset:asc"
        });
        if (!activeWallet) return;
        const pinnedAssets = new Set([
          "BTC",
          ...((activeWallet.pinnedAssetBalances || []).map(a => a.toUpperCase()))
        ]);
        const filtered = fetchedBalances.filter((balance) => {
          const normalized = balance.asset.toUpperCase();
          const quantity = Number(balance.quantity_normalized || "0");
          const isNotPinned = !pinnedAssets.has(normalized);
          const isNotDuplicate = !existingAssetsRef.current.has(normalized);
          const hasPositiveBalance = quantity > 0;
          return hasPositiveBalance && isNotDuplicate && isNotPinned;
        });
        filtered.forEach((balance) =>
          existingAssetsRef.current.add(balance.asset.toUpperCase())
        );
        if (!isCancelled) {
          if (filtered.length > 0) {
            setTokenBalances((prev) => {
              const newBalances = [
                ...prev,
                ...filtered.map((balance) => ({
                  asset: balance.asset.toUpperCase(),
                  balance,
                  loading: false,
                })),
              ];
              return newBalances;
            });
            setOffset((prev) => prev + 10);
          }
          if (fetchedBalances.length < 10 || filtered.length === 0) {
            setHasMore(false);
          }
        }
      } catch (error) {
        if (!isCancelled) {
          setHasMore(false);
        }
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
  }, [inView, activeAddress, activeWallet, hasMore, offset, isInitialLoading]);

  useEffect(() => {
  }, [inView]);

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
      {tokenBalances.map((item) => (
        item.balance && (
          <BalanceItemComponent token={item.balance} key={`${item.asset}-balance`} />
        )
      ))}
      <div 
        ref={loadMoreRef} 
        className="flex flex-col justify-center items-center py-4"
      >
        {hasMore ? (
          isFetchingMore ? (
            <div className="py-4">
              <FaSpinner className="animate-spin text-2xl text-blue-500" />
            </div>
          ) : (
            <div className="text-sm text-gray-500">Loading more...</div>
          )
        ) : (
          <div className="text-sm text-gray-500">No more assets to load</div>
        )}
      </div>
    </div>
  );
};
