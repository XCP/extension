import { useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsThreeDots, FaTools } from '@/components/icons';
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
    navigate(`/assets/${encodeURIComponent(asset)}/balance`);
  }, [asset, navigate]);

  return (
    <BaseMenu
      trigger={<BsThreeDots className="size-4" aria-hidden="true" />}
      ariaLabel="Balance actions"
    >
      <MenuItem>
        <Button 
          variant="menu-item" 
          fullWidth 
          onClick={handleMore}
        >
          <FaTools className="mr-3 size-4 text-gray-600" aria-hidden="true" />
          More
        </Button>
      </MenuItem>
    </BaseMenu>
  );
}
