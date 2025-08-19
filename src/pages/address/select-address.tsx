"use client";

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FaPlus } from "react-icons/fa";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressList } from "@/components/lists/address-list";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import type { Address } from "@/utils/wallet";
import type { ReactElement } from "react";

/**
 * Constants for navigation paths and address limits.
 */
const CONSTANTS = {
  MAX_ADDRESSES: 20,
  PATHS: {
    UNLOCK: "/unlock",
    INDEX: "/index",
    SELECT: "/address/select",
  } as const,
} as const;

/**
 * AddressSelection component allows users to select or add an address for the active wallet.
 *
 * Features:
 * - Displays a list of addresses from the active wallet
 * - Provides an option to add a new address (mnemonic wallets only, up to 20)
 * - Redirects to unlock if wallet is locked
 *
 * @returns {ReactElement} The rendered address selection UI.
 */
export default function AddressSelection(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet, activeAddress, setActiveAddress, addAddress, walletLocked } = useWallet();
  const [error, setError] = useState<string | null>(null);

  /**
   * Handles adding a new address to the active wallet.
   */
  const handleAddAddress = useCallback(async () => {
    if (!activeWallet?.id || activeWallet.type !== "mnemonic") return;
    if (activeWallet.addresses.length >= CONSTANTS.MAX_ADDRESSES) {
      setError(`Maximum number of addresses (${CONSTANTS.MAX_ADDRESSES}) reached`);
      return;
    }

    try {
      if (walletLocked) {
        navigate(CONSTANTS.PATHS.UNLOCK, {
          state: { returnTo: CONSTANTS.PATHS.SELECT, walletId: activeWallet.id },
        });
        return;
      }
      await addAddress(activeWallet.id);
      setError(null);
    } catch (err) {
      console.error("Failed to add address:", err);
      setError("Failed to add address. Please try again.");
    }
  }, [activeWallet, walletLocked, addAddress, navigate]);

  /**
   * Handles selecting an address and navigating to the index.
   */
  const handleSelectAddress = useCallback(async (address: Address) => {
    try {
      await setActiveAddress(address);
      navigate(CONSTANTS.PATHS.INDEX);
    } catch (err) {
      console.error("Failed to select address:", err);
      setError("Failed to select address. Please try again.");
    }
  }, [setActiveAddress, navigate]);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Addresses",
      onBack: () => navigate(-1),
      rightButton:
        activeWallet?.type === "mnemonic"
          ? {
              icon: <FaPlus aria-hidden="true" />,
              onClick: handleAddAddress,
              ariaLabel: "Add Address",
            }
          : undefined,
    });
  }, [setHeaderProps, navigate, activeWallet?.type, handleAddAddress]);

  if (!activeWallet) return <div className="p-4">No active wallet found</div>;

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="address-selection-title">
      <div className="flex-grow overflow-y-auto p-4">
        {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
        <h2 id="address-selection-title" className="sr-only">Select an Address</h2>
        <AddressList
          addresses={activeWallet.addresses}
          selectedAddress={activeAddress}
          onSelectAddress={handleSelectAddress}
          walletId={activeWallet.id}
        />
      </div>
      <div className="p-4">
        <Button
          color="green"
          fullWidth
          onClick={handleAddAddress}
          disabled={
            activeWallet.addresses.length >= CONSTANTS.MAX_ADDRESSES ||
            walletLocked ||
            activeWallet.type !== "mnemonic"
          }
          aria-label="Add Address"
        >
          <FaPlus className="mr-2" aria-hidden="true" />
          {walletLocked ? "Unlock to Add Address" : "Add Address"}
        </Button>
      </div>
    </div>
  );
}
