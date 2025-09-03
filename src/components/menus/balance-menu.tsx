import React, { useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsThreeDots } from 'react-icons/bs';
import { FaTools } from 'react-icons/fa';
import { MenuItem } from '@headlessui/react';
import { BaseMenu } from './base-menu';
import { Button } from '@/components/button';

/**
 * Props for the BalanceMenu component
 */
interface BalanceMenuProps {
  /** The asset symbol for the balance */
  asset: string;
}

/**
 * BalanceMenu Component
 * 
 * Provides actions for token balances. Currently simplified with a single "More" action
 * that navigates to the balance detail page. Uses the standardized BaseMenu component.
 * 
 * @param props - The component props
 * @returns A ReactElement representing the balance menu
 */
export function BalanceMenu({ asset }: BalanceMenuProps): ReactElement {
  const navigate = useNavigate();

  const handleMore = useCallback(() => {
    navigate(`/balance/${encodeURIComponent(asset)}`);
  }, [asset, navigate]);

  return (
    <BaseMenu
      trigger={<BsThreeDots className="w-4 h-4" aria-hidden="true" />}
      ariaLabel="Balance actions"
    >
      <MenuItem>
        <Button 
          variant="menu-item" 
          fullWidth 
          onClick={handleMore}
        >
          <FaTools className="mr-3 h-4 w-4 text-gray-600" aria-hidden="true" />
          More
        </Button>
      </MenuItem>
    </BaseMenu>
  );
}
