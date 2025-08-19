import { useNavigate } from 'react-router-dom';
import { FaTrash } from 'react-icons/fa';
import { HiDotsHorizontal } from 'react-icons/hi';
import { VscKey } from 'react-icons/vsc';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import type { Wallet } from '@/utils/wallet';

interface WalletMenuProps {
  wallet: Wallet;
  isOnlyWallet: boolean;
}

export function WalletMenu({ wallet, isOnlyWallet }: WalletMenuProps) {
  const navigate = useNavigate();

  const handleShowSecret = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    navigate(`/show-${wallet.type === 'privateKey' ? 'private-key' : 'passphrase'}/${wallet.id}`);
  };

  const handleRemoveWallet = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    navigate(`/remove-wallet/${wallet.id}`);
  };

  return (
    <Menu as="div" className="relative inline-block text-left">
      <div onClick={(e) => e.stopPropagation()}>
        <MenuButton
          className="p-1 rounded-full hover:bg-black/5 transition-colors cursor-pointer"
          aria-label="Wallet options"
        >
          <HiDotsHorizontal className="w-4 h-4" aria-hidden="true" />
        </MenuButton>
      </div>

      <MenuItems
        className="absolute right-0 mt-1 w-48 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
        aria-label="Wallet options list"
      >
        <div className="py-1">
          <MenuItem>
            {({ active }) => (
              <button
                className={`${active ? 'bg-gray-100' : ''} group flex w-full items-center px-4 py-2 text-sm text-gray-700 cursor-pointer`}
                onClick={handleShowSecret}
              >
                <VscKey className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
                {wallet.type === 'privateKey' ? 'Show Private Key' : 'Show Passphrase'}
              </button>
            )}
          </MenuItem>
          <MenuItem>
            {({ active }) => (
              <button
                className={`${active ? 'bg-gray-100' : ''} group flex w-full items-center px-4 py-2 text-sm ${
                  isOnlyWallet ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 cursor-pointer'
                }`}
                onClick={handleRemoveWallet}
                disabled={isOnlyWallet}
                title={isOnlyWallet ? 'Cannot remove only wallet' : undefined}
              >
                <FaTrash className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
                Remove {wallet.name}
              </button>
            )}
          </MenuItem>
        </div>
      </MenuItems>
    </Menu>
  );
}
