import { useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsThreeDots, FaBitcoin, FaCoins, FaExchangeAlt, FaTools } from '@/components/icons';
import { MenuItem } from '@headlessui/react';
import { BaseMenu } from './base-menu';
import { Button } from '@/components/ui/button';

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
 * Provides quick actions for token balances based on asset type:
 * - BTC: Dispenser, Fairminter, More…
 * - XCP: DEX Order, Dispenser, Fairminter, More…
 * - Other: DEX Order, Dispenser, More…
 *
 * @param props - The component props
 * @returns A ReactElement representing the balance menu
 */
export function BalanceMenu({ asset }: BalanceMenuProps): ReactElement {
  const navigate = useNavigate();
  const isBTC = asset === "BTC";
  const isXCP = asset === "XCP";

  const handleOrder = useCallback(() => {
    navigate(`/compose/order/${encodeURIComponent(asset)}`);
  }, [asset, navigate]);

  const handleDispense = useCallback(() => {
    navigate('/compose/dispenser/dispense');
  }, [navigate]);

  const handleDispenser = useCallback(() => {
    navigate(`/compose/dispenser/${encodeURIComponent(asset)}`);
  }, [asset, navigate]);

  const handleFairmint = useCallback(() => {
    navigate(`/compose/fairmint/${encodeURIComponent(asset)}`);
  }, [asset, navigate]);

  const handleAllOptions = useCallback(() => {
    navigate(`/assets/${encodeURIComponent(asset)}/balance`);
  }, [asset, navigate]);

  return (
    <BaseMenu
      trigger={<BsThreeDots className="size-4" aria-hidden="true" />}
      ariaLabel="Balance actions"
    >
      {isBTC ? (
        <>
          <MenuItem>
            <Button variant="menu-item" fullWidth onClick={handleDispense}>
              <FaBitcoin className="mr-3 size-4 text-gray-600" aria-hidden="true" />
              Dispenser
            </Button>
          </MenuItem>
          <MenuItem>
            <Button variant="menu-item" fullWidth onClick={handleFairmint}>
              <FaCoins className="mr-3 size-4 text-gray-600" aria-hidden="true" />
              Fairminter
            </Button>
          </MenuItem>
        </>
      ) : (
        <>
          <MenuItem>
            <Button variant="menu-item" fullWidth onClick={handleOrder}>
              <FaExchangeAlt className="mr-3 size-4 text-gray-600" aria-hidden="true" />
              DEX Order
            </Button>
          </MenuItem>
          <MenuItem>
            <Button variant="menu-item" fullWidth onClick={handleDispenser}>
              <FaBitcoin className="mr-3 size-4 text-gray-600" aria-hidden="true" />
              Dispenser
            </Button>
          </MenuItem>
          {isXCP && (
            <MenuItem>
              <Button variant="menu-item" fullWidth onClick={handleFairmint}>
                <FaCoins className="mr-3 size-4 text-gray-600" aria-hidden="true" />
                Fairminter
              </Button>
            </MenuItem>
          )}
        </>
      )}
      <MenuItem>
        <Button variant="menu-item" fullWidth onClick={handleAllOptions}>
          <FaTools className="mr-3 size-4 text-gray-600" aria-hidden="true" />
          More…
        </Button>
      </MenuItem>
    </BaseMenu>
  );
}
