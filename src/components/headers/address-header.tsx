import logo from '@/assets/logo.png';
import React, { useEffect } from 'react';
import { useHeader } from '@/contexts/header-context';
import { formatAddress } from '@/utils/format';

/**
 * Props for the AddressHeader component.
 */
interface AddressHeaderProps {
  address: string;
  walletName?: string;
  className?: string;
}

/**
 * Displays a header with an address and optional wallet name, using cached data from HeaderContext.
 * @param props AddressHeaderProps
 * @returns JSX.Element
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
      <img src={logo} alt="Logo" className="w-12 h-12 mr-4 rounded-full" />
      <div>
        {displayWalletName && <p className="text-sm text-gray-600">{displayWalletName}</p>}
        <h2 className="text-xl font-bold">{formattedAddress}</h2>
      </div>
    </div>
  );
};
