import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BsThreeDots } from 'react-icons/bs';
import { FaCoins, FaLockOpen, FaPen, FaExchangeAlt } from 'react-icons/fa';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { Button } from '@/components/button';

interface AssetMenuProps {
  ownedAsset: {
    asset: string;
    asset_longname: string | null;
    supply_normalized: string;
    description: string;
    locked: boolean;
  };
}

export const AssetMenu = ({ ownedAsset }: AssetMenuProps) => {
  const navigate = useNavigate();

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleAction = (path: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/compose/${path}/${encodeURIComponent(ownedAsset.asset)}`);
  };

  return (
    <Menu as="div" className="relative">
      <MenuButton as={React.Fragment}>
        <Button variant="menu" onClick={handleMenuClick} className="cursor-pointer">
          <BsThreeDots className="w-4 h-4" />
        </Button>
      </MenuButton>
      <MenuItems className="absolute right-0 mt-1 w-56 bg-white rounded-md shadow-lg focus:outline-none z-10">
        {!ownedAsset.locked && (
          <>
            <MenuItem>
              <Button variant="menu-item" fullWidth onClick={handleAction('issuance/issue-supply')} className="cursor-pointer">
                <FaCoins className="mr-3 h-4 w-4 text-gray-600" />
                Issue Supply
              </Button>
            </MenuItem>
            <MenuItem>
              <Button variant="menu-item" fullWidth onClick={handleAction('issuance/lock-supply')} className="cursor-pointer">
                <FaLockOpen className="mr-3 h-4 w-4 text-gray-600" />
                Lock Supply
              </Button>
            </MenuItem>
          </>
        )}
        <MenuItem>
          <Button variant="menu-item" fullWidth onClick={handleAction('issuance/update-description')} className="cursor-pointer">
            <FaPen className="mr-3 h-4 w-4 text-gray-600" />
            Change Description
          </Button>
        </MenuItem>
        <MenuItem>
          <Button variant="menu-item" fullWidth onClick={handleAction('issuance/transfer-ownership')} className="cursor-pointer">
            <FaExchangeAlt className="mr-3 h-4 w-4 text-gray-600" />
            Transfer Ownership
          </Button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
};
