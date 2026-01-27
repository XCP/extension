import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FaPlus } from "@/components/icons";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { AddressList } from "@/components/lists/address-list";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { MAX_ADDRESSES_PER_WALLET } from "@/utils/wallet/constants";
import { analytics } from "@/utils/fathom";
import type { Address } from "@/types/wallet";
import type { ReactElement } from "react";

/**
 * Constants for navigation paths.
 */
const PATHS = {
  UNLOCK: "/keychain/unlock",
  INDEX: "/index",
  SELECT: "/addresses",
} as const;

/**
 * AddressSelection component allows users to select or add an address for the active wallet.
 *
 * Features:
 * - Displays a list of addresses from the active wallet
 * - Provides an option to add a new address (mnemonic wallets only, up to 100)
 * - Redirects to unlock if wallet is locked
 *
 * @returns {ReactElement} The rendered address selection UI.
 */
export default function AddressesPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet, activeAddress, setActiveAddress, addAddress, keychainLocked } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [isAddingAddress, setIsAddingAddress] = useState(false);

  /**
   * Handles adding a new address to the active wallet.
   */
  const handleAddAddress = useCallback(async () => {
    if (!activeWallet?.id || activeWallet.type !== "mnemonic") return;
    if (isAddingAddress) return; // Prevent spam clicks
    if (activeWallet.addresses.length >= MAX_ADDRESSES_PER_WALLET) {
      setError(`Maximum number of addresses (${MAX_ADDRESSES_PER_WALLET}) reached`);
      return;
    }

    try {
      if (keychainLocked) {
        navigate(PATHS.UNLOCK, {
          state: { returnTo: PATHS.SELECT, walletId: activeWallet.id },
        });
        return;
      }
      setIsAddingAddress(true);
      await addAddress(activeWallet.id);
      setError(null);
    } catch (err) {
      console.error("Failed to add address:", err);
      setError("Failed to add address. Please try again.");
    } finally {
      setIsAddingAddress(false);
    }
  }, [activeWallet, keychainLocked, addAddress, navigate, isAddingAddress]);

  /**
   * Handles selecting an address and navigating to the index.
   */
  const handleSelectAddress = useCallback(async (address: Address) => {
    try {
      await setActiveAddress(address);
      analytics.track('address_switched');
      navigate(PATHS.INDEX);
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
        activeWallet?.type === "mnemonic" && !isAddingAddress
          ? {
              icon: <FaPlus aria-hidden="true" />,
              onClick: handleAddAddress,
              ariaLabel: "Add Address",
            }
          : undefined,
    });
  }, [setHeaderProps, navigate, activeWallet?.type, handleAddAddress, isAddingAddress]);

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
            activeWallet.addresses.length >= MAX_ADDRESSES_PER_WALLET ||
            keychainLocked ||
            activeWallet.type !== "mnemonic" ||
            isAddingAddress
          }
          aria-label="Add Address"
        >
          <FaPlus className="size-4 mr-2" aria-hidden="true" />
          {isAddingAddress ? "Adding…" : keychainLocked ? "Unlock to Add Address" : "Add Address"}
        </Button>
      </div>
    </div>
  );
}
