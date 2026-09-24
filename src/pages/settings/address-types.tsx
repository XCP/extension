import { RadioGroup } from "@headlessui/react";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { localizedAddressFormatLabel } from '@/components/domain/address/address-format-label';
import { SelectionCard, SelectionCardGroup } from "@/components/ui/cards/selection-card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import type { AddressFormat } from '@/core/bitcoin/address';
import { formatAddress } from "@/core/format";
import { isAddressFormatLocked } from '@/core/wallet/addressFormatChoices';
import { useAddressFormatSwitch } from "@/hooks/useAddressFormatSwitch";

import { t } from '@/i18n';

/**
 * Constants for navigation paths and address type options.
 */
const PATHS = {
  BACK: "/settings",
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
export default function AddressTypesPage(): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { setHeaderProps } = useHeader();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const { activeWallet } = useWallet();
  const {
    formats,
    previews,
    isLoadingPreviews,
    selectedFormat,
    error,
    clearError,
    switchFormat,
  } = useAddressFormatSwitch();
  const originalAddressFormat = useRef<AddressFormat | null>(null);
  const hasChangedType = useRef(false);

  // Configure header with dynamic back navigation.
  useEffect(() => {
    const handleBack = () => {
      // Return to the page that linked here (e.g. the address list)
      if (returnTo) {
        navigate(returnTo);
      } else if (hasChangedType.current) {
        // If address type was changed, go to index
        navigate("/index");
      } else {
        // Otherwise go back to settings
        navigate(PATHS.BACK);
      }
    };

    setHeaderProps({
      title: t('common_address_type'),
      onBack: handleBack,
      rightButton: undefined,
    });
  }, [setHeaderProps, navigate, returnTo]);


  // Remember the address type the page opened with, so Back knows whether it changed.
  useEffect(() => {
    if (activeWallet && originalAddressFormat.current === null) {
      originalAddressFormat.current = activeWallet.addressFormat;
    }
  }, [activeWallet]);

  /**
   * Updates the wallet's address type through the shared switching path.
   * @param newType - The new address type to set.
   */
  const handleAddressFormatChange = async (newType: AddressFormat | null) => {
    if (await switchFormat(newType)) {
      hasChangedType.current = newType !== originalAddressFormat.current;
    }
  };

  if (isLoadingPreviews) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  if (!activeWallet) {
    return <div className="p-4 text-center text-gray-500">{t('settings_address_types_no_wallet_available')}</div>;
  }

  // Hardware wallets cannot change address type - they need to be reconnected with a different format
  const isHardwareWallet = isAddressFormatLocked(activeWallet);

  return (
    <section className="space-y-2 p-4" aria-labelledby="address-type-settings-title">
      <h2 id="address-type-settings-title" className="sr-only">
        {t('settings_address_types_address_type_settings')}
      </h2>
      {error && <ErrorAlert message={error} onClose={clearError} />}
      {isHardwareWallet && (
        <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4 mb-4">
          <p className="text-sm text-blue-200">
            <strong>{t('settings_address_types_hardware_wallet')}</strong>{t('settings_address_types_address_type_is_set_when')}
          </p>
        </div>
      )}
      <RadioGroup
        value={selectedFormat}
        onChange={handleAddressFormatChange}
        className="space-y-2"
        disabled={isHardwareWallet}
      >
        <SelectionCardGroup>
          {formats.map((type) => {
            const typeLabel = localizedAddressFormatLabel(type);
            // Use loaded address preview
            const address = previews[type] || "";
            const addressPreview = address ? formatAddress(address) : "";

            return (
              <SelectionCard
                key={type}
                value={type}
                title={typeLabel}
                description={addressPreview}
              />
            );
          })}
        </SelectionCardGroup>
      </RadioGroup>
    </section>
  );
}
