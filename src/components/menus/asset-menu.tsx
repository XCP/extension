import React, { useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsThreeDots } from 'react-icons/bs';
import { FaCoins, FaLockOpen, FaPen, FaExchangeAlt } from 'react-icons/fa';
import { MenuItem } from '@headlessui/react';
import { BaseMenu } from './base-menu';
import { Button } from '@/components/button';

/**
 * Props for the AssetMenu component
 */
interface AssetMenuProps {
  /** The owned asset object containing asset details */
  ownedAsset: {
    asset: string;
    asset_longname: string | null;
    supply_normalized: string;
    description: string;
    locked: boolean;
  };
}

/**
 * AssetMenu Component
 * 
 * Provides actions for owned assets including issue supply, lock supply,
 * change description, and transfer ownership. Conditionally shows actions
 * based on asset lock status. Uses the standardized BaseMenu component.
 * 
 * @param props - The component props
 * @returns A ReactElement representing the asset menu
 */
export function AssetMenu({ ownedAsset }: AssetMenuProps): ReactElement {
  const navigate = useNavigate();

  const handleAction = useCallback((path: string) => {
    navigate(`/compose/${path}/${encodeURIComponent(ownedAsset.asset)}`);
  }, [navigate, ownedAsset.asset]);

  return (
    <BaseMenu
      trigger={<BsThreeDots className="w-4 h-4" aria-hidden="true" />}
      ariaLabel="Asset actions"
      className="w-56"
    >
      {!ownedAsset.locked && (
        <>
          <MenuItem>
            <Button 
              variant="menu-item" 
              fullWidth 
              onClick={() => handleAction('issuance/issue-supply')}
            >
              <FaCoins className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
              Issue Supply
            </Button>
          </MenuItem>
          
          <MenuItem>
            <Button 
              variant="menu-item" 
              fullWidth 
              onClick={() => handleAction('issuance/lock-supply')}
            >
              <FaLockOpen className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
              Lock Supply
            </Button>
          </MenuItem>
        </>
      )}
      
      <MenuItem>
        <Button 
          variant="menu-item" 
          fullWidth 
          onClick={() => handleAction('issuance/update-description')}
        >
          <FaPen className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
          Change Description
        </Button>
      </MenuItem>
      
      <MenuItem>
        <Button 
          variant="menu-item" 
          fullWidth 
          onClick={() => handleAction('issuance/transfer-ownership')}
        >
          <FaExchangeAlt className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
          Transfer Ownership
        </Button>
      </MenuItem>
    </BaseMenu>
  );
}
