import { MenuItem } from '@headlessui/react';
import { type ReactElement, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { BsThreeDots, FaCoins, FaExchangeAlt, FaLockOpen, FaPen } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { BaseMenu } from '@/components/ui/menus/base-menu';

import { t } from '@/i18n';

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
      trigger={<BsThreeDots className="size-4" aria-hidden="true" />}
      ariaLabel={t('asset_asset_menu_asset_actions')}
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
              <FaCoins className="mr-3 size-4 text-gray-600" aria-hidden="true" />
              
              {t('common_issue_supply')}
            </Button>
          </MenuItem>
          
          <MenuItem>
            <Button 
              variant="menu-item" 
              fullWidth 
              onClick={() => handleAction('issuance/lock-supply')}
            >
              <FaLockOpen className="mr-3 size-4 text-gray-600" aria-hidden="true" />
              
              {t('common_lock_supply')}
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
          <FaPen className="mr-3 size-4 text-gray-600" aria-hidden="true" />
          
          {t('asset_asset_menu_change_description')}
        </Button>
      </MenuItem>
      
      <MenuItem>
        <Button 
          variant="menu-item" 
          fullWidth 
          onClick={() => handleAction('issuance/transfer-ownership')}
        >
          <FaExchangeAlt className="mr-3 size-4 text-gray-600" aria-hidden="true" />
          
          {t('common_transfer_ownership')}
        </Button>
      </MenuItem>
    </BaseMenu>
  );
}
