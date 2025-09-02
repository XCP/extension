"use client";

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FaCheck } from "react-icons/fa";
import { FiHelpCircle } from "react-icons/fi";
import { RadioGroup } from "@headlessui/react";
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

  // Fetch preview addresses for each type
  useEffect(() => {
    const fetchAddresses = async () => {
      if (!activeWallet) {
        setIsInitialLoading(false);
        return;
      }

      // Only show loading on initial mount, not when wallet changes due to address type update
      if (!isChanging.current) {
        setIsInitialLoading(true);
      }
      
      try {
        const addressMap: { [key: string]: string } = {};
        for (const type of CONSTANTS.AVAILABLE_ADDRESS_TYPES) {
          try {
            const previewAddress = await getPreviewAddressForFormat(activeWallet.id, type);
            addressMap[type] = previewAddress;
          } catch (err) {
            console.error(`Error generating address for type ${type}:`, err);
            addressMap[type] = "";
          }
        }
        setAddresses(addressMap);
        setError(null);
      } catch (err) {
        console.error("Error fetching addresses:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch addresses");
      } finally {
        setIsInitialLoading(false);
        isChanging.current = false;
      }
    };

    fetchAddresses();
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
  const handleAddressFormatChange = async (newType: AddressFormat) => {
    if (!activeWallet || isChanging.current) return;

    // Update selected type immediately for instant UI response
    setSelectedFormat(newType);
    
    // Track that a change has been made
    hasChangedType.current = newType !== originalAddressFormat.current;
    
    // Set flag to prevent loading state during the update
    isChanging.current = true;

    try {
      await updateWalletAddressFormat(activeWallet.id, newType);
      const previewAddress = await getPreviewAddressForFormat(activeWallet.id, newType);
      setAddresses((prev) => ({ ...prev, [newType]: previewAddress }));
      setError(null);
    } catch (err) {
      console.error("Error updating address type:", err);
      setError(err instanceof Error ? err.message : "Failed to update address type");
      // Revert selection on error
      setSelectedFormat(activeWallet.addressFormat);
      hasChangedType.current = activeWallet.addressFormat !== originalAddressFormat.current;
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
      <RadioGroup
        value={selectedFormat}
        onChange={handleAddressFormatChange}
        className="space-y-2"
        disabled={false}
      >
        {CONSTANTS.AVAILABLE_ADDRESS_TYPES.filter((type) => {
          // Only show Counterwallet if it's the current address type
          if (type === AddressFormat.Counterwallet) {
            return activeWallet?.addressFormat === AddressFormat.Counterwallet;
          }
          return true;
        }).map((type) => {
          const typeLabel = getAddressFormatDescription(type);
          const isCounterwallet = activeWallet?.addressFormat === AddressFormat.Counterwallet;
          const isDisabled = isCounterwallet && type !== AddressFormat.Counterwallet;
          const disabledReason = (isCounterwallet && type !== AddressFormat.Counterwallet) ? "Create new wallet to use this address type" : undefined;

          return (
            <RadioGroup.Option
              key={type}
              value={type}
              disabled={isDisabled}
              className={({ checked }) => `
                relative w-full rounded transition duration-300 p-4
                ${isDisabled ? "cursor-not-allowed bg-gray-300" : checked ? "cursor-pointer bg-white shadow-md" : "cursor-pointer bg-white hover:bg-gray-50"}
              `}
            >
              {({ checked }) => (
                <>
                  {checked && (
                    <div className="absolute top-1/2 -translate-y-1/2 right-5">
                      <FaCheck className="w-4 h-4 text-blue-500" aria-hidden="true" />
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900 mb-1">{typeLabel}</span>
                    <span className="text-xs text-gray-500">
                      {addresses[type] ? formatAddress(addresses[type]) : "Loading..."}
                    </span>
                    {isDisabled && disabledReason && (
                      <span className="text-xs text-blue-500 mt-1">{disabledReason}</span>
                    )}
                  </div>
                </>
              )}
            </RadioGroup.Option>
          );
        })}
      </RadioGroup>
    </div>
  );
}
