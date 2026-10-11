import type { ReactElement, ReactNode } from "react";
import { FaChevronRight } from "@/components/icons";

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
  /** Whether to show a notification badge */
  showNotification?: boolean;
}

export function ActionCard({
  title,
  description,
  onClick,
  icon,
  showChevron = true,
  className = "",
  ariaLabel,
  showNotification = false
}: ActionCardProps): ReactElement {
  const handleClick = () => {
    onClick();
  };

  // Determine title color based on border class in className prop
  const getTitleColor = () => {
    if (className?.includes('border-green')) return 'text-green-600';
    if (className?.includes('border-red')) return 'text-red-600';
    if (className?.includes('border-orange')) return 'text-orange-600';
    return 'text-gray-900';
  };

  return (
    <button type="button"
      onClick={handleClick}
      className={`block text-left relative w-full rounded transition duration-300 p-4 cursor-pointer bg-white hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${className}`}
      aria-label={ariaLabel || title}
    >
      <div className="flex items-center">
        {/* Optional Icon */}
        {icon && (
          <div className="flex-shrink-0 mr-3">
            <div className="size-5 flex items-center justify-center text-gray-600">
              {icon}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-grow min-w-0">
          <div className={`text-sm font-medium ${getTitleColor()} mb-1 flex items-center`}>
            {title}
            {showNotification && (
              <span className="ml-2 size-2 bg-orange-500 rounded-full inline-block"></span>
            )}
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
              <FaChevronRight className="size-4 text-gray-400" aria-hidden="true" />
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

