"use client";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaChevronRight } from "react-icons/fa";
import { FiHelpCircle } from "react-icons/fi";
import { Button } from "@/components/button";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressType } from "@/utils/blockchain/bitcoin";
import type { ReactElement } from "react";

/**
 * Interface for a setting option.
 */
interface SettingOption {
  id: string;
  name: string;
  description: string;
  path: string;
}

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
   * Gets a human-readable description for the wallet's address type.
   * @returns {string} The description of the address type.
   */
  const getAddressTypeDescription = (): string => {
    if (!activeWallet) return "";
    switch (activeWallet.addressType) {
      case AddressType.P2PKH:
        return "Legacy (P2PKH)";
      case AddressType.P2SH_P2WPKH:
        return "Nested SegWit (P2SH-P2WPKH)";
      case AddressType.P2WPKH:
        return "Native SegWit (P2WPKH)";
      case AddressType.P2TR:
        return "Taproot (P2TR)";
      case AddressType.Counterwallet:
        return "CounterWallet (P2PKH)";
      default:
        return "";
    }
  };

  const settingOptions: SettingOption[] = [
    ...(activeWallet?.type === "mnemonic"
      ? [
          {
            id: "addressType",
            name: "Address Type",
            description: getAddressTypeDescription(),
            path: CONSTANTS.PATHS.ADDRESS_TYPE,
          },
        ]
      : []),
    {
      id: "advanced",
      name: "Advanced",
      description: "Network settings and developer options",
      path: CONSTANTS.PATHS.ADVANCED,
    },
    {
      id: "connectedSites",
      name: "Connected Sites",
      description: "Manage website connections",
      path: CONSTANTS.PATHS.CONNECTED_SITES,
    },
    {
      id: "pinnedAssets",
      name: "Pinned Assets",
      description: "Manage assets pinned to your dashboard",
      path: CONSTANTS.PATHS.PINNED_ASSETS,
    },
    {
      id: "security",
      name: "Security",
      description: "Change your wallet password",
      path: CONSTANTS.PATHS.SECURITY,
    },
  ];

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="settings-title">
      <div className="flex-1 overflow-auto no-scrollbar">
        <div className="p-4">
          <h2 id="settings-title" className="text-lg font-semibold mb-4">
            Settings
          </h2>
          <div className="space-y-2">
            {settingOptions.map((option) => (
              <div
                key={option.id}
                onClick={() => navigate(option.path)}
                className="relative w-full rounded transition duration-300 p-4 cursor-pointer bg-white hover:bg-gray-50"
                role="button"
                tabIndex={0}
                aria-label={option.name}
              >
                <div className="flex flex-col">
                  <div className="absolute top-1/2 -translate-y-1/2 right-5">
                    <FaChevronRight className="w-4 h-4 text-gray-400" aria-hidden="true" />
                  </div>
                  <div className="text-sm font-medium text-gray-900 mb-1">{option.name}</div>
                  <div className="text-xs text-gray-500">{option.description}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <h3 className="text-sm font-medium text-gray-900 px-4 mb-2">About XCP Wallet</h3>
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
