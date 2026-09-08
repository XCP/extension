import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { FaCheck, FaClipboard, FaList } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { QRCode } from "@/components/ui/qr-code";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressFormat } from '@/core/bitcoin/address';

import { t } from '@/i18n';

/**
 * Constants for navigation paths.
 */
const PATHS = {
  BACK: "/index",
  SELECT_ADDRESS: "/addresses",
} as const;

/**
 * ViewAddress component displays the QR code and details of the active address.
 *
 * Features:
 * - Shows QR code for the active address
 * - Allows copying the address to the clipboard
 * - Provides navigation to select a different address (mnemonic wallets only)
 *
 * @returns {ReactElement} The rendered address view UI.
 */
export default function AddressDetailsPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet, activeAddress } = useWallet();

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: t('addresses_details_my_address'),
      onBack: () => navigate(PATHS.BACK),
      rightButton:
        activeWallet?.type === "mnemonic"
          ? {
              icon: <FaList className="size-4" aria-hidden="true" />,
              onClick: () =>
                navigate(PATHS.SELECT_ADDRESS, { state: { returnTo: "/addresses/details" } }),
              ariaLabel: t('addresses_details_select_address'),
            }
          : undefined,
    });
  }, [setHeaderProps, navigate, activeWallet?.type]);

  if (!activeAddress) return <div className="p-4">{t('common_no_address_selected')}</div>;

  const addressTypeLabel = (() => {
    const format = activeWallet?.addressFormat;
    if (!format) return "";
    switch (format) {
      case AddressFormat.Counterwallet:
      case AddressFormat.FreewalletBIP39:
      case AddressFormat.P2PKH:
        return "P2PKH";
      case AddressFormat.CounterwalletSegwit:
      case AddressFormat.FreewalletBIP39Segwit:
      case AddressFormat.P2WPKH:
        return "P2WPKH";
      default:
        return format.toUpperCase();
    }
  })();

  return (
    <section
      className="flex flex-col items-center p-4 space-y-4"
      aria-labelledby="view-address-title"
    >
      <div id="view-address-title" className="text-center font-medium text-gray-600">
        {`${activeAddress?.name ?? ""} | ${addressTypeLabel || ""}`}
      </div>
      <QRCode text={activeAddress?.address} ariaLabel={t('addresses_details_address_qr_code')} />
      <CopyAddress address={activeAddress?.address} />
    </section>
  );
}

/**
 * Props for the CopyAddress component.
 */
interface CopyAddressProps {
  address: string;
}

/**
 * CopyAddress component provides UI to display and copy a cryptocurrency address.
 *
 * Features:
 * - Displays the address in a selectable, monospace font
 * - Offers a copy button with visual feedback
 * - Supports click and keyboard interactions
 *
 * @param props - Component props.
 * @returns {ReactElement} The rendered copy address UI.
 */
function CopyAddress({ address }: CopyAddressProps): ReactElement {
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  /**
   * Copies the address to the clipboard and provides feedback.
   */
  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  return (
    <>
      <div className="w-full text-center">
        <button type="button"
          onClick={handleCopyAddress}
          // Distinct from the button below, which copies the same thing: two
          // controls sharing one accessible name is ambiguous to announce.
          aria-label={t('addresses_details_copy_the_address_shown_here')}
          className="block w-full font-mono text-sm bg-white border border-gray-200 rounded-lg p-4 break-all text-gray-800 select-all cursor-pointer hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors duration-200"
        >
          {address}
        </button>
      </div>
      <Button
        onClick={handleCopyAddress}
        color="blue"
        fullWidth
        className="max-w-sm"
        aria-label={t('common_copy_address')}
      >
        {copiedToClipboard ? (
          <>
            <FaCheck className="size-4 mr-2" aria-hidden="true" />
            <span>{t('common_copied')}</span>
          </>
        ) : (
          <>
            <FaClipboard className="size-4 mr-2" aria-hidden="true" />
            <span>{t('common_copy_address_2')}</span>
          </>
        )}
      </Button>
    </>
  );
}
