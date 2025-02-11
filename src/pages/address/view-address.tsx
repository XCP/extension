import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheck, FaClipboard, FaList } from 'react-icons/fa';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import { AddressType } from '@/utils/blockchain/bitcoin/address';
import { Button } from '@/components/button';
import { QRCode } from '@/components/qr-code';

/**
 * ViewAddress page component displays the current address's QR code and provides options
 * to copy the address or select a different address.
 *
 * Features:
 * - Displays the QR code for the current address
 * - Allows users to copy the address to the clipboard
 * - Navigates to the address selection screen
 */
const ViewAddress = () => {
  const navigate = useNavigate();
  const { activeWallet, activeAddress } = useWallet();
  const { setHeaderProps } = useHeader();

  // Set the header
  useEffect(() => {
    setHeaderProps({
      title: 'My Address',
      onBack: () => navigate('/index'),
      rightButton:
        activeWallet?.type === 'mnemonic'
          ? {
              icon: <FaList aria-hidden="true" />,
              onClick: () => navigate('/select-address', { state: { returnTo: '/view-address' } }),
              ariaLabel: 'Select Address',
            }
          : undefined,
    });
  }, [setHeaderProps, navigate, activeWallet?.type]);

  // No Address State
  if (!activeAddress) {
    return <div className="p-4">No address selected</div>;
  }

  const addressTypeLabel = activeWallet?.addressType !== AddressType.Counterwallet
    ? activeWallet?.addressType.toUpperCase()
    : 'P2PKH'; // Default to 'P2PKH' if Counterwallet

  return (
    <div
      className="flex flex-col items-center p-4 space-y-4"
      role="main"
      aria-labelledby="view-address-title"
    >
      <div
        className="text-center font-medium text-gray-600"
        id="view-address-title"
      >
        {`${activeAddress?.name ?? ''} ${addressTypeLabel || ''}`}
      </div>

      <QRCode
        text={activeAddress.address}
        ariaLabel="Address QR Code"
      />

      <CopyAddress address={activeAddress.address} />
    </div>
  );
};

interface CopyAddressProps {
  address: string;
}

/**
 * CopyAddress component provides UI elements to display and copy a cryptocurrency address.
 * 
 * Features:
 * - Displays the address in a selectable, monospace font
 * - Provides a dedicated copy button
 * - Shows visual feedback when address is copied
 * - Supports both click and keyboard interactions
 */
const CopyAddress = ({ address }: CopyAddressProps) => {
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedToClipboard(true);
      
      // Reset copy state after 2 seconds
      setTimeout(() => {
        setCopiedToClipboard(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
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
};

export default ViewAddress;
