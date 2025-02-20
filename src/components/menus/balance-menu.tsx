import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BsThreeDots } from 'react-icons/bs';
import { FaTools } from 'react-icons/fa';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';

interface BalanceMenuProps {
  asset: string;
}

export const BalanceMenu = ({ asset }: BalanceMenuProps) => {
  const navigate = useNavigate();

  const handleMore = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/balance/${encodeURIComponent(asset)}`);
  };

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <Menu as="div" className="relative">
      <MenuButton as={React.Fragment}>
        <button className="p-1 bg-transparent cursor-pointer" onClick={handleMenuClick}>
          <BsThreeDots className="w-4 h-4" />
        </button>
      </MenuButton>
      <MenuItems className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg focus:outline-none z-10">
        <MenuItem>
          {({ active }: { active: boolean }) => (
            <button
              className={`group flex w-full items-center px-4 py-2 text-sm text-gray-800 hover:bg-gray-100 focus:outline-none cursor-pointer ${active ? 'bg-gray-100' : ''}`}
              onClick={handleMore}
            >
              <FaTools className="mr-3 h-4 w-4 text-gray-600" /> More
            </button>
          )}
        </MenuItem>
      </MenuItems>
    </Menu>
  );
};
