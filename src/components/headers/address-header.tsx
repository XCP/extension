import logo from '@/assets/logo.png';
import React, { useEffect } from 'react';
import { useHeader } from '@/contexts/header-context';
import { formatAddress } from '@/utils/format';

/**
 * Props for the AddressHeader component.
 */
interface AddressHeaderProps {
  /** The Bitcoin address to display */
  address: string;
  /** Optional wallet name to display above the address */
  walletName?: string;
  /** Optional CSS classes */
  className?: string;
}

/**
 * AddressHeader Component
 * 
 * Displays a header with an address and optional wallet name, using cached data from HeaderContext.
 * Shows the XCP Wallet logo instead of an asset icon.
 * 
 * @param props - The component props
 * @returns A React element representing the address header
 * 
 * @example
 * ```tsx
 * <AddressHeader 
 *   address="bc1q..."
 *   walletName="Main Wallet"
 *   className="mb-4"
 * />
 * ```
 */
export const AddressHeader = ({ address, walletName, className = '' }: AddressHeaderProps) => {
  const { subheadings, setAddressHeader } = useHeader();
  const cached = subheadings.addresses[address];

  // Update cache if props differ from cached data
  useEffect(() => {
    if (!cached || cached.walletName !== walletName) {
      setAddressHeader(address, walletName);
    }
  }, [address, walletName, cached, setAddressHeader]);

  // Use cached data if available, otherwise fall back to props
  const displayWalletName = walletName ?? cached?.walletName;
  const formattedAddress = cached?.formatted ?? formatAddress(address, true);

  return (
    <div className={`flex items-center ${className}`}>
      <img src={logo} alt="XCP Wallet" className="w-12 h-12 mr-4 rounded-full" />
      <div>
        {displayWalletName && <p className="text-sm text-gray-600">{displayWalletName}</p>}
        <h2 className="text-xl font-bold">{formattedAddress}</h2>
      </div>
    </div>
  );
};