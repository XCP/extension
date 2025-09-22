import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaCheck, FaClipboard, FaList } from "react-icons/fa";
import { Button } from "@/components/button";
import { QRCode } from "@/components/qr-code";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import type { ReactElement } from "react";

/**
 * Constants for navigation paths.
 */
const CONSTANTS = {
  PATHS: {
    BACK: "/index",
    SELECT_ADDRESS: "/select-address",
  } as const,
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
export default function ViewAddress(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet, activeAddress } = useWallet();

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "My Address",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
      rightButton:
        activeWallet?.type === "mnemonic"
          ? {
              icon: <FaList aria-hidden="true" />,
              onClick: () =>
                navigate(CONSTANTS.PATHS.SELECT_ADDRESS, { state: { returnTo: "/view-address" } }),
              ariaLabel: "Select Address",
            }
          : undefined,
    });
  }, [setHeaderProps, navigate, activeWallet?.type]);

  if (!activeAddress) return <div className="p-4">No address selected</div>;

  const addressTypeLabel =
    activeWallet?.addressFormat && activeWallet.addressFormat !== AddressFormat.Counterwallet
      ? activeWallet.addressFormat.toUpperCase()
      : "P2PKH";

  return (
    <div
      className="flex flex-col items-center p-4 space-y-4"
      role="main"
      aria-labelledby="view-address-title"
    >
      <div id="view-address-title" className="text-center font-medium text-gray-600">
        {`${activeAddress?.name ?? ""} | ${addressTypeLabel || ""}`}
      </div>
      <QRCode text={activeAddress?.address} ariaLabel="Address QR Code" />
      <CopyAddress address={activeAddress?.address} />
    </div>
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

  /**
   * Handles keyboard events for copying the address.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCopyAddress();
    }
  };

  return (
    <>
      <div className="w-full text-center">
        <div
          onClick={handleCopyAddress}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          aria-label="Copy address"
          className="font-mono text-sm bg-white border border-gray-200 rounded-lg p-4 break-all text-gray-800 select-all cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
        >
          {address}
        </div>
      </div>
      <Button
        onClick={handleCopyAddress}
        color="blue"
        fullWidth
        className="max-w-sm"
        aria-label="Copy address"
      >
        {copiedToClipboard ? (
          <>
            <FaCheck className="w-4 h-4 mr-2" aria-hidden="true" />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <FaClipboard className="w-4 h-4 mr-2" aria-hidden="true" />
            <span>Copy Address</span>
          </>
        )}
      </Button>
    </>
  );
}
