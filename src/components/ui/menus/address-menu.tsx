import { MenuItem } from '@headlessui/react';
import { type ReactElement, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { FaCopy, GiBroom, HiDotsHorizontal, LuArrowDownUp, VscKey } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { BaseMenu } from '@/components/ui/menus/base-menu';
import { isUtxoAddressPath } from '@/core/wallet/rarePepeWalletDiscovery';
import type { Address } from '@/types/wallet';

/**
 * Props for the AddressMenu component
 */
interface AddressMenuProps {
  /** The address object containing address details */
  address: Address;
  /** The wallet ID that owns this address */
  walletId: string;
  /** Callback when copy address is clicked */
  onCopyAddress: (address: string) => void;
  /** Whether this address belongs to a hardware wallet */
  isHardwareWallet?: boolean;
  /**
   * Offered when this wallet could have a Rare Pepe Wallet UTXO address paired with this one.
   *
   * The lookup costs an API call and almost always comes back empty, so it is asked for rather
   * than run for everyone — the people who attached assets to UTXOs know they did.
   */
  onFindUtxoAddress?: (address: Address) => void;
  /** Offered on a kept UTXO address, to stop listing it. */
  onRemoveUtxoAddress?: (address: Address) => void;
}

/**
 * AddressMenu Component
 * 
 * Provides actions for wallet addresses including copy, sweep, and show private key.
 * Uses the standardized BaseMenu component for consistent styling.
 * 
 * @param props - The component props
 * @returns A ReactElement representing the address menu
 */
export function AddressMenu({
  address,
  walletId,
  onCopyAddress,
  isHardwareWallet = false,
  onFindUtxoAddress,
  onRemoveUtxoAddress,
}: AddressMenuProps): ReactElement {
  const navigate = useNavigate();

  const handleCopyAddress = useCallback(() => {
    onCopyAddress(address.address);
  }, [address.address, onCopyAddress]);

  const handleSweepAddress = useCallback(() => {
    navigate(`/compose/sweep/${encodeURIComponent(address.address)}`);
  }, [address.address, navigate]);

  const handleShowPrivateKey = useCallback(() => {
    navigate(`/keychain/secrets/show-private-key/${walletId}/${encodeURIComponent(address.path)}`);
  }, [address.path, walletId, navigate]);

  return (
    <BaseMenu
      trigger={<HiDotsHorizontal className="size-4" aria-hidden="true" />}
      ariaLabel="Address actions"
    >
      <MenuItem>
        <Button 
          variant="menu-item" 
          fullWidth 
          onClick={handleCopyAddress}
        >
          <FaCopy className="mr-3 size-4 text-gray-600" aria-hidden="true" />
          Copy Address
        </Button>
      </MenuItem>
      
      <MenuItem>
        <Button 
          variant="menu-item" 
          fullWidth 
          onClick={handleSweepAddress}
        >
          <GiBroom className="mr-3 size-4 text-gray-600" aria-hidden="true" />
          Sweep Address
        </Button>
      </MenuItem>
      
      {isUtxoAddressPath(address.path)
        ? onRemoveUtxoAddress && (
            <MenuItem>
              <Button
                variant="menu-item"
                fullWidth
                onClick={() => onRemoveUtxoAddress(address)}
              >
                <LuArrowDownUp className="mr-3 size-4 text-gray-600" aria-hidden="true" />
                Remove UTXO Address
              </Button>
            </MenuItem>
          )
        : onFindUtxoAddress && (
            <MenuItem>
              <Button
                variant="menu-item"
                fullWidth
                onClick={() => onFindUtxoAddress(address)}
              >
                <LuArrowDownUp className="mr-3 size-4 text-gray-600" aria-hidden="true" />
                Find UTXO Address
              </Button>
            </MenuItem>
          )}

      {/* Hide private key option for hardware wallets - keys never leave device */}
      {!isHardwareWallet && (
        <MenuItem>
          <Button
            variant="menu-item"
            fullWidth
            onClick={handleShowPrivateKey}
          >
            <VscKey className="mr-3 size-4 text-gray-600" aria-hidden="true" />
            Show Private Key
          </Button>
        </MenuItem>
      )}
    </BaseMenu>
  );
} 