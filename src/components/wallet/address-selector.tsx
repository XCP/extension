import React from 'react';
import { Address } from '@/utils/wallet';
import { formatAddress } from '@/utils/format';
import { Button } from '@/components/button';

interface AddressSelectorProps {
  addresses: Address[];
  selectedAddress: Address | null;
  onSelectAddress: (address: Address) => void;
  onAddAddress: () => void;
}

export const AddressSelector: React.FC<AddressSelectorProps> = ({
  addresses,
  selectedAddress,
  onSelectAddress,
  onAddAddress,
}) => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">Select an Address</h3>
      <div className="space-y-2">
        {addresses.map((addr) => (
          <div
            key={addr.address}
            className={`p-3 rounded-lg cursor-pointer border ${
              selectedAddress?.address === addr.address
                ? 'bg-blue-600 text-white'
                : 'bg-white hover:bg-gray-100'
            }`}
            onClick={() => onSelectAddress(addr)}
          >
            <div className="text-sm font-medium">{addr.name}</div>
            <div className="text-xs font-mono">{formatAddress(addr.address, false)}</div>
          </div>
        ))}
      </div>
      <Button onClick={onAddAddress} color="blue" fullWidth>
        Add Address
      </Button>
    </div>
  );
};

export default AddressSelector;
