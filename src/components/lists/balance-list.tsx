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

interface BalanceListProps {
  visible: boolean;
  scrollContainer: HTMLDivElement | null;
}

const BalanceItemComponent: React.FC<{ token: TokenBalance }> = ({ token }) => {
  const navigate = useNavigate();
  const imageUrl = `https://app.xcp.io/img/icon/${token.asset}`;
  return (
    <div
      className="relative flex items-center p-3 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-gray-50"
      onClick={() => navigate(`/compose/send/${encodeURIComponent(token.asset)}`)}
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

export const BalanceList: React.FC<BalanceListProps> = ({ visible, scrollContainer }) => {
  const { activeWallet, activeAddress } = useWallet();
  const [tokenBalances, setTokenBalances] = useState<BalanceItem[]>([]);
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

  // Fetch initial balances only once (even if not visible)
  useEffect(() => {
    if (!activeAddress || !activeWallet) return;
    let isCancelled = false;

    async function loadInitialBalances() {
      setIsInitialLoading(true);
      setOffset(0);
      setHasMore(true);
      existingAssetsRef.current = new Set();

      // Example: start with BTC
      const newBalances: BalanceItem[] = [
        { asset: "BTC", loading: true },
        // You can add any pinned assets here if needed.
      ];
      setTokenBalances(newBalances);

      // Fetch BTC balance
      try {
        const balanceSats = await fetchBTCBalance(activeAddress!.address);
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
          setTokenBalances((prev) =>
            prev.map((item) =>
              item.asset === "BTC" ? { asset: "BTC", balance: btcBalance, loading: false } : item
            )
          );
          existingAssetsRef.current.add("BTC");
        }
      } catch (error) {
        console.error("Error fetching BTC balance:", error);
        if (!isCancelled) {
          setTokenBalances((prev) => prev.filter((item) => item.asset !== "BTC"));
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
        const fetchedBalances = await fetchTokenBalances(activeAddress!.address, { 
          limit: 10, 
          offset: offset,
          sort: 'asset:asc'
        });

        // Filter out duplicates and items with zero balance
        const filtered = fetchedBalances.filter((balance) => {
          const normalized = balance.asset.toUpperCase();
          const quantity = Number(balance.quantity_normalized);
          return (
            quantity > 0 &&
            !existingAssetsRef.current.has(normalized) &&
            normalized !== "BTC"
          );
        });

        // Mark these assets as seen
        filtered.forEach((balance) =>
          existingAssetsRef.current.add(balance.asset.toUpperCase())
        );

        setTokenBalances((prev) => [
          ...prev,
          ...filtered.map((balance) => ({
            asset: balance.asset.toUpperCase(),
            balance,
            loading: false,
          })),
        ]);
        setOffset((prev) => prev + 10);

        // If fewer than expected results, assume no more data
        if (fetchedBalances.length < 10 || filtered.length === 0) {
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
  if (tokenBalances.length === 0) {
    return <div className="text-center mt-4">No balances to display.</div>;
  }
  return (
    <div className="space-y-2">
      {tokenBalances.map((item) =>
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
