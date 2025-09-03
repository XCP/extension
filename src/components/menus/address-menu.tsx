import React, { useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCopy } from 'react-icons/fa';
import { GiBroom } from 'react-icons/gi';
import { VscKey } from 'react-icons/vsc';
import { HiDotsHorizontal } from 'react-icons/hi';
import { MenuItem } from '@headlessui/react';
import { BaseMenu } from './base-menu';
import { Button } from '@/components/button';
import type { Address } from '@/utils/wallet';

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
  onCopyAddress 
}: AddressMenuProps): ReactElement {
  const navigate = useNavigate();

  const handleCopyAddress = useCallback(() => {
    onCopyAddress(address.address);
  }, [address.address, onCopyAddress]);

  const handleSweepAddress = useCallback(() => {
    navigate(`/compose/sweep/${encodeURIComponent(address.address)}`);
  }, [address.address, navigate]);

  const handleShowPrivateKey = useCallback(() => {
    navigate(`/show-private-key/${walletId}/${encodeURIComponent(address.path)}`);
  }, [address.path, walletId, navigate]);

  return (
    <BaseMenu
      trigger={<HiDotsHorizontal className="w-4 h-4" aria-hidden="true" />}
      ariaLabel="Address actions"
    >
      <MenuItem>
        <Button 
          variant="menu-item" 
          fullWidth 
          onClick={handleCopyAddress}
        >
          <FaCopy className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
          Copy Address
        </Button>
      </MenuItem>
      
      <MenuItem>
        <Button 
          variant="menu-item" 
          fullWidth 
          onClick={handleSweepAddress}
        >
          <GiBroom className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
          Sweep Address
        </Button>
      </MenuItem>
      
      <MenuItem>
        <Button 
          variant="menu-item" 
          fullWidth 
          onClick={handleShowPrivateKey}
        >
          <VscKey className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
          Show Private Key
        </Button>
      </MenuItem>
    </BaseMenu>
  );
} 