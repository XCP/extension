import { MenuItem } from '@headlessui/react';
import { type ReactElement, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { BsThreeDots, FaBitcoin, FaCoins, FaExchangeAlt, FaPaperPlane } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { BaseMenu } from '@/components/ui/menus/base-menu';
import { DIESEL_WALLET_ASSET } from '@/core/alkanes/api';

interface BalanceMenuProps {
  asset: string;
}

/**
 * Provides quick actions for token balances based on asset type:
 * - BTC: Send, Swap, Mint
 * - XCP: Send, Swap, Mint
 * - Other assets: Send, Sell, Swap
 *
 * Destructive actions belong on the balance page, not in this list.
 */
export function BalanceMenu({ asset }: BalanceMenuProps): ReactElement {
  const navigate = useNavigate();
  const isBTC = asset === 'BTC';
  const isXCP = asset === 'XCP';
  const isDiesel = asset === DIESEL_WALLET_ASSET;
  const encodedAsset = encodeURIComponent(asset);

  const handleSend = useCallback(() => {
    navigate(isDiesel ? '/diesel/send' : `/compose/send/${encodedAsset}`);
  }, [encodedAsset, isDiesel, navigate]);

  const handleSwap = useCallback(() => {
    navigate(`/compose/order/${encodedAsset}`);
  }, [encodedAsset, navigate]);

  const handleMint = useCallback(() => {
    navigate(`/compose/fairmint/${encodedAsset}`);
  }, [encodedAsset, navigate]);

  const handleSell = useCallback(() => {
    navigate(`/compose/dispenser/${encodedAsset}`);
  }, [encodedAsset, navigate]);

  return (
    <BaseMenu
      trigger={<BsThreeDots className="size-4" aria-hidden="true" />}
      ariaLabel="Balance actions"
    >
      <MenuItem>
        <Button variant="menu-item" fullWidth onClick={handleSend}>
          <FaPaperPlane className="mr-3 size-4 text-gray-600" aria-hidden="true" />
          Send
        </Button>
      </MenuItem>

      {!isXCP && !isBTC && !isDiesel && (
        <MenuItem>
          <Button variant="menu-item" fullWidth onClick={handleSell}>
            <FaBitcoin className="mr-3 size-4 text-gray-600" aria-hidden="true" />
            Sell
          </Button>
        </MenuItem>
      )}

      {!isDiesel && (
        <MenuItem>
          <Button variant="menu-item" fullWidth onClick={handleSwap}>
            <FaExchangeAlt className="mr-3 size-4 text-gray-600" aria-hidden="true" />
            Swap
          </Button>
        </MenuItem>
      )}

      {(isBTC || isXCP) && (
        <MenuItem>
          <Button variant="menu-item" fullWidth onClick={handleMint}>
            <FaCoins className="mr-3 size-4 text-gray-600" aria-hidden="true" />
            Mint
          </Button>
        </MenuItem>
      )}

    </BaseMenu>
  );
}
