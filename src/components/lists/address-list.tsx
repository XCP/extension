import { useState } from 'react';
import { FaCheck } from 'react-icons/fa';
import { RadioGroup } from '@headlessui/react';
import { formatAddress } from '@/utils/format';
import { AddressMenu } from '@/components/menus/address-menu';
import type { Address } from '@/utils/wallet/walletManager';

interface AddressListProps {
  addresses: Address[];
  selectedAddress?: Address | null;
  onSelectAddress: (address: Address) => void;
  walletId: string;
}

export const AddressList = ({ addresses, selectedAddress, onSelectAddress, walletId }: AddressListProps) => {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleCopyAddress = (address: string) => {
    setCopiedAddress(address);
    navigator.clipboard.writeText(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleAddressClick = (e: React.MouseEvent, address: Address) => {
    // Only select the address if the menu wasn't clicked
    if (!(e.target as HTMLElement).closest('.address-menu')) {
      onSelectAddress(address);
    }
  };

  return (
    <RadioGroup
      // Use the address string as the value
      value={selectedAddress ? selectedAddress.address : ''}
      onChange={(value: string) => {
        // Find the corresponding full address object by its unique address string.
        const selected = addresses.find(addr => addr.address === value);
        if (selected) {
          onSelectAddress(selected);
        }
      }}
      className="space-y-2"
    >
      {addresses.map((address) => (
        <RadioGroup.Option
          key={address.path}
          // Set each option's value to the unique address string
          value={address.address}
          className="focus:outline-none"
        >
          {({ checked }) => (
            <div
              onClick={(e) => handleAddressClick(e, address)}
              className={`
                relative w-full rounded transition duration-300 p-4 cursor-pointer
                ${checked
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-blue-100 hover:bg-blue-200 text-gray-800'}
              `}
            >
              <div className="absolute top-2 right-2 address-menu">
                <AddressMenu
                  address={address}
                  walletId={walletId}
                  onCopyAddress={handleCopyAddress}
                />
              </div>
              <div className="text-sm mb-1 font-medium">{address.name}</div>
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <span className="font-mono text-sm">
                    {formatAddress(address.address)}
                  </span>
                  {copiedAddress === address.address && (
                    <FaCheck className="ml-2 text-green-500" aria-hidden="true" />
                  )}
                </div>
                <span className={`text-xs ${checked ? 'text-blue-200' : 'text-gray-500'}`}>
                  {address.path}
                </span>
              </div>
            </div>
          )}
        </RadioGroup.Option>
      ))}
    </RadioGroup>
  );
};

