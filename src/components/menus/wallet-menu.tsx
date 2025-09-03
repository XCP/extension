import React, { useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaTrash } from 'react-icons/fa';
import { HiDotsHorizontal } from 'react-icons/hi';
import { VscKey } from 'react-icons/vsc';
import { MenuItem } from '@headlessui/react';
import { BaseMenu } from './base-menu';
import { Button } from '@/components/button';
import type { Wallet } from '@/utils/wallet';

/**
 * Props for the WalletMenu component
 */
interface WalletMenuProps {
  /** The wallet object containing wallet details */
  wallet: Wallet;
  /** Whether this is the only wallet (cannot be removed) */
  isOnlyWallet: boolean;
}

/**
 * WalletMenu Component
 * 
 * Provides actions for wallet management including showing secrets and removing wallets.
 * Prevents removal if it's the only wallet. Uses the standardized BaseMenu component.
 * 
 * @param props - The component props
 * @returns A ReactElement representing the wallet menu
 */
export function WalletMenu({ wallet, isOnlyWallet }: WalletMenuProps): ReactElement {
  const navigate = useNavigate();

  const handleShowSecret = useCallback(() => {
    navigate(`/show-${wallet.type === 'privateKey' ? 'private-key' : 'passphrase'}/${wallet.id}`);
  }, [navigate, wallet.type, wallet.id]);

  const handleRemoveWallet = useCallback(() => {
    if (!isOnlyWallet) {
      navigate(`/remove-wallet/${wallet.id}`);
    }
  }, [navigate, wallet.id, isOnlyWallet]);

  return (
    <BaseMenu
      trigger={<HiDotsHorizontal className="w-4 h-4" aria-hidden="true" />}
      ariaLabel="Wallet options"
    >
      <MenuItem>
        <Button 
          variant="menu-item" 
          fullWidth 
          onClick={handleShowSecret}
        >
          <VscKey className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
          {wallet.type === 'privateKey' ? 'Show Private Key' : 'Show Passphrase'}
        </Button>
      </MenuItem>
      
      <MenuItem>
        <Button 
          variant="menu-item" 
          fullWidth 
          onClick={handleRemoveWallet}
          disabled={isOnlyWallet}
          title={isOnlyWallet ? 'Cannot remove only wallet' : undefined}
          className={isOnlyWallet ? 'opacity-50 cursor-not-allowed' : ''}
        >
          <FaTrash className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
          Remove {wallet.name}
        </Button>
      </MenuItem>
    </BaseMenu>
  );
}
