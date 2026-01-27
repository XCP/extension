import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RadioGroup } from "@headlessui/react";
import {
  FaChevronRight,
  FaClipboard,
  FaCheck,
  FaPaperPlane,
  FaQrcode,
  FaHistory,
  FaLock,
  TbPinned
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { AssetList } from "@/components/ui/lists/asset-list";
import { BalanceList } from "@/components/ui/lists/balance-list";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { formatAddress } from "@/utils/format";
import type { ReactElement } from "react";

const COPY_FEEDBACK_DURATION = 2000;
const TABS = ["Assets", "Balances"] as const;
const PATHS = {
  SELECT_WALLET: "/keychain/wallets",
  UNLOCK_WALLET: "/keychain/unlock",
  VIEW_ADDRESS: "/addresses/details",
  SEND_BTC: "/compose/send/BTC",
  ADDRESS_HISTORY: "/addresses/history",
  SELECT_ADDRESS: "/addresses",
  PINNED_ASSETS: "/settings/pinned-assets",
} as const;

export default function HomePage(): ReactElement {
  const { activeWallet, activeAddress, lockKeychain, isLoading } = useWallet();
  const { setHeaderProps } = useHeader();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as "Assets" | "Balances") || "Balances";
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  useEffect(() => {
    setHeaderProps({
      useLogoTitle: true,
      leftButton: {
        label: activeWallet?.name || "Wallet",
        onClick: () => navigate(PATHS.SELECT_WALLET),
        ariaLabel: "Select Wallet",
      },
      rightButton: {
        icon: <FaLock aria-hidden="true" />,
        onClick: async () => {
          await lockKeychain();
          navigate(PATHS.UNLOCK_WALLET);
        },
        ariaLabel: "Lock Keychain",
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, activeWallet, lockKeychain]);

  useEffect(() => {
    if (copiedToClipboard) {
      const timer = setTimeout(() => setCopiedToClipboard(false), COPY_FEEDBACK_DURATION);
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
    navigate(PATHS.SELECT_ADDRESS);
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
                  className="py-6 px-3 -m-2 cursor-pointer hover:bg-white/5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  onClick={handleAddressSelection}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleAddressSelection(e as unknown as React.MouseEvent);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Select another address"
                >
                  <FaChevronRight className="size-4" aria-hidden="true" />
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
      <Button color="gray" onClick={() => navigate(PATHS.VIEW_ADDRESS)} className="flex-col !py-4" aria-label="Receive tokens">
        <FaQrcode className="text-xl mb-2" aria-hidden="true" />
        <span>Receive</span>
      </Button>
      <Button color="gray" onClick={() => navigate(PATHS.SEND_BTC)} className="flex-col !py-4" aria-label="Send tokens">
        <FaPaperPlane className="text-xl mb-2" aria-hidden="true" />
        <span>Send</span>
      </Button>
      <Button color="gray" onClick={() => navigate(PATHS.ADDRESS_HISTORY)} className="flex-col !py-4" aria-label="Transaction history">
        <FaHistory className="text-xl mb-2" aria-hidden="true" />
        <span>History</span>
      </Button>
    </div>
  );

  const renderBalancesHeader = (): ReactElement => {
    return (
      <div className="flex justify-between items-center mb-2">
        <div className="flex space-x-4">
          <button
            className="text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
            style={{ textDecoration: activeTab === "Assets" ? "underline" : "none" }}
            onClick={() => setSearchParams({ tab: "Assets" })}
            aria-label="View Assets"
          >
            Assets
          </button>
          <button
            className="text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
            style={{ textDecoration: activeTab === "Balances" ? "underline" : "none" }}
            onClick={() => setSearchParams({ tab: "Balances" })}
            aria-label="View Balances"
          >
            Balances
          </button>
        </div>
        <button
          onClick={() => navigate(PATHS.PINNED_ASSETS)}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Manage Pinned Assets"
        >
          <TbPinned className="size-5 text-gray-600" aria-hidden="true" />
        </button>
      </div>
    );
  };

  const content = isLoading ? (
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
    </div>
  );
}
