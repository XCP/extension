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
  FaExternalLinkAlt,
  FaLock,
  FaSearch,
} from "react-icons/fa";
import { RadioGroup } from "@headlessui/react";
import { Button } from "@/components/button";
import { AssetList } from "@/components/lists/asset-list";
import { BalanceList } from "@/components/lists/balance-list";
import { SearchList } from "@/components/lists/search-list";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { formatAddress } from "@/utils/format";

export default function Index() {
  const { activeWallet, activeAddress, lockAll, loaded } = useWallet();
  const { setHeaderProps } = useHeader();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as "Assets" | "Balances" | "Search") || "Balances";

  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

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

  const handleSearchClick = () => {
    setSearchParams({ tab: "Search" });
  };

  const handleCloseSearch = () => {
    setSearchParams({ tab: "Balances" });
  };

  useEffect(() => {
    if (activeTab === "Search") {
      setTimeout(() => {
        const searchInput = document.querySelector<HTMLInputElement>('input[placeholder="Search assets..."]');
        searchInput?.focus();
      }, 0);
    }
  }, [activeTab]);

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
                  : "bg-blue-200 hover:bg-blue-300 text-gray-800"
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
          onClick={() => navigate("/address-history")}
          className="flex-col !py-4"
          aria-label="Transaction history"
        >
          <FaHistory className="text-xl mb-2" aria-hidden="true" />
          <span>History</span>
        </Button>
      </div>
    );
  }

  function renderBalancesHeader() {
    const isTabbedView = window.location.pathname.includes('tabbed.html');

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
            onClick={handleSearchClick}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
            aria-label="Search Assets"
          >
            <FaSearch className="w-4 h-4 text-gray-600" aria-hidden="true" />
          </button>
          {!isTabbedView && (
            <button
              onClick={async () => {
                await browser.tabs.create({
                  url: browser.runtime.getURL("/tabbed.html#/index"),
                  active: true,
                });
              }}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
              aria-label="Open Wallet in New Tab"
            >
              <FaExternalLinkAlt className="w-4 h-4 text-gray-600" aria-hidden="true" />
            </button>
          )}
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
      </>
    );

  return (
    <div className="flex flex-col h-full" role="main">
      <div className="flex-grow overflow-y-auto no-scrollbar p-4">
        {content}
        <div style={{ display: activeTab === "Balances" ? "block" : "none" }}>
          <BalanceList />
        </div>
        <div style={{ display: activeTab === "Assets" ? "block" : "none" }}>
          <AssetList />
        </div>
        <div style={{ display: activeTab === "Search" ? "block" : "none" }}>
          <SearchList onClose={handleCloseSearch} visible={activeTab === "Search"} />
        </div>
      </div>
    </div>
  );
}
