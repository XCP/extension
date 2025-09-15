import { type ReactElement, type ReactNode } from 'react';
import { Menu, MenuButton, MenuItems } from '@headlessui/react';

/**
 * Props for the BaseMenu component
 */
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

/**
 * BaseMenu Component
 * 
 * A standardized base menu component that provides consistent styling and behavior
 * for all dropdown menus in the application. Built on top of HeadlessUI's Menu component.
 * 
 * Features:
 * - Consistent trigger button styling with hover effects
 * - Standardized dropdown positioning and shadows
 * - Proper accessibility attributes
 * - Click-outside-to-close behavior
 * 
 * @param props - The component props
 * @returns A ReactElement representing the base menu
 * 
 * @example
 * ```tsx
 * <BaseMenu
 *   trigger={<FaEllipsisV />}
 *   ariaLabel="Asset actions"
 * >
 *   <MenuItem>
 *     <Button variant="menu-item" fullWidth onClick={handleAction}>
 *       Action Label
 *     </Button>
 *   </MenuItem>
 * </BaseMenu>
 * ```
 */
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
        className="p-1 rounded-full hover:bg-black/5 transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        aria-label={ariaLabel}
        onClick={handleMenuButtonClick}
      >
        {trigger}
      </MenuButton>
      
      <MenuItems className={`absolute right-0 mt-1 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50 ${className || 'w-48'}`}>
        <div className="py-1">
          {children}
        </div>
      </MenuItems>
    </Menu>
  );
}

export default BaseMenu;