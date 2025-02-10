"use client";

import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInView } from "react-intersection-observer";
import {
  FaChevronRight,
  FaClipboard,
  FaCheck,
  FaPaperPlane,
  FaQrcode,
  FaHistory,
  FaCog,
  FaListAlt,
  FaLockOpen,
  FaSpinner,
} from "react-icons/fa";
import { RadioGroup } from "@headlessui/react";

import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchBTCBalance } from "@/utils/blockchain/bitcoin/balance";
import {
  fetchTokenBalance,
  fetchTokenBalances,
  TokenBalance,
} from "@/utils/blockchain/counterparty";
import { formatAddress, formatAmount, formatAsset } from "@/utils/format";
import { Button } from "@/components/button";
import Footer from "@/components/footer";
import { AssetMenu } from "@/components/menus/asset-menu";
import { BalanceMenu } from "@/components/menus/balance-menu";

interface TokenBalanceItem {
  asset: string;
  balance?: TokenBalance;
  loading: boolean;
}

interface OwnedAsset {
  asset: string;
  asset_longname: string | null;
  supply_normalized: string;
  description: string;
  locked: boolean;
}

export default function Index() {
  const { activeWallet, activeAddress, lockAll, loaded } = useWallet();
  const { setHeaderProps } = useHeader();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as "Assets" | "Balances") || "Balances";

  // Local state variables
  const [tokenBalances, setTokenBalances] = useState<TokenBalanceItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [ownedAssets, setOwnedAssets] = useState<OwnedAsset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);

  // Track existing assets so we don't refetch them in infinite scroll
  const existingAssetsRef = useRef<Set<string>>(new Set());

  // We will use a scrollable container as the `root` for the intersection observer:
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const { ref: loadMoreRef, inView } = useInView({
    root: scrollContainerRef.current,
    rootMargin: "100px",
    threshold: 0,
    initialInView: false,
  });

  // Set header props (locking, etc.)
  useEffect(() => {
    setHeaderProps({
      useLogoTitle: true,
      leftButton: {
        label: activeWallet?.name || "Wallet",
        onClick: () => navigate("/wallet-selection"),
        ariaLabel: "Select Wallet",
      },
      rightButton: {
        icon: <FaLockOpen aria-hidden="true" />,
        onClick: async () => {
          await lockAll();
          navigate("/unlock-wallet");
        },
        ariaLabel: "Lock Wallet",
      },
    });
  }, [setHeaderProps, navigate, activeWallet, lockAll]);

  // Fetch initial token balances (BTC + pinned assets)
  useEffect(() => {
    let cancelled = false;
    async function loadInitialBalances() {
      if (!activeAddress || !activeWallet) return;

      setIsInitialLoading(true);
      setOffset(0);
      setHasMore(true);

      // Pinned assets + BTC
      const pinnedAssets = (activeWallet.pinnedAssetBalances || []).map((a) => a.toUpperCase());
      const uniqueAssets = new Set(["BTC", ...pinnedAssets]);
      existingAssetsRef.current = new Set(Array.from(uniqueAssets));

      // Create placeholders for each pinned asset
      setTokenBalances(
        Array.from(uniqueAssets).map((asset) => ({ asset, loading: true }))
      );

      const updateBalance = (asset: string, balance: TokenBalance | null) => {
        if (cancelled) return;
        const norm = asset.toUpperCase();
        setTokenBalances((prev) => {
          const index = prev.findIndex((item) => item.asset === norm);
          // Always keep BTC, even if balance is zero
          if (balance || norm === "BTC") {
            const newItem: TokenBalanceItem = {
              asset: norm,
              balance: balance || undefined,
              loading: false,
            };
            if (index >= 0) {
              const copy = [...prev];
              copy[index] = newItem;
              return copy;
            }
            return [...prev, newItem];
          } else {
            // Remove asset if no balance
            return prev.filter((item) => item.asset !== norm);
          }
        });
      };

      // Fetch BTC balance
      try {
        const sats = await fetchBTCBalance(activeAddress.address);
        const btcAmount = sats / 1e8;
        updateBalance("BTC", {
          asset: "BTC",
          quantity_normalized: formatAmount({
            value: btcAmount,
            minimumFractionDigits: 8,
            maximumFractionDigits: 8,
          }),
          asset_info: {
            asset_longname: null,
            description: "Bitcoin",
            issuer: "",
            divisible: true,
            locked: true,
            supply: "21000000",
          },
        });
      } catch {
        updateBalance("BTC", null);
      }

      // Fetch pinned asset balances
      await Promise.all(
        pinnedAssets.map(async (asset) => {
          try {
            const balance = await fetchTokenBalance(activeAddress.address, asset);
            if (asset.toUpperCase() === "XCP") {
              updateBalance(asset, balance || {
                asset: "XCP",
                quantity_normalized: "0",
                asset_info: {
                  asset_longname: null,
                  description: "Counterparty",
                  issuer: "",
                  divisible: true,
                  locked: true,
                  supply: "2600000",
                },
              });
            } else {
              if (balance && Number(balance.quantity_normalized) > 0) {
                updateBalance(asset, balance);
              } else {
                updateBalance(asset, null);
              }
            }
          } catch {
            updateBalance(asset, null);
          }
        })
      );

      setIsInitialLoading(false);
    }
    loadInitialBalances();
    return () => {
      cancelled = true;
    };
  }, [activeAddress, activeWallet]);

  // Infinite scroll: load next set of balances
  useEffect(() => {
    async function loadMoreBalances() {
      if (!activeAddress || !activeWallet || !hasMore || isFetchingMore || isInitialLoading) {
        return;
      }
      setIsFetchingMore(true);
      try {
        const fetched = await fetchTokenBalances(activeAddress.address, 10, offset);
        const newBalances = fetched.filter((b) => {
          const norm = b.asset.toUpperCase();
          return (
            !existingAssetsRef.current.has(norm) &&
            Number(b.quantity_normalized) > 0 &&
            norm !== "BTC"
          );
        });

        newBalances.forEach((b) => existingAssetsRef.current.add(b.asset.toUpperCase()));

        setTokenBalances((prev) => [
          ...prev,
          ...newBalances.map((b) => ({
            asset: b.asset.toUpperCase(),
            balance: b,
            loading: false,
          })),
        ]);

        setOffset((prev) => prev + 10);
        setHasMore(fetched.length === 10 && newBalances.length > 0);
      } catch {
        setHasMore(false);
      } finally {
        setIsFetchingMore(false);
      }
    }
    if (inView) {
      loadMoreBalances();
    }
  }, [inView, activeAddress, activeWallet, hasMore, isFetchingMore, offset, isInitialLoading]);

  // Fetch owned assets when user is on the "Assets" tab
  useEffect(() => {
    async function loadOwnedAssets() {
      if (!activeAddress) return;
      setIsLoadingAssets(true);
      try {
        const response = await fetch(
          `https://api.counterparty.info/v2/addresses/${activeAddress.address}/assets/owned?verbose=true`
        );
        const data = await response.json();
        setOwnedAssets(data.result);
      } catch {
        // handle error if needed
      } finally {
        setIsLoadingAssets(false);
      }
    }
    if (activeTab === "Assets") {
      loadOwnedAssets();
    }
  }, [activeAddress, activeTab]);

  // Handlers
  const handleCopyAddress = () => {
    if (!activeAddress) return;
    navigator.clipboard.writeText(activeAddress.address).then(() => {
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    });
  };

  const handleAddressSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate("/address-selection");
  };

  // Address UI
  function renderCurrentAddress() {
    if (!activeAddress) return <div className="p-4">No address selected</div>;
    return (
      <RadioGroup value={activeAddress} onChange={() => {}}>
        <RadioGroup.Option value={activeAddress}>
          {({ checked }) => (
            <div
              className={`relative w-full rounded p-4 cursor-pointer ${
                checked
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-blue-100 hover:bg-blue-200 text-gray-800"
              }`}
              onClick={handleCopyAddress}
              aria-label="Current address"
            >
              <div className="absolute top-1/2 right-4 -translate-y-1/2">
                <div
                  className="py-6 px-3 -m-2 cursor-pointer hover:bg-white/5 rounded"
                  onClick={handleAddressSelection}
                  aria-label="Select another address"
                >
                  <FaChevronRight className="w-4 h-4" aria-hidden="true" />
                </div>
              </div>
              <div className="text-sm mb-1 font-medium text-center">
                {activeAddress.name}
              </div>
              <div className="flex justify-center items-center">
                <span className="font-mono text-sm">
                  {formatAddress(activeAddress.address)}
                </span>
                {copiedToClipboard ? (
                  <FaCheck className="ml-2 text-green-500" aria-hidden="true" />
                ) : (
                  <FaClipboard className="ml-2" aria-hidden="true" />
                )}
              </div>
            </div>
          )}
        </RadioGroup.Option>
      </RadioGroup>
    );
  }

  // Action buttons (Receive, Send, History)
  function renderActionButtons() {
    return (
      <div className="grid grid-cols-3 gap-4 my-4">
        <Button
          color="gray"
          onClick={() => navigate("/receive")}
          className="flex-col !py-4"
          aria-label="Receive tokens"
        >
          <FaQrcode className="text-xl mb-2" aria-hidden="true" />
          <span>Receive</span>
        </Button>
        <Button
          color="gray"
          onClick={() => navigate("/compose/send/BTC")}
          className="flex-col !py-4"
          aria-label="Send tokens"
        >
          <FaPaperPlane className="text-xl mb-2" aria-hidden="true" />
          <span>Send</span>
        </Button>
        <Button
          color="gray"
          onClick={() => navigate("/history")}
          className="flex-col !py-4"
          aria-label="Transaction history"
        >
          <FaHistory className="text-xl mb-2" aria-hidden="true" />
          <span>History</span>
        </Button>
      </div>
    );
  }

  // Header with Assets/Balances tabs
  function renderBalancesHeader() {
    return (
      <div className="flex justify-between items-center mb-2">
        <div className="flex space-x-4">
          <button
            className="text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none"
            style={{ textDecoration: activeTab === "Assets" ? "underline" : "none" }}
            onClick={() => setSearchParams({ tab: "Assets" })}
          >
            Assets
          </button>
          <button
            className="text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none"
            style={{ textDecoration: activeTab === "Balances" ? "underline" : "none" }}
            onClick={() => setSearchParams({ tab: "Balances" })}
          >
            Balances
          </button>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={async () => {
              await browser.tabs.create({
                url: browser.runtime.getURL("/wallet.html#/main"),
                active: true,
              });
            }}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Open Wallet in New Tab"
          >
            <FaListAlt className="w-5 h-5 text-gray-600" aria-hidden="true" />
          </button>
          <button
            onClick={() => navigate("/token-settings")}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Token Settings"
          >
            <FaCog className="w-5 h-5 text-gray-600" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  // Single token balance item
  function renderTokenBalanceItem(token: TokenBalance, key: string) {
    const imageUrl = `https://app.xcp.io/img/icon/${token.asset}`;
    return (
      <div
        key={key}
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
  }

  // Token balances list
  function renderTokenBalances() {
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
            item.balance && renderTokenBalanceItem(item.balance, `${item.asset}-balance`)
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
  }

  // Owned assets list
  function renderAssets() {
    if (isLoadingAssets) {
      return (
        <div className="flex justify-center items-center h-full">
          <FaSpinner className="animate-spin text-4xl text-blue-500" />
        </div>
      );
    }
    if (ownedAssets.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center text-center">
          <div className="bg-gray-50 rounded-lg p-6 max-w-sm w-full">
            <div className="text-gray-600 text-lg font-medium mb-2">No Assets Owned</div>
            <div className="text-gray-500 text-sm">
              This address hasn't issued any Counterparty assets.
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {ownedAssets.map((asset) => {
          const imageUrl = `https://app.xcp.io/img/icon/${asset.asset}`;
          return (
            <div
              key={asset.asset}
              className="relative flex items-center p-3 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-gray-50"
              onClick={() => navigate(`/asset/${asset.asset}`)}
            >
              <div className="w-12 h-12 flex-shrink-0">
                <img
                  src={imageUrl}
                  alt={formatAsset(asset.asset, { assetInfo: { asset_longname: asset.asset_longname } })}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="ml-3 flex-grow">
                <div className="font-medium text-sm text-gray-900">
                  {formatAsset(asset.asset, {
                    assetInfo: { asset_longname: asset.asset_longname },
                    shorten: true,
                  })}
                </div>
                <div className="text-sm text-gray-500">
                  Supply:{" "}
                  {formatAmount({
                    value: Number(asset.supply_normalized),
                    minimumFractionDigits: 8,
                    maximumFractionDigits: 8,
                  })}
                </div>
              </div>
              <div className="absolute top-2 right-2">
                <AssetMenu ownedAsset={asset} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Final content logic
  const content = !loaded ? (
    <div className="p-4">Loading wallet data…</div>
  ) : !activeWallet || !activeAddress ? (
    <div className="p-4">No wallet unlocked.</div>
  ) : (
    <>
      {renderCurrentAddress()}
      {renderActionButtons()}
      {renderBalancesHeader()}
      {activeTab === "Balances" ? renderTokenBalances() : renderAssets()}
    </>
  );

  return (
    <div className="flex flex-col h-full" role="main">
      {/* The scrollable container: pass to IntersectionObserver via root */}
      <div ref={scrollContainerRef} className="flex-grow overflow-y-auto no-scrollbar p-4">
        {content}
      </div>
      <Footer />
    </div>
  );
}
