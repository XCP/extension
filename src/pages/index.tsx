"use client";

import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FaChevronRight,
  FaClipboard,
  FaCheck,
  FaPaperPlane,
  FaQrcode,
  FaHistory,
  FaCog,
  FaListAlt,
  FaLock,
} from "react-icons/fa";
import { RadioGroup } from "@headlessui/react";

import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { formatAddress } from "@/utils/format";
import { Button } from "@/components/button";
import { BalanceList } from "@/components/lists/balance-list";
import { AssetList } from "@/components/lists/asset-list";

export default function Index() {
  const { activeWallet, activeAddress, lockAll, loaded } = useWallet();
  const { setHeaderProps } = useHeader();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as "Assets" | "Balances") || "Balances";

  // Local state variables
  const [tokenBalances, setTokenBalances] = useState<any[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [ownedAssets, setOwnedAssets] = useState<any[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);

  // Track existing assets so we don't refetch them in infinite scroll
  const existingAssetsRef = React.useRef<Set<string>>(new Set());

  // Use a stateful variable to hold the scroll container element.
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);

  // Set header props (locking, etc.)
  useEffect(() => {
    setHeaderProps({
      useLogoTitle: true,
      leftButton: {
        label: activeWallet?.name || "Wallet",
        onClick: () => navigate("/select-wallet"),
        ariaLabel: "Select Wallet",
      },
      rightButton: {
        icon: <FaLock aria-hidden="true" />,
        onClick: async () => {
          await lockAll();
          navigate("/unlock-wallet");
        },
        ariaLabel: "Lock Wallet",
      },
    });
  }, [setHeaderProps, navigate, activeWallet, lockAll]);

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
    navigate("/select-address");
  };

  // Current address UI
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
          onClick={() => navigate("/view-address")}
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
            style={{
              textDecoration: activeTab === "Assets" ? "underline" : "none",
            }}
            onClick={() => setSearchParams({ tab: "Assets" })}
          >
            Assets
          </button>
          <button
            className="text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none"
            style={{
              textDecoration: activeTab === "Balances" ? "underline" : "none",
            }}
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

  const content =
    !loaded ? (
      <div className="p-4">Loading wallet data…</div>
    ) : !activeWallet || !activeAddress ? (
      <div className="p-4">No wallet unlocked.</div>
    ) : (
      <>
        {renderCurrentAddress()}
        {renderActionButtons()}
        {renderBalancesHeader()}
        {activeTab === "Balances" ? (
          <BalanceList enabled={false} />
        ) : (
          <AssetList enabled={false} />
        )}
      </>
    );

  return (
    <div className="flex flex-col h-full" role="main">
      {/* Attach the scroll container element via the setter */}
      <div
        ref={setScrollContainer}
        className="flex-grow overflow-y-auto no-scrollbar p-4"
      >
        {content}
      </div>
    </div>
  );
}
