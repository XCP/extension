import { useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { BsThreeDots, FaExchangeAlt, FaPlus } from '@/components/icons';
import { MenuItem } from '@headlessui/react';
import { BaseMenu } from './base-menu';
import { Button } from '@/components/ui/button';

interface UtxoMenuProps {
  utxo: string;
}

export function UtxoMenu({ utxo }: UtxoMenuProps): ReactElement {
  const navigate = useNavigate();

  const handleMove = useCallback(() => {
    navigate(`/compose/utxo/move/${utxo}`);
  }, [utxo, navigate]);

  const handleDetach = useCallback(() => {
    navigate(`/compose/utxo/detach/${utxo}`);
  }, [utxo, navigate]);

  return (
    <BaseMenu
      trigger={<BsThreeDots className="size-4" aria-hidden="true" />}
      ariaLabel="UTXO actions"
    >
      <MenuItem>
        <Button variant="menu-item" fullWidth onClick={handleDetach}>
          <FaPlus className="mr-3 size-4 text-gray-600" aria-hidden="true" />
          Detach
        </Button>
      </MenuItem>
      <MenuItem>
        <Button variant="menu-item" fullWidth onClick={handleMove}>
          <FaExchangeAlt className="mr-3 size-4 text-gray-600" aria-hidden="true" />
          Move
        </Button>
      </MenuItem>
    </BaseMenu>
  );
}
