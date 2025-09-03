"use client";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiHelpCircle } from "react-icons/fi";
import { Button } from "@/components/button";
import { ActionList } from "@/components/lists/action-list";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressFormat } from '@/utils/blockchain/bitcoin';
import type { ReactElement } from "react";
import type { ActionSection } from "@/components/lists/action-list";


/**
 * Constants for navigation paths and external links.
 */
const CONSTANTS = {
  PATHS: {
    BACK: "/index",
    ADDRESS_TYPE: "/settings/address-type",
    ADVANCED: "/settings/advanced",
    CONNECTED_SITES: "/settings/connected-sites",
    SECURITY: "/settings/security",
    RESET_WALLET: "/reset-wallet",
    PINNED_ASSETS: "/settings/pinned-assets",
    HELP_URL: "https://youtube.com", // Placeholder for now
  } as const,
  EXTERNAL_LINKS: {
    TERMS: "https://www.xcp.io/terms",
    PRIVACY: "https://www.xcp.io/privacy",
    WEBSITE: "https://www.xcp.io/?ref=wallet",
  } as const,
  VERSION: "0.0.1",
} as const;

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
export default function Settings(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet } = useWallet();

  // Configure header with help button
  useEffect(() => {
    setHeaderProps({
      title: "Settings",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
      rightButton: {
        icon: <FiHelpCircle className="w-4 h-4" aria-hidden="true" />,
        onClick: () => window.open(CONSTANTS.PATHS.HELP_URL, "_blank"),
        ariaLabel: "Help",
      },
    });
  }, [setHeaderProps, navigate]);

  /**
   * Gets a preview address or description for the wallet's address type.
   * @returns {string} The address preview or type description.
   */
  const getAddressTypeDescription = (): string => {
    if (!activeWallet) return "";
    
    // If wallet has addresses, show the current address
    if (activeWallet.addresses && activeWallet.addresses.length > 0) {
      const currentAddress = activeWallet.addresses[0].address;
      if (currentAddress) {
        // Format the address (truncate for display)
        const start = currentAddress.slice(0, 6);
        const end = currentAddress.slice(-6);
        return `${start}...${end}`;
      }
    }
    
    // Fall back to showing the address type description
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
              onClick: () => navigate(CONSTANTS.PATHS.ADDRESS_TYPE),
            }]
          : []),
        {
          id: "advanced",
          title: "Advanced",
          description: "Network settings and developer options",
          onClick: () => navigate(CONSTANTS.PATHS.ADVANCED),
        },
        {
          id: "connectedSites",
          title: "Connected Sites",
          description: "Manage website connections",
          onClick: () => navigate(CONSTANTS.PATHS.CONNECTED_SITES),
        },
        {
          id: "pinnedAssets",
          title: "Pinned Assets",
          description: "Manage assets pinned to your dashboard",
          onClick: () => navigate(CONSTANTS.PATHS.PINNED_ASSETS),
        },
        {
          id: "security",
          title: "Security",
          description: "Change your wallet password",
          onClick: () => navigate(CONSTANTS.PATHS.SECURITY),
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="settings-title">
      <div className="flex-1 overflow-auto no-scrollbar">
        <div className="p-4">
          <ActionList sections={settingSections} />

          <div className="mt-8">
            <h3 className="text-sm font-medium text-gray-500 px-4 mb-2">About XCP Wallet</h3>
            <div className="bg-white rounded">
              <div className="p-4 border-b">
                <div className="text-sm">Version {CONSTANTS.VERSION}</div>
              </div>
              <a
                href={CONSTANTS.EXTERNAL_LINKS.TERMS}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 border-b text-sm text-blue-500 hover:text-blue-600 hover:bg-gray-50"
              >
                Terms of Service
              </a>
              <a
                href={CONSTANTS.EXTERNAL_LINKS.PRIVACY}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 border-b text-sm text-blue-500 hover:text-blue-600 hover:bg-gray-50"
              >
                Privacy Policy
              </a>
              <a
                href={CONSTANTS.EXTERNAL_LINKS.WEBSITE}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 text-sm text-blue-500 hover:text-blue-600 hover:bg-gray-50"
              >
                Visit Website
              </a>
            </div>
          </div>

          <div className="mt-8 mb-4">
            <Button
              color="red"
              onClick={() => navigate(CONSTANTS.PATHS.RESET_WALLET)}
              fullWidth
              aria-label="Reset Wallet"
            >
              Reset Wallet
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
