import React, { type ReactElement, type ReactNode } from "react";
import { FaChevronRight } from "react-icons/fa";

/**
 * Props interface for the ActionCard component
 */
interface ActionCardProps {
  /** The primary title/name of the action */
  title: string;
  /** Optional description text shown below the title */
  description?: string;
  /** Click handler for the action */
  onClick: () => void;
  /** Optional icon to display on the left side */
  icon?: ReactNode;
  /** Whether to show the chevron right indicator - defaults to true */
  showChevron?: boolean;
  /** Optional custom CSS classes */
  className?: string;
  /** Optional aria-label for accessibility */
  ariaLabel?: string;
}

/**
 * ActionCard Component
 * 
 * A reusable card component for displaying action items like settings, menu items, or navigation links.
 * Provides consistent styling and behavior across the application.
 * 
 * Features:
 * - Consistent hover and focus states
 * - Optional icon display
 * - Accessible keyboard navigation
 * - Customizable appearance
 * 
 * @param props - The component props
 * @returns A ReactElement representing the action card
 * 
 * @example
 * ```tsx
 * <ActionCard 
 *   title="Security Settings"
 *   description="Change your wallet password"
 *   onClick={() => navigate('/settings/security')}
 *   icon={<FiLock />}
 * />
 * ```
 */
export function ActionCard({
  title,
  description,
  onClick,
  icon,
  showChevron = true,
  className = "",
  ariaLabel
}: ActionCardProps): ReactElement {
  const handleClick = () => {
    onClick();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`relative w-full rounded transition duration-300 p-4 cursor-pointer bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${className}`}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel || title}
    >
      <div className="flex items-start">
        {/* Optional Icon */}
        {icon && (
          <div className="flex-shrink-0 mr-3 mt-0.5">
            <div className="w-5 h-5 flex items-center justify-center text-gray-600">
              {icon}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-grow min-w-0">
          <div className="text-sm font-medium text-gray-900 mb-1">
            {title}
          </div>
          {description && (
            <div className="text-xs text-gray-500 leading-relaxed">
              {description}
            </div>
          )}
        </div>

        {/* Chevron Indicator */}
        {showChevron && (
          <div className="flex-shrink-0 ml-3">
            <div className="flex items-center justify-center">
              <FaChevronRight className="w-4 h-4 text-gray-400" aria-hidden="true" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ActionCard;