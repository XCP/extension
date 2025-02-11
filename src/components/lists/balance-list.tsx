import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaSpinner } from "react-icons/fa";
import { formatAmount, formatAsset } from "@/utils/format";
import { BalanceMenu } from "@/components/menus/balance-menu";
import type { TokenBalance } from "@/utils/blockchain/counterparty";
import { useWallet } from "@/contexts/wallet-context";
import { fetchBTCBalance } from "@/utils/blockchain/bitcoin/balance";
import {
  fetchTokenBalance,
  fetchTokenBalances,
} from "@/utils/blockchain/counterparty";
import { useInView } from "react-intersection-observer";

export interface BalanceItem {
  asset: string;
  balance?: TokenBalance;
  loading: boolean;
}

interface BalanceListProps {
  enabled?: boolean;
}

const BalanceItemComponent: React.FC<{ token: TokenBalance }> = ({ token }) => {
  const navigate = useNavigate();
  const imageUrl = `https://app.xcp.io/img/icon/${token.asset}`;
  return (
    <div
      className="relative flex items-center p-3 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-gray-50"
      onClick={() =>
        navigate(`/compose/send/${encodeURIComponent(token.asset)}`)
      }
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

export const BalanceList: React.FC<BalanceListProps> = ({ enabled = true }) => {
  const { activeWallet, activeAddress } = useWallet();
  const [tokenBalances, setTokenBalances] = useState<BalanceItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  
  // Track existing assets so we don't refetch them in infinite scroll
  const existingAssetsRef = React.useRef<Set<string>>(new Set());
  
  // Use a stateful variable to hold the scroll container element
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  
  const { ref: loadMoreRef, inView } = useInView({
    root: scrollContainer,
    rootMargin: "100px",
    threshold: 0,
  });

  // Fetch initial token balances (BTC + pinned assets)
  useEffect(() => {
    if (!enabled) return;
    
    let cancelled = false;
    async function loadInitialBalances() {
      if (!activeAddress || !activeWallet) return;

      // ... rest of the initial balance loading logic moved from index.tsx ...
    }
    
    loadInitialBalances();
    return () => {
      cancelled = true;
    };
  }, [activeAddress, activeWallet, enabled]);

  // Infinite scroll: load next set of balances
  useEffect(() => {
    if (!enabled) return;
    
    async function loadMoreBalances() {
      // ... rest of the loadMoreBalances logic moved from index.tsx ...
    }
    
    if (inView) {
      loadMoreBalances();
    }
  }, [inView, activeAddress, activeWallet, hasMore, isFetchingMore, offset, isInitialLoading, enabled]);

  if (!enabled) return null;
  
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
