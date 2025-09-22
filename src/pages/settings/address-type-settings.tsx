"use client";

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FiHelpCircle } from "react-icons/fi";
import { RadioGroup } from "@headlessui/react";
import { SelectionCard, SelectionCardGroup } from "@/components/cards/selection-card";
import { ErrorAlert } from "@/components/error-alert";
import { Spinner } from "@/components/spinner";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressFormat } from '@/utils/blockchain/bitcoin';
import { formatAddress } from "@/utils/format";
import type { ReactElement } from "react";

/**
 * Constants for navigation paths and address type options.
 */
const CONSTANTS = {
  PATHS: {
    BACK: "/settings",
    HELP_URL: "https://youtube.com", // Placeholder for now
  } as const,
  AVAILABLE_ADDRESS_TYPES: Object.values(AddressFormat),
} as const;

/**
 * AddressTypeSettings component allows users to select and update the wallet's address type.
 *
 * Features:
 * - Displays available address types with preview addresses
 * - Updates the wallet's address type and refreshes preview
 *
 * @returns {ReactElement} The rendered address type settings UI.
 * @example
 * ```tsx
 * <AddressTypeSettings />
 * ```
 */
export default function AddressTypeSettings(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet, updateWalletAddressFormat, getPreviewAddressForFormat } = useWallet();
  const [addresses, setAddresses] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<AddressFormat | null>(null);
  const originalAddressFormat = useRef<AddressFormat | null>(null);
  const hasChangedType = useRef(false);
  const isChanging = useRef(false);

  // Configure header with dynamic back navigation and help button
  useEffect(() => {
    const handleBack = () => {
      // If address type was changed, go to index
      if (hasChangedType.current) {
        navigate("/index");
      } else {
        // Otherwise go back to settings
        navigate(CONSTANTS.PATHS.BACK);
      }
    };
    
    setHeaderProps({
      title: "Address Type",
      onBack: handleBack,
      rightButton: {
        icon: <FiHelpCircle className="w-4 h-4" aria-hidden="true" />,
        onClick: () => window.open(CONSTANTS.PATHS.HELP_URL, "_blank"),
        ariaLabel: "Help",
      },
    });
  }, [setHeaderProps, navigate]);


  // Load preview addresses
  useEffect(() => {
    const loadAddresses = async () => {
      if (!activeWallet) {
        setIsInitialLoading(false);
        return;
      }
      
      setIsInitialLoading(true);
      const addressMap: { [key: string]: string } = {};
      
      for (const format of CONSTANTS.AVAILABLE_ADDRESS_TYPES) {
        try {
          // Try to get cached or generate preview
          const preview = await getPreviewAddressForFormat(activeWallet.id, format);
          addressMap[format] = preview;
        } catch (err) {
          // If no cached preview available, leave empty
          console.debug(`No preview available for ${format}:`, err);
          addressMap[format] = "";
        }
      }
      
      setAddresses(addressMap);
      setIsInitialLoading(false);
    };
    
    loadAddresses();
  }, [activeWallet, getPreviewAddressForFormat]);

  // Sync selected type with active wallet and store original
  useEffect(() => {
    if (activeWallet) {
      setSelectedFormat(activeWallet.addressFormat);
      // Store the original address type on mount
      if (originalAddressFormat.current === null) {
        originalAddressFormat.current = activeWallet.addressFormat;
      }
    }
  }, [activeWallet]);

  /**
   * Updates the wallet's address type and refreshes the preview address.
   * @param newType - The new address type to set.
   */
  const handleAddressFormatChange = async (newType: AddressFormat | null) => {
    if (!newType) return;
    if (!activeWallet || isChanging.current) return;

    // Update selected type immediately for instant UI response
    setSelectedFormat(newType);
    
    // Track that a change has been made
    hasChangedType.current = newType !== originalAddressFormat.current;
    
    // Show loading state during update
    setIsLoading(true);
    isChanging.current = true;

    try {
      await updateWalletAddressFormat(activeWallet.id, newType);
      setError(null);
    } catch (err) {
      console.error("Error updating address type:", err);
      setError(err instanceof Error ? err.message : "Failed to update address type");
      // Revert selection on error
      setSelectedFormat(activeWallet.addressFormat);
      hasChangedType.current = activeWallet.addressFormat !== originalAddressFormat.current;
    } finally {
      setIsLoading(false);
      isChanging.current = false;
    }
  };

  /**
   * Gets a human-readable description for an address type.
   * @param type - The address type.
   * @returns {string} The description of the address type.
   */
  const getAddressFormatDescription = (type: AddressFormat): string => {
    switch (type) {
      case AddressFormat.P2PKH:
        return "Legacy (P2PKH)";
      case AddressFormat.P2WPKH:
        return "Native SegWit (P2WPKH)";
      case AddressFormat.P2SH_P2WPKH:
        return "Nested SegWit (P2SH-P2WPKH)";
      case AddressFormat.P2TR:
        return "Taproot (P2TR)";
      case AddressFormat.Counterwallet:
          return "CounterWallet (P2PKH)";
      case AddressFormat.CounterwalletSegwit:
          return "CounterWallet SegWit (bc1)";
      default:
        return type;
    }
  };

  
  if (isInitialLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }
  
  if (!activeWallet) {
    return <div className="p-4 text-center text-gray-500">No wallet available</div>;
  }

  return (
    <div className="space-y-2 p-4" role="main" aria-labelledby="address-type-settings-title">
      <h2 id="address-type-settings-title" className="sr-only">
        Address Type Settings
      </h2>
      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
      {isLoading && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <Spinner />
        </div>
      )}
      <RadioGroup
        value={selectedFormat}
        onChange={handleAddressFormatChange}
        className="space-y-2"
        disabled={isLoading}
      >
        <SelectionCardGroup>
          {CONSTANTS.AVAILABLE_ADDRESS_TYPES.filter((type) => {
            const isCounterwallet = activeWallet?.addressFormat === AddressFormat.Counterwallet ||
                                    activeWallet?.addressFormat === AddressFormat.CounterwalletSegwit;

            // For Counterwallet users, only show Counterwallet and CounterwalletSegwit options
            if (isCounterwallet) {
              return type === AddressFormat.Counterwallet || type === AddressFormat.CounterwalletSegwit;
            }

            // For non-Counterwallet users, hide both Counterwallet formats
            if (type === AddressFormat.Counterwallet || type === AddressFormat.CounterwalletSegwit) {
              return false;
            }

            return true;
          }).map((type) => {
            const typeLabel = getAddressFormatDescription(type);
            // No addresses should be disabled since we're filtering them properly
            const isDisabled = false;
            const disabledReason = undefined;
            // Use loaded address preview
            const address = addresses[type] || "";
            const addressPreview = address ? formatAddress(address) : "";

            return (
              <SelectionCard
                key={type}
                value={type}
                title={typeLabel}
                description={addressPreview}
                disabled={isDisabled}
                disabledReason={disabledReason}
              />
            );
          })}
        </SelectionCardGroup>
      </RadioGroup>
    </div>
  );
}