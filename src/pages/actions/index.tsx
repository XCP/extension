import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaLock } from "@/components/icons";
import { ActionList } from "@/components/ui/lists/action-list";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { useSettings } from "@/contexts/settings-context";
import { isSegwitFormat } from '@/utils/blockchain/bitcoin/address';
import type { ReactElement } from "react";
import type { ActionSection } from "@/components/ui/lists/action-list";

/**
 * Constants for navigation paths.
 */
const PATHS = {
  BACK: "/index",
} as const;

const getActionSections = (
  isSegwitWallet: boolean,
  enableMPMA: boolean,
  showRecoverBitcoinNotification: boolean,
  navigate: (path: string) => void
): ActionSection[] => {
  const sections: ActionSection[] = [
    {
      title: "Tools",
      items: [
        {
          id: "sign-message",
          title: "Sign Message",
          description: "Sign a message with your address",
          onClick: () => navigate("/actions/sign-message"),
        },
        {
          id: "verify-message",
          title: "Verify Message", 
          description: "Verify a signed message",
          onClick: () => navigate("/actions/verify-message"),
        },
        {
          id: "consolidate",
          title: "Recover Bitcoin",
          description: "Find and consolidate bare multisig UTXOs",
          onClick: () => navigate("/actions/consolidate"),
          showNotification: showRecoverBitcoinNotification,
          className: showRecoverBitcoinNotification ? "!border !border-orange-500" : "",
        },
        ...(enableMPMA ? [{
          id: "upload-mpma",
          title: "Upload MPMA",
          description: "Multi-Party Multi-Asset transaction",
          onClick: () => navigate("/compose/send/mpma"),
        }] : []),
      ],
    },
    {
      title: "Assets",
      items: [
        {
          id: "issue-asset",
          title: "Issue Asset",
          description: "Create a new asset",
          onClick: () => navigate("/compose/issuance"),
        },
        {
          id: "mint-supply",
          title: "Start Mint",
          description: "Create a fairminter", 
          onClick: () => navigate("/compose/fairminter"),
        },
      ],
    },
    {
      title: "Address",
      items: [
        {
          id: "compose-broadcast",
          title: isSegwitWallet ? "Broadcast" : "Broadcast Text",
          description: isSegwitWallet ? "Broadcast message or inscription" : "Broadcast message from address",
          onClick: () => navigate("/compose/broadcast"),
        },
        {
          id: "compose-sweep",
          title: "Sweep Address",
          description: "Transfer every asset and balance",
          onClick: () => navigate("/compose/sweep"),
        },
        {
          id: "compose-broadcast-address-options",
          title: "Update Options", 
          description: "Set address options like requiring memos",
          onClick: () => navigate("/compose/broadcast/address-options"),
        },
      ],
    },
    {
      title: "DEX",
      items: [
        {
          id: "cancel-order",
          title: "Cancel Order",
          description: "Cancel an existing order",
          onClick: () => navigate("/compose/order/cancel"),
        },
        {
          id: "close-dispenser",
          title: "Close Dispenser", 
          description: "Close an existing dispenser",
          onClick: () => navigate("/compose/dispenser/close"),
        },
        {
          id: "close-dispenser-by-hash",
          title: "Close Dispenser by Hash",
          description: "Close a dispenser using its transaction hash",
          onClick: () => navigate("/compose/dispenser/close-by-hash"),
        },
      ],
    },
    {
      title: "Multisig",
      items: [
        {
          id: "fund-bare-multisig",
          title: "Fund Multisig",
          description: "Create a transaction funding a multisig output",
          onClick: () => navigate("/actions/fund-bare-multisig"),
        },
        {
          id: "sign-transaction",
          title: "Sign Transaction",
          description: "Sign a raw transaction with your key",
          onClick: () => navigate("/actions/sign-transaction"),
        },
        {
          id: "combine-signatures",
          title: "Combine Sigs",
          description: "Combine multisig signatures into a broadcast-ready transaction",
          onClick: () => navigate("/actions/combine-signatures"),
        },
        {
          id: "broadcast-transaction",
          title: "Broadcast Transaction",
          description: "Broadcast a signed transaction to the network",
          onClick: () => navigate("/actions/broadcast-transaction"),
        },
      ],
    },
  ];

  return sections;
};

/**
 * ActionsScreen component displays a list of actionable wallet operations.
 *
 * Features:
 * - Groups actions into categories (Basic, Assets, DEX, etc.)
 * - Navigates to specific action paths on click
 *
 * @returns {ReactElement} The rendered actions screen UI.
 * @example
 * ```tsx
 * <ActionsScreen />
 * ```
 */
export default function ActionsPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet, lockKeychain } = useWallet();
  const { settings } = useSettings();
  
  // Check if active wallet uses SegWit addresses (P2WPKH, P2SH-P2WPKH, or P2TR)
  const isSegwitWallet = activeWallet?.addressFormat ? isSegwitFormat(activeWallet.addressFormat) : false;
  
  // Check if MPMA is enabled
  const enableMPMA = settings?.enableMPMA ?? false;

  // Check if user has visited recover bitcoin page
  const showRecoverBitcoinNotification = !settings?.hasVisitedRecoverBitcoin;
  
  // Get dynamic action sections based on wallet type and settings
  const actionSections = getActionSections(isSegwitWallet, enableMPMA, showRecoverBitcoinNotification, navigate);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Actions",
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FaLock aria-hidden="true" />,
        onClick: async () => {
          await lockKeychain();
          navigate("/keychain/unlock");
        },
        ariaLabel: "Lock Keychain",
      },
    });
  }, [setHeaderProps, navigate, lockKeychain]);

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="actions-title">
      <h2 id="actions-title" className="sr-only">
        Wallet Actions
      </h2>
      <div className="flex-1 overflow-auto no-scrollbar p-4">
        <ActionList sections={actionSections} />
      </div>
    </div>
  );
}
