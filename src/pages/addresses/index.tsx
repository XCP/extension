import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { FaCog, FaPlus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { AddressList } from "@/components/ui/lists/address-list";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { isCounterwalletFormat } from "@/core/bitcoin/address";
import { MAX_ADDRESSES_PER_WALLET } from "@/core/wallet/constants";
import { t } from '@/i18n';
import { analytics } from "@/platform/fathom";
import type { Address } from "@/types/wallet";

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
  const location = useLocation();
  const { setHeaderProps } = useHeader();

  // Get return path from state, fallback to index
  const state = location.state as { returnTo?: string } | null;
  const returnTo = state?.returnTo || PATHS.INDEX;
  const {
    activeWallet,
    activeAddress,
    setActiveAddress,
    addAddress,
    addUtxoAddress,
    removeUtxoAddress,
    sweepUtxoAddresses,
    keychainLocked,
  } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isAddingAddress, setIsAddingAddress] = useState(false);

  // Only a Counterwallet mnemonic can have one: the convention is Rare Pepe Wallet's, and no other
  // format's holders can have used it.
  const canHaveUtxoAddresses =
    activeWallet?.type === "mnemonic" && isCounterwalletFormat(activeWallet.addressFormat);

  /**
   * Handles adding a new address to the active wallet.
   */
  const handleAddAddress = useCallback(async () => {
    if (!activeWallet?.id || activeWallet.type !== "mnemonic") return;
    if (isAddingAddress) return; // Prevent spam clicks
    if (activeWallet.addresses.length >= MAX_ADDRESSES_PER_WALLET) {
      setError(t('addresses_maximum_number_of_addresses_reached', [String(MAX_ADDRESSES_PER_WALLET)]));
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
      const added = await addAddress(activeWallet.id);
      setError(null);

      // Adding an address to a restored Counterwallet seed recovers one that may already have
      // been used, so its change address may already hold assets. Checked here, where the address
      // first appears, and never again — a later pass would re-ask about an empty one forever.
      // Contained: the address is already added, so an opportunistic extra must not be able to
      // report it as failed.
      if (canHaveUtxoAddresses) {
        const index = Number(added.path.split("/").at(-1));
        if (Number.isSafeInteger(index) && index >= 0) {
          try {
            const found = await sweepUtxoAddresses(activeWallet.id, [index]);
            if (found.length > 0) {
              setNotice(t('addresses_found_now_listed_below', [String(found[0]?.name)]));
            }
          } catch (sweepError) {
            console.warn("UTXO address lookup failed after adding an address:", sweepError);
          }
        }
      }
    } catch (err) {
      console.error("Failed to add address:", err);
      setError(t('addresses_failed_to_add_address_please'));
    } finally {
      setIsAddingAddress(false);
    }
  }, [activeWallet, keychainLocked, addAddress, navigate, isAddingAddress, canHaveUtxoAddresses, sweepUtxoAddresses]);

  /**
   * Looks for the Rare Pepe Wallet UTXO address paired with one of this wallet's addresses.
   */
  const handleFindUtxoAddress = useCallback(async (address: Address) => {
    if (!activeWallet?.id) return;
    const index = Number(address.path.split("/").at(-1));
    if (!Number.isSafeInteger(index) || index < 0) {
      setError(t('addresses_could_not_read_the_derivation'));
      return;
    }

    setError(null);
    setNotice(null);
    try {
      const found = await addUtxoAddress(activeWallet.id, index);
      setNotice(
        found
          ? t('addresses_found_now_listed_below', [String(found.name)])
          : t('addresses_no_utxo_address_is_in', [String(address.name)])
      );
    } catch (err) {
      console.error("Failed to look up UTXO address:", err);
      setError(err instanceof Error ? err.message : t('addresses_failed_to_look_up_utxo'));
    }
  }, [activeWallet?.id, addUtxoAddress]);

  /**
   * Stops listing a kept UTXO address. The funds are untouched; only the listing forgets it.
   */
  const handleRemoveUtxoAddress = useCallback(async (address: Address) => {
    if (!activeWallet?.id) return;
    setError(null);
    setNotice(null);
    try {
      await removeUtxoAddress(activeWallet.id, address.path);
    } catch (err) {
      console.error("Failed to remove UTXO address:", err);
      setError(err instanceof Error ? err.message : t('addresses_failed_to_remove_utxo_address'));
    }
  }, [activeWallet?.id, removeUtxoAddress]);

  /**
   * Handles selecting an address and navigating back to the source page.
   */
  const handleSelectAddress = useCallback(async (address: Address) => {
    try {
      await setActiveAddress(address);
      analytics.track('address_switched');
      navigate(returnTo, { replace: true });
    } catch (err) {
      console.error("Failed to select address:", err);
      setError(t('addresses_failed_to_select_address_please'));
    }
  }, [setActiveAddress, navigate, returnTo]);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: t('addresses'),
      onBack: () => navigate(returnTo, { replace: true }),
      rightButton:
        activeWallet?.type === "mnemonic"
          ? {
              icon: <FaCog aria-hidden="true" />,
              onClick: () => navigate("/settings/address-types", { state: { returnTo: PATHS.SELECT } }),
              ariaLabel: t('addresses_change_address_type'),
            }
          : undefined,
    });
  }, [setHeaderProps, navigate, returnTo, activeWallet?.type]);

  if (!activeWallet) return <div className="p-4">{t('addresses_no_active_wallet_found')}</div>;

  return (
    <section className="flex flex-col h-full" aria-labelledby="address-selection-title">
      <div className="flex-grow overflow-y-auto p-4">
        {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
        {notice && (
          <ErrorAlert message={notice} severity="info" onClose={() => setNotice(null)} />
        )}
        <h2 id="address-selection-title" className="sr-only">{t('addresses_select_an_address')}</h2>
        <AddressList
          addresses={activeWallet.addresses}
          selectedAddress={activeAddress}
          onSelectAddress={handleSelectAddress}
          walletId={activeWallet.id}
          isHardwareWallet={activeWallet.type === 'hardware'}
          onFindUtxoAddress={canHaveUtxoAddresses ? handleFindUtxoAddress : undefined}
          onRemoveUtxoAddress={canHaveUtxoAddresses ? handleRemoveUtxoAddress : undefined}
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
          aria-label={t('addresses_add_address')}
        >
          <FaPlus className="size-4 mr-2" aria-hidden="true" />
          {isAddingAddress ? t('addresses_adding') : keychainLocked ? t('addresses_unlock_to_add_address') : t('addresses_add_address')}
        </Button>
      </div>
    </section>
  );
}
