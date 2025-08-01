"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaCheck } from "react-icons/fa";
import { RadioGroup } from "@headlessui/react";
import { ErrorAlert } from "@/components/error-alert";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressType } from "@/utils/blockchain/bitcoin";
import { formatAddress } from "@/utils/format";
import type { ReactElement } from "react";

/**
 * Constants for navigation paths and address type options.
 */
const CONSTANTS = {
  PATHS: {
    BACK: "/settings",
  } as const,
  AVAILABLE_ADDRESS_TYPES: Object.values(AddressType),
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
  const { activeWallet, updateWalletAddressType, getPreviewAddressForType } = useWallet();
  const [addresses, setAddresses] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<AddressType | null>(null);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Address Type",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
    });
  }, [setHeaderProps, navigate]);

  // Fetch preview addresses for each type
  useEffect(() => {
    const fetchAddresses = async () => {
      if (!activeWallet) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const addressMap: { [key: string]: string } = {};
        for (const type of CONSTANTS.AVAILABLE_ADDRESS_TYPES) {
          try {
            const previewAddress = await getPreviewAddressForType(activeWallet.id, type);
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
        setIsLoading(false);
      }
    };

    fetchAddresses();
  }, [activeWallet, getPreviewAddressForType]);

  // Sync selected type with active wallet
  useEffect(() => {
    if (activeWallet) setSelectedType(activeWallet.addressType);
  }, [activeWallet]);

  /**
   * Updates the wallet's address type and refreshes the preview address.
   * @param newType - The new address type to set.
   */
  const handleAddressTypeChange = async (newType: AddressType) => {
    if (!activeWallet) return;

    setIsUpdating(true);
    try {
      await updateWalletAddressType(activeWallet.id, newType);
      const previewAddress = await getPreviewAddressForType(activeWallet.id, newType);
      setAddresses((prev) => ({ ...prev, [newType]: previewAddress }));
      setError(null);
    } catch (err) {
      console.error("Error updating address type:", err);
      setError(err instanceof Error ? err.message : "Failed to update address type");
    } finally {
      setIsUpdating(false);
    }
  };

  /**
   * Gets a human-readable description for an address type.
   * @param type - The address type.
   * @returns {string} The description of the address type.
   */
  const getAddressTypeDescription = (type: AddressType): string => {
    switch (type) {
      case AddressType.P2PKH:
        return "Legacy (P2PKH)";
      case AddressType.P2WPKH:
        return "Native SegWit (P2WPKH)";
      case AddressType.P2SH_P2WPKH:
        return "Nested SegWit (P2SH-P2WPKH)";
      case AddressType.P2TR:
        return "Taproot (P2TR)";
      case AddressType.Counterwallet:
          return "CounterWallet (P2PKH)";
      default:
        return type;
    }
  };

  if (isLoading) return <div className="p-4 text-center text-gray-500">Loading...</div>;
  if (error) return <ErrorAlert message={error} onClose={() => setError(null)} />;
  if (!activeWallet) {
    return <div className="p-4 text-center text-gray-500">No wallet available</div>;
  }

  return (
    <div className="space-y-2 p-4" role="main" aria-labelledby="address-type-settings-title">
      <h2 id="address-type-settings-title" className="sr-only">
        Address Type Settings
      </h2>
      <RadioGroup
        value={selectedType}
        onChange={handleAddressTypeChange}
        className="space-y-2"
        disabled={isUpdating}
      >
        {CONSTANTS.AVAILABLE_ADDRESS_TYPES.filter((type) => {
          // Only show Counterwallet if it's the current address type
          if (type === AddressType.Counterwallet) {
            return activeWallet?.addressType === AddressType.Counterwallet;
          }
          return true;
        }).map((type) => {
          const typeLabel = getAddressTypeDescription(type);
          const isCounterwallet = activeWallet?.addressType === AddressType.Counterwallet;
          const isDisabled = isUpdating || (isCounterwallet && type !== AddressType.Counterwallet);
          const disabledReason = isUpdating ? "Updating..." : (isCounterwallet && type !== AddressType.Counterwallet) ? "Create new wallet to use this address type" : undefined;

          return (
            <RadioGroup.Option
              key={type}
              value={type}
              disabled={isDisabled}
              className={({ checked }) => `
                relative w-full rounded transition duration-300 p-4
                ${isDisabled ? "cursor-not-allowed bg-gray-300" : checked ? "cursor-pointer bg-white shadow-md" : "cursor-pointer bg-white hover:bg-gray-50"}
                ${isUpdating ? "opacity-50" : ""}
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
