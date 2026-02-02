import { useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaTrash, HiDotsHorizontal, VscKey, FiX } from '@/components/icons';
import { MenuItem } from '@headlessui/react';
import { BaseMenu } from './base-menu';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/contexts/wallet-context';
import type { Wallet } from '@/types/wallet';

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
  const { removeWallet } = useWallet();
  const isHardware = wallet.type === 'hardware';

  const handleShowSecret = useCallback(() => {
    navigate(`/keychain/secrets/show-${wallet.type === 'privateKey' ? 'private-key' : 'passphrase'}/${wallet.id}`);
  }, [navigate, wallet.type, wallet.id]);

  const handleRemoveWallet = useCallback(() => {
    if (!isOnlyWallet) {
      navigate(`/keychain/wallets/remove/${wallet.id}`);
    }
  }, [navigate, wallet.id, isOnlyWallet]);

  const handleDisconnectHardware = useCallback(async () => {
    // Hardware wallets are session-only, just remove from memory
    // The removeWallet function will:
    // 1. Clear activeWalletId if this was the active wallet
    // 2. Call refreshWalletState which auto-selects the first remaining wallet
    await removeWallet(wallet.id);
    navigate('/keychain/wallets', { replace: true });
  }, [removeWallet, wallet.id, navigate]);

  return (
    <BaseMenu
      trigger={<HiDotsHorizontal className="size-4" aria-hidden="true" />}
      ariaLabel="Wallet options"
    >
      {/* Show secret option - only for software wallets */}
      {!isHardware && (
        <MenuItem>
          <Button
            variant="menu-item"
            fullWidth
            onClick={handleShowSecret}
          >
            <VscKey className="mr-3 size-4 text-gray-600" aria-hidden="true" />
            {wallet.type === 'privateKey' ? 'Show Private Key' : 'Show Passphrase'}
          </Button>
        </MenuItem>
      )}

      {/* Remove/Disconnect option */}
      <MenuItem>
        {isHardware ? (
          <Button
            variant="menu-item"
            fullWidth
            onClick={handleDisconnectHardware}
          >
            <FiX className="mr-3 size-4 text-gray-600" aria-hidden="true" />
            Disconnect {wallet.name}
          </Button>
        ) : (
          <Button
            variant="menu-item"
            fullWidth
            onClick={handleRemoveWallet}
            disabled={isOnlyWallet}
            title={isOnlyWallet ? 'Cannot remove only wallet' : undefined}
            className={isOnlyWallet ? 'opacity-50 cursor-not-allowed' : ''}
          >
            <FaTrash className="mr-3 size-4 text-gray-600" aria-hidden="true" />
            Remove {wallet.name}
          </Button>
        )}
      </MenuItem>
    </BaseMenu>
  );
}
