import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaTrash } from 'react-icons/fa';
import { HiDotsHorizontal } from 'react-icons/hi';
import { VscKey } from 'react-icons/vsc';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import type { Wallet } from '@/utils/wallet';

interface WalletMenuProps {
  wallet: Wallet;
  isFirstWallet: boolean;
}

export const WalletMenu: React.FC<WalletMenuProps> = ({ wallet, isFirstWallet }) => {
  const navigate = useNavigate();

  const handleShowSecret = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      e.stopPropagation();
      navigate(
        `/show-${
          wallet.type === 'privateKey' ? 'private-key' : 'passphrase'
        }/${wallet.id}`
      );
    },
    [wallet.type, wallet.id, navigate]
  );

  const handleRemoveWallet = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      e.stopPropagation();
      navigate(`/remove-wallet/${wallet.id}`);
    },
    [wallet.id, navigate]
  );

  return (
    <Menu as="div" className="relative inline-block text-left">
      <div onClick={(e) => e.stopPropagation()}>
        <MenuButton
          className="p-1 rounded-full hover:bg-black/5 transition-colors"
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
                className={`${
                  active ? 'bg-gray-100' : ''
                } group flex w-full items-center px-4 py-2 text-sm text-gray-700`}
                onClick={handleShowSecret}
              >
                <VscKey className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
                {wallet.type === 'privateKey'
                  ? 'Show Private Key'
                  : 'Show Passphrase'}
              </button>
            )}
          </MenuItem>
          <MenuItem>
            {({ active }) => (
              <button
                className={`${
                  active ? 'bg-gray-100' : ''
                } group flex w-full items-center px-4 py-2 text-sm ${
                  isFirstWallet ? 'text-gray-400' : 'text-gray-700'
                }`}
                onClick={handleRemoveWallet}
                disabled={isFirstWallet}
              >
                <FaTrash className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
                {wallet.type === 'privateKey' 
                  ? 'Remove Address'
                  : `Remove ${wallet.name}`}
              </button>
            )}
          </MenuItem>
        </div>
      </MenuItems>
    </Menu>
  );
};
