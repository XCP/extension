"use client";

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FaChevronRight,
  FaClipboard,
  FaCheck,
  FaPaperPlane,
  FaQrcode,
  FaHistory,
  FaExternalLinkAlt,
  FaLock,
} from "@/components/icons";
import { TbPinned } from "@/components/icons";
import { RadioGroup } from "@headlessui/react";
import { Button } from "@/components/button";
import { AssetList } from "@/components/lists/asset-list";
import { BalanceList } from "@/components/lists/balance-list";
import { RequestRecoveryPrompt } from "@/components/provider/RequestRecoveryPrompt";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { useProviderRequestRecovery } from "@/hooks/useProviderRequestRecovery";
import { formatAddress } from "@/utils/format";
import type { ReactElement } from "react";
import { getProviderService } from '@/services/providerService';

const CONSTANTS = {
  COPY_FEEDBACK_DURATION: 2000,
  PATHS: {
    SELECT_WALLET: "/select-wallet",
    UNLOCK_WALLET: "/unlock-wallet",
    VIEW_ADDRESS: "/view-address",
    SEND_BTC: "/compose/send/BTC",
    ADDRESS_HISTORY: "/address-history",
    SELECT_ADDRESS: "/select-address",
    TAB_INDEX: "/tab.html#/index",
    PINNED_ASSETS: "/settings/pinned-assets",
  } as const,
  TABS: ["Assets", "Balances"] as const,
} as const;

export default function Index(): ReactElement {
  const { activeWallet, activeAddress, lockAll, loaded } = useWallet();
  const { setHeaderProps } = useHeader();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as "Assets" | "Balances") || "Balances";
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // Check for pending provider requests
  const {
    pendingRequest,
    showRecoveryPrompt,
    resumeRequest,
    cancelRequest,
    requestAge
  } = useProviderRequestRecovery();

  // Auto-navigate to compose page when pending request is detected
  useEffect(() => {
    if (pendingRequest && pendingRequest.type === 'compose') {
      // Navigate immediately without showing prompt
      const queryParam = `composeRequestId=${pendingRequest.id}`;
      navigate(`${pendingRequest.path}?${queryParam}`);
    }
  }, [pendingRequest, navigate]);

  // Check for pending approvals on mount and navigate if needed
  useEffect(() => {
    const checkPendingApprovals = async () => {
      try {
        const providerService = getProviderService();
        const approvalQueue = await providerService.getApprovalQueue();

        if (approvalQueue.length > 0) {
          // Redirect to approval queue
          navigate('/provider/approval-queue');
        }
      } catch (error) {
        console.debug('Failed to check approval queue:', error);
      }
    };

    // Only check if loaded and we have a wallet
    if (loaded && activeWallet) {
      checkPendingApprovals();
    }
  }, [loaded, activeWallet, navigate]);

  useEffect(() => {
    setHeaderProps({
      useLogoTitle: true,
      leftButton: {
        label: activeWallet?.name || "Wallet",
        onClick: () => navigate(CONSTANTS.PATHS.SELECT_WALLET),
        ariaLabel: "Select Wallet",
      },
      rightButton: {
        icon: <FaLock aria-hidden="true" />,
        onClick: async () => {
          await lockAll();
          navigate(CONSTANTS.PATHS.UNLOCK_WALLET);
        },
        ariaLabel: "Lock Wallet",
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, activeWallet, lockAll]);

  useEffect(() => {
    if (copiedToClipboard) {
      const timer = setTimeout(() => setCopiedToClipboard(false), CONSTANTS.COPY_FEEDBACK_DURATION);
      return () => clearTimeout(timer);
    }
  }, [copiedToClipboard]);

  const handleCopyAddress = () => {
    if (!activeAddress) return;
    navigator.clipboard.writeText(activeAddress.address).then(() => {
      setCopiedToClipboard(true);
    });
  };

  const handleAddressSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(CONSTANTS.PATHS.SELECT_ADDRESS);
  };

  const renderCurrentAddress = (): ReactElement => {
    if (!activeAddress) return <div className="p-4">No address selected</div>;
    return (
      <RadioGroup value={activeAddress} onChange={() => {}}>
        <RadioGroup.Option value={activeAddress}>
          {({ checked }) => (
            <div
              className={`relative w-full rounded p-4 cursor-pointer ${
                checked ? "bg-blue-600 text-white shadow-md" : "bg-blue-200 hover:bg-blue-300 text-gray-800"
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
              <div className="text-sm mb-1 font-medium text-center">{activeAddress.name}</div>
              <div className="flex justify-center items-center">
                <span className="font-mono text-sm">{formatAddress(activeAddress.address)}</span>
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
  };

  const renderActionButtons = (): ReactElement => (
    <div className="grid grid-cols-3 gap-4 my-4">
      <Button color="gray" onClick={() => navigate(CONSTANTS.PATHS.VIEW_ADDRESS)} className="flex-col !py-4" aria-label="Receive tokens">
        <FaQrcode className="text-xl mb-2" aria-hidden="true" />
        <span>Receive</span>
      </Button>
      <Button color="gray" onClick={() => navigate(CONSTANTS.PATHS.SEND_BTC)} className="flex-col !py-4" aria-label="Send tokens">
        <FaPaperPlane className="text-xl mb-2" aria-hidden="true" />
        <span>Send</span>
      </Button>
      <Button color="gray" onClick={() => navigate(CONSTANTS.PATHS.ADDRESS_HISTORY)} className="flex-col !py-4" aria-label="Transaction history">
        <FaHistory className="text-xl mb-2" aria-hidden="true" />
        <span>History</span>
      </Button>
    </div>
  );

  const renderBalancesHeader = (): ReactElement => {
    const isTabView = window.location.pathname.includes("tab.html");
    return (
      <div className="flex justify-between items-center mb-2">
        <div className="flex space-x-4">
          <button
            className="text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none"
            style={{ textDecoration: activeTab === "Assets" ? "underline" : "none" }}
            onClick={() => setSearchParams({ tab: "Assets" })}
            aria-label="View Assets"
          >
            Assets
          </button>
          <button
            className="text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none"
            style={{ textDecoration: activeTab === "Balances" ? "underline" : "none" }}
            onClick={() => setSearchParams({ tab: "Balances" })}
            aria-label="View Balances"
          >
            Balances
          </button>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => navigate(CONSTANTS.PATHS.PINNED_ASSETS)}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
            aria-label="Manage Pinned Assets"
          >
            <TbPinned className="w-5 h-5 text-gray-600" aria-hidden="true" />
          </button>
          {!isTabView && (
            <button
              onClick={async () => {
                await browser.tabs.create({ url: browser.runtime.getURL(CONSTANTS.PATHS.TAB_INDEX), active: true });
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
  };

  const content = !loaded ? (
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
    <div className="flex flex-col h-full" role="main" aria-labelledby="index-title">
      <h2 id="index-title" className="sr-only">Wallet Dashboard</h2>
      <div className="flex flex-col flex-grow min-h-0">
        <div className="p-4 pb-0 flex-shrink-0">
          {content}
        </div>
        <div className="flex-grow overflow-y-auto no-scrollbar px-4 pb-4" style={{ display: activeTab === "Balances" ? "block" : "none" }}>
          <BalanceList />
        </div>
        <div className="flex-grow overflow-y-auto no-scrollbar px-4 pb-4" style={{ display: activeTab === "Assets" ? "block" : "none" }}>
          <AssetList />
        </div>
      </div>

      {/* Request Recovery Prompt - Only show for non-compose requests (sign messages) */}
      {/* Compose requests auto-navigate, so we don't show a prompt for those */}
      {showRecoveryPrompt && pendingRequest && pendingRequest.type !== 'compose' && (
        <RequestRecoveryPrompt
          origin={pendingRequest.origin}
          requestType={pendingRequest.type}
          requestAge={requestAge}
          onResume={resumeRequest}
          onCancel={cancelRequest}
        />
      )}
    </div>
  );
}
