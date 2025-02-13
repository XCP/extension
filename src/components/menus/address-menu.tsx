import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCopy } from 'react-icons/fa';
import { GiBroom } from 'react-icons/gi';
import { VscKey } from 'react-icons/vsc';
import { HiDotsHorizontal } from 'react-icons/hi';
import { Menu } from '@headlessui/react';
import type { Address } from '@/utils/wallet';

interface AddressMenuProps {
  address: Address;
  walletId: string;
  onCopyAddress: (address: string) => void;
}

export const AddressMenu = ({ address, walletId, onCopyAddress }: AddressMenuProps) => {
  const navigate = useNavigate();

  const handleCopyAddress = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onCopyAddress(address.address);
    },
    [address.address, onCopyAddress]
  );

  const handleSweepAddress = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      navigate(`/compose/sweep/${encodeURIComponent(address.address)}`);
    },
    [address, navigate]
  );

  const handleShowPrivateKey = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      navigate(`/show-private-key/${walletId}/${encodeURIComponent(address.path)}`);
    },
    [address, walletId, navigate]
  );  

  return (
    <Menu as="div" className="relative">
      <Menu.Button className="p-1 bg-transparent cursor-pointer">
        <HiDotsHorizontal className="w-4 h-4" aria-hidden="true" />
      </Menu.Button>
      <Menu.Items className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg focus:outline-none z-10">
        <Menu.Item>
          {({ active }) => (
            <button
              className={`group flex w-full items-center px-4 py-2 text-sm text-gray-800 ${
                active ? 'bg-gray-100' : ''
              } focus:outline-none cursor-pointer`}
              onClick={handleCopyAddress}
            >
              <FaCopy className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
              Copy Address
            </button>
          )}
        </Menu.Item>
        <Menu.Item>
          {({ active }) => (
            <button
              className={`group flex w-full items-center px-4 py-2 text-sm text-gray-800 ${
                active ? 'bg-gray-100' : ''
              } focus:outline-none cursor-pointer`}
              onClick={handleSweepAddress}
            >
              <GiBroom className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
              Sweep Address
            </button>
          )}
        </Menu.Item>
        <Menu.Item>
          {({ active }) => (
            <button
              className={`group flex w-full items-center px-4 py-2 text-sm text-gray-800 ${
                active ? 'bg-gray-100' : ''
              } focus:outline-none cursor-pointer`}
              onClick={handleShowPrivateKey}
            >
              <VscKey className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
              Show Private Key
            </button>
          )}
        </Menu.Item>
      </Menu.Items>
    </Menu>
  );
}; 