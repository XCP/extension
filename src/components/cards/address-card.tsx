import { RadioGroup } from '@headlessui/react';
import type { Address } from '@/utils/wallet/walletManager';
import { formatAddress } from '@/utils/format';

interface AddressCardProps {
  address: Address;
  selected: boolean;
  onSelect: (address: Address) => void;
}

export function AddressCard({ address, selected, onSelect }: AddressCardProps) {
  return (
    <RadioGroup.Option
      value={address}
      className={({ active }) =>
        `${
          selected ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-100'
        } relative flex cursor-pointer rounded-lg px-4 py-3 border border-gray-300 focus:outline-none ${
          active ? 'ring-2 ring-blue-500 ring-opacity-60' : ''
        }`
      }
    >
      {() => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{address.name}</span>
          <span className="text-xs font-mono">
            {formatAddress(address.address, false)}
          </span>
        </div>
      )}
    </RadioGroup.Option>
  );
}

 