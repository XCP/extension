import React, { type ReactElement } from "react";
import { FiGlobe, FiX } from "react-icons/fi";

/**
 * Props interface for the ConnectedSiteCard component
 */
interface ConnectedSiteCardProps {
  /** The hostname of the connected site (e.g., "app.xcp.io") */
  hostname: string;
  /** The full origin URL of the connected site */
  origin: string;
  /** Handler for disconnecting the site */
  onDisconnect: () => void;
  /** Optional icon to display instead of default globe */
  icon?: ReactElement;
  /** Optional custom CSS classes */
  className?: string;
  /** Optional aria-label for accessibility */
  ariaLabel?: string;
}

/**
 * ConnectedSiteCard Component
 * 
 * A reusable card component for displaying connected websites with disconnect functionality.
 * Used in settings to manage website permissions and connections.
 * 
 * Features:
 * - Site information display with hostname and origin
 * - Disconnect button with hover effects
 * - Clean, consistent styling
 * - Accessible keyboard navigation
 * 
 * @param props - The component props
 * @returns A ReactElement representing the connected site card
 * 
 * @example
 * ```tsx
 * <ConnectedSiteCard 
 *   hostname="app.xcp.io"
 *   origin="https://app.xcp.io"
 *   onDisconnect={() => handleDisconnect('https://app.xcp.io')}
 * />
 * ```
 */
export function ConnectedSiteCard({
  hostname,
  origin,
  onDisconnect,
  icon,
  className = "",
  ariaLabel
}: ConnectedSiteCardProps): ReactElement {
  const handleDisconnect = (event: React.MouseEvent) => {
    event.stopPropagation();
    onDisconnect();
  };

  const handleDisconnectKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onDisconnect();
    }
  };

  return (
    <div
      className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}
      role="article"
      aria-label={ariaLabel || `Connected site: ${hostname}`}
    >
      <div className="flex items-center justify-between">
        {/* Site Information */}
        <div className="flex items-center gap-2">
          {/* Icon */}
          <div className="flex-shrink-0">
            {icon || <FiGlobe className="w-4 h-4 text-gray-400" />}
          </div>
          
          {/* Site Details */}
          <div className="min-w-0">
            <h3 className="font-medium text-sm text-gray-900 truncate">
              {hostname}
            </h3>
            <p className="text-xs text-gray-500 truncate" title={origin}>
              {origin}
            </p>
          </div>
        </div>
        
        {/* Disconnect Button */}
        <button
          onClick={handleDisconnect}
          onKeyDown={handleDisconnectKeyDown}
          className="flex-shrink-0 p-2 hover:bg-red-50 rounded-lg transition-colors group focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
          title="Disconnect site"
          aria-label={`Disconnect ${hostname}`}
        >
          <FiX className="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" />
        </button>
      </div>
    </div>
  );
}

export default ConnectedSiteCard;