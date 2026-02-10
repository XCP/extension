import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaLock } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ActionList } from "@/components/ui/lists/action-list";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import type { ReactElement } from "react";
import type { ActionSection } from "@/components/ui/lists/action-list";
import packageJson from "../../../package.json";


/**
 * Constants for navigation paths and external links.
 */
const PATHS = {
  BACK: "/index",
  ADDRESS_TYPE: "/settings/address-types",
  ADVANCED: "/settings/advanced",
  CONNECTED_SITES: "/settings/connected-sites",
  SECURITY: "/settings/security",
  RESET_WALLET: "/keychain/wallets/reset",
  PINNED_ASSETS: "/settings/pinned-assets",
} as const;
const EXTERNAL_LINKS = {
  TERMS: "https://www.xcp.io/terms",
  PRIVACY: "https://www.xcp.io/privacy",
  WEBSITE: "https://www.xcp.io/?ref=wallet",
} as const;
const VERSION = packageJson.version;

/**
 * Settings component provides a main settings menu with navigation options.
 *
 * Features:
 * - Lists wallet-specific and general settings options
 * - Includes an about section and a reset wallet button
 *
 * @returns {ReactElement} The rendered settings UI.
 * @example
 * ```tsx
 * <Settings />
 * ```
 */
export default function SettingsPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet, lockKeychain } = useWallet();

  // Configure header with lock button
  useEffect(() => {
    setHeaderProps({
      title: "Settings",
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

  /**
   * Gets a human-readable description for the wallet's address type.
   * @returns {string} The description of the address type.
   */
  const getAddressTypeDescription = (): string => {
    if (!activeWallet) return "";
    switch (activeWallet.addressFormat) {
      case AddressFormat.P2PKH:
        return "Legacy (P2PKH)";
      case AddressFormat.P2SH_P2WPKH:
        return "Nested SegWit (P2SH-P2WPKH)";
      case AddressFormat.P2WPKH:
        return "Native SegWit (P2WPKH)";
      case AddressFormat.P2TR:
        return "Taproot (P2TR)";
      case AddressFormat.Counterwallet:
        return "CounterWallet (P2PKH)";
      case AddressFormat.CounterwalletSegwit:
        return "CounterWallet SegWit (P2WPKH)";
      case AddressFormat.FreewalletBIP39:
        return "FreeWallet (P2PKH)";
      default:
        return "";
    }
  };

  const settingSections: ActionSection[] = [
    {
      title: "Settings",
      items: [
        ...(activeWallet?.type === "mnemonic"
          ? [{
              id: "addressFormat",
              title: "Address Type",
              description: getAddressTypeDescription(),
              onClick: () => navigate(PATHS.ADDRESS_TYPE),
            }]
          : []),
        {
          id: "advanced",
          title: "Advanced",
          description: "Network settings and developer options",
          onClick: () => navigate(PATHS.ADVANCED),
        },
        {
          id: "connectedSites",
          title: "Connected Sites",
          description: "Manage website connections",
          onClick: () => navigate(PATHS.CONNECTED_SITES),
        },
        {
          id: "pinnedAssets",
          title: "Pinned Assets",
          description: "Manage assets pinned to your dashboard",
          onClick: () => navigate(PATHS.PINNED_ASSETS),
        },
        {
          id: "security",
          title: "Security",
          description: "Change your wallet password",
          onClick: () => navigate(PATHS.SECURITY),
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full" role="main">
      <div className="flex-1 overflow-auto no-scrollbar">
        <div className="p-4">
          <ActionList sections={settingSections} />

          <div className="mt-8">
            <h2 className="text-sm font-medium text-gray-500 px-4 mb-2">About XCP Wallet</h2>
            <div className="bg-white rounded">
              <div className="p-4 border-b">
                <div className="text-sm">Version {VERSION}</div>
              </div>
              <a
                href={EXTERNAL_LINKS.TERMS}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 border-b text-sm text-blue-500 hover:text-blue-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
              >
                Terms of Service
              </a>
              <a
                href={EXTERNAL_LINKS.PRIVACY}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 border-b text-sm text-blue-500 hover:text-blue-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
              >
                Privacy Policy
              </a>
              <a
                href={EXTERNAL_LINKS.WEBSITE}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 text-sm text-blue-500 hover:text-blue-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
              >
                Visit Website
              </a>
            </div>
          </div>

          <div className="mt-8 mb-4">
            <Button
              color="red"
              onClick={() => navigate(PATHS.RESET_WALLET)}
              fullWidth
            >
              Reset Wallet
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
