import { MenuItem } from '@headlessui/react';
import { type ReactElement, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { reissueActions } from '@/components/domain/asset/reissue-actions';
import { BsThreeDots, FaCoins, FaExchangeAlt, FaLockOpen, FaPen } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { BaseMenu } from '@/components/ui/menus/base-menu';
import { useAssetLatestIssuance } from '@/hooks/useAssetLatestIssuance';

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
    description_locked?: boolean;
  };
}

/**
 * AssetMenu Component
 * 
 * Provides actions for owned assets including issue supply, lock supply,
 * change description, and transfer ownership. Offers only what counterparty-core
 * accepts, by the same rules as the asset page (`reissueActions`). Uses the
 * standardized BaseMenu component.
 * 
 * @param props - The component props
 * @returns A ReactElement representing the asset menu
 */
export function AssetMenu({ ownedAsset }: AssetMenuProps): ReactElement {
  return (
    <BaseMenu
      trigger={<BsThreeDots className="size-4" aria-hidden="true" />}
      ariaLabel={t('asset_asset_menu_asset_actions')}
      className="w-56"
    >
      <AssetMenuItems ownedAsset={ownedAsset} />
    </BaseMenu>
  );
}

/**
 * The items, mounted only while the menu is open, so the latest issuance is read for the one
 * asset being acted on rather than for every row of the owned-asset list.
 */
function AssetMenuItems({ ownedAsset }: AssetMenuProps): ReactElement {
  const navigate = useNavigate();
  // The owned-asset summary carries no `fair_minting`; core reads it off the latest issuance.
  const { data: latestIssuance } = useAssetLatestIssuance(ownedAsset.asset);

  const handleAction = useCallback((path: string) => {
    void navigate(`/compose/${path}/${encodeURIComponent(ownedAsset.asset)}`);
  }, [navigate, ownedAsset.asset]);

  const allowed = reissueActions({
    locked: ownedAsset.locked || latestIssuance?.locked === true,
    descriptionLocked: ownedAsset.description_locked === true || latestIssuance?.description_locked === true,
    fairMinting: latestIssuance?.fair_minting === true,
  });

  if (!allowed.supply && !allowed.description && !allowed.transfer) {
    return (
      <p className="px-4 py-2 text-sm text-gray-500">
        {t('asset_asset_menu_fair_mint_open')}
      </p>
    );
  }

  return (
    <>
      {allowed.supply && (
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
      
      {allowed.description && (
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
      )}
      
      {allowed.transfer && (
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
      )}
    </>
  );
}
