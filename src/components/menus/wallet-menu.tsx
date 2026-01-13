import { useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaTrash, HiDotsHorizontal, VscKey, FiX } from '@/components/icons';
import { MenuItem } from '@headlessui/react';
import { BaseMenu } from './base-menu';
import { Button } from '@/components/button';
import { useWallet } from '@/contexts/wallet-context';
import type { Wallet } from '@/utils/wallet/walletManager';

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
  const { wallets, activeWallet, setActiveWallet, removeWallet } = useWallet();
  const isHardware = wallet.type === 'hardware';

  const handleShowSecret = useCallback(() => {
    navigate(`/show-${wallet.type === 'privateKey' ? 'private-key' : 'passphrase'}/${wallet.id}`);
  }, [navigate, wallet.type, wallet.id]);

  const handleShowXpub = useCallback(() => {
    navigate(`/show-xpub/${wallet.id}`);
  }, [navigate, wallet.id]);

  const handleRemoveWallet = useCallback(() => {
    if (!isOnlyWallet) {
      navigate(`/remove-wallet/${wallet.id}`);
    }
  }, [navigate, wallet.id, isOnlyWallet]);

  const handleDisconnectHardware = useCallback(async () => {
    // Hardware wallets are session-only, just remove from memory
    // Match the behavior of remove-wallet: switch active wallet if needed
    const remainingWallets = wallets.filter((w) => w.id !== wallet.id);
    if (activeWallet?.id === wallet.id) {
      await setActiveWallet(remainingWallets.length > 0 ? remainingWallets[0] : null);
    }
    await removeWallet(wallet.id);
    navigate('/select-wallet', { replace: true });
  }, [wallets, activeWallet, setActiveWallet, removeWallet, wallet.id, navigate]);

  return (
    <BaseMenu
      trigger={<HiDotsHorizontal className="w-4 h-4" aria-hidden="true" />}
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
            <VscKey className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
            {wallet.type === 'privateKey' ? 'Show Private Key' : 'Show Passphrase'}
          </Button>
        </MenuItem>
      )}

      {/* Show xPub option - only for hardware wallets */}
      {isHardware && (
        <MenuItem>
          <Button
            variant="menu-item"
            fullWidth
            onClick={handleShowXpub}
          >
            <VscKey className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
            Show xPub
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
            <FiX className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
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
            <FaTrash className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
            Remove {wallet.name}
          </Button>
        )}
      </MenuItem>
    </BaseMenu>
  );
}
