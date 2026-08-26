import { RadioGroup } from '@headlessui/react';
import { type ReactElement, useState } from 'react';
import { FaCheck } from '@/components/icons';
import { AddressMenu } from '@/components/ui/menus/address-menu';
import { formatAddress } from '@/core/format';
import type { Address } from '@/types/wallet';

interface AddressListProps {
  addresses: Address[];
  selectedAddress?: Address | null;
  onSelectAddress: (address: Address) => void;
  walletId: string;
  /** Whether this is a hardware wallet (hides private key option) */
  isHardwareWallet?: boolean;
  /** Offered per address when this wallet could have paired Rare Pepe Wallet UTXO addresses */
  onFindUtxoAddress?: (address: Address) => void;
  /** Offered on a kept UTXO address, to stop listing it */
  onRemoveUtxoAddress?: (address: Address) => void;
}

/**
 * AddressList displays a selectable list of addresses with copy and menu options.
 *
 * @param props - The component props
 * @returns A ReactElement representing the address list
 */
export const AddressList = ({ addresses, selectedAddress, onSelectAddress, walletId, isHardwareWallet = false, onFindUtxoAddress, onRemoveUtxoAddress }: AddressListProps): ReactElement => {
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

  // The radio group ignores a keypress on the option that is already checked, so
  // re-selecting the current address — how these screens confirm and move on — is
  // otherwise unreachable from the keyboard. Handle it here, on the focusable
  // element, and stop the group from acting on the same key twice.
  const handleAddressKeyDown = (e: React.KeyboardEvent, address: Address) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;

    e.preventDefault();
    e.stopPropagation();
    onSelectAddress(address);
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
          onClick={(e: React.MouseEvent) => handleAddressClick(e, address)}
          onKeyDown={(e: React.KeyboardEvent) => handleAddressKeyDown(e, address)}
          className="focus-visible:outline-none"
        >
          {({ checked }) => (
            <div
              className={`
                relative w-full rounded transition-colors duration-300 p-4 cursor-pointer
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
                  isHardwareWallet={isHardwareWallet}
                  onFindUtxoAddress={onFindUtxoAddress}
                  onRemoveUtxoAddress={onRemoveUtxoAddress}
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

