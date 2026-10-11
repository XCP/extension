import { Menu, MenuButton, MenuItems } from '@headlessui/react';
import type { ReactElement, ReactNode } from 'react';

interface BaseMenuProps {
  /** The trigger element for the menu (usually an icon button) */
  trigger: ReactNode;
  /** Menu items to display */
  children: ReactNode;
  /** Optional custom CSS classes for the container */
  className?: string;
  /** Optional aria-label for the menu button */
  ariaLabel?: string;
}

export function BaseMenu({
  trigger,
  children,
  className = '',
  ariaLabel
}: BaseMenuProps): ReactElement {
  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleMenuButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <Menu as="div" className="relative inline-block text-left" onClick={handleMenuClick}>
      <MenuButton
        className="p-1 rounded-full hover:bg-black/5 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
        aria-label={ariaLabel}
        onClick={handleMenuButtonClick}
      >
        {trigger}
      </MenuButton>
      
      <MenuItems className={`absolute right-0 mt-1 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus-visible:outline-none z-50 ${className || 'w-48'}`}>
        <div className="py-1">
          {children}
        </div>
      </MenuItems>
    </Menu>
  );
}

