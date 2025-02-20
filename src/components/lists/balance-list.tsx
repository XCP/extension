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

const BalanceItemComponent = ({ token }: { token: TokenBalance }) => {
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

export const BalanceList = () => {
  const { activeWallet, activeAddress } = useWallet();
  const [allBalances, setAllBalances] = useState<TokenBalance[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const { ref: loadMoreRef, inView } = useInView({
    rootMargin: "200px",
    threshold: 0,
  });

  // Helper to add or update balance in our state (to avoid duplicates)
  const upsertBalance = (balance: TokenBalance) => {
    setAllBalances((prev) => {
      const idx = prev.findIndex(
        (b) => b.asset.toUpperCase() === balance.asset.toUpperCase()
      );
      if (idx > -1) {
        const newBalances = [...prev];
        newBalances[idx] = balance;
        return newBalances;
      }
      return [...prev, balance];
    });
  };

  useEffect(() => {
    if (!activeAddress || !activeWallet) return;
    // Reset state on wallet change
    setIsInitialLoading(true);
    setOffset(0);
    setHasMore(true);
    setAllBalances([]);
  
    async function loadInitialBalances() {
      if (!activeAddress || !activeWallet) return;
      try {
        // Fetch BTC balance
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
        upsertBalance(btcBalance);
  
        // Load pinned token balances in parallel, skipping BTC
        const pinnedAssets = activeWallet.pinnedAssetBalances || [];
        const nonBTCAssets = pinnedAssets.filter(
          (asset) => asset.toUpperCase() !== "BTC"
        );
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
          if (result && result.balance) {
            upsertBalance(result.balance);
          }
        });
      } catch (error) {
        console.error("Error in loadInitialBalances:", error);
      } finally {
        setIsInitialLoading(false);
      }
    }
    loadInitialBalances();
  }, [activeAddress, activeWallet]);

  useEffect(() => {
    if (!activeAddress || !activeWallet || !hasMore || isInitialLoading) return;
    if (!inView) return;

    async function loadMoreBalances() {
      setIsFetchingMore(true);
      try {
        const fetchedBalances = await fetchTokenBalances(activeAddress!.address, {
          limit: 10,
          offset,
        });
        // If API returns fewer than limit, no more pages
        if (fetchedBalances.length < 10) {
          setHasMore(false);
        }
        // Append new balances
        fetchedBalances.forEach((balance) => upsertBalance(balance));
        // Advance offset regardless of whether new assets were added
        setOffset((prev) => prev + 10);
      } catch (error) {
        console.error("Error fetching more balances:", error);
        setHasMore(false);
      } finally {
        setIsFetchingMore(false);
      }
    }
    loadMoreBalances();
  }, [inView, activeAddress, activeWallet, hasMore, isInitialLoading, offset]);

  if (isInitialLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <FaSpinner className="animate-spin text-4xl text-blue-500" />
      </div>
    );
  }

  // During render, separate pinned vs. non-pinned balances
  const pinnedAssets = (activeWallet?.pinnedAssetBalances || [])
    .map((a) => a.toUpperCase())
    .concat("BTC"); // Ensure BTC is treated as pinned

  const pinnedBalances = allBalances.filter((balance) => {
    const isAlwaysShow = ["BTC", "XCP"].includes(balance.asset.toUpperCase());
    const isPinned = pinnedAssets.includes(balance.asset.toUpperCase());
    const hasBalance = Number(balance.quantity_normalized) > 0;

    return isPinned && (isAlwaysShow || hasBalance);
  });

  const otherBalances = allBalances.filter(
    (balance) => !pinnedAssets.includes(balance.asset.toUpperCase())
  );

  return (
    <div className="space-y-2">
      {pinnedBalances.map((balance) => (
        <BalanceItemComponent token={balance} key={balance.asset} />
      ))}
      {otherBalances.map((balance) => (
        <BalanceItemComponent token={balance} key={balance.asset} />
      ))}
      <div ref={loadMoreRef} className="flex flex-col justify-center items-center py-4">
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
