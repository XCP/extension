import React, { type ReactElement } from "react";
import { TbPinned, TbPinnedFilled } from "react-icons/tb";

/**
 * Props interface for the PinnableAssetCard component
 */
interface PinnableAssetCardProps {
  /** The asset symbol to display */
  symbol: string;
  /** Whether the asset is currently pinned */
  isPinned: boolean;
  /** Handler for pin/unpin toggle */
  onPinToggle: (symbol: string) => void;
  /** Whether the card is being dragged (for drag and drop support) */
  isDragging?: boolean;
  /** Optional click handler for the card itself */
  onClick?: (symbol: string) => void;
  /** Optional custom CSS classes */
  className?: string;
}

/**
 * PinnableAssetCard Component
 * 
 * A specialized card component for assets that can be pinned/unpinned.
 * Used in the pinned assets settings page for managing pinned assets.
 * 
 * Features:
 * - Asset icon and symbol display
 * - Pin/unpin toggle button with visual feedback
 * - Drag and drop support via isDragging prop
 * - Simplified design focused on pinning functionality
 * 
 * @param props - The component props
 * @returns A ReactElement representing the pinnable asset card
 * 
 * @example
 * ```tsx
 * <PinnableAssetCard
 *   symbol="XCP"
 *   isPinned={true}
 *   onPinToggle={handlePinToggle}
 *   isDragging={false}
 * />
 * ```
 */
export function PinnableAssetCard({
  symbol,
  isPinned,
  onPinToggle,
  isDragging = false,
  onClick,
  className = ""
}: PinnableAssetCardProps): ReactElement {
  // Generate the asset icon URL from xcp.io
  const imageUrl = `https://app.xcp.io/img/icon/${symbol}`;

  const handleCardClick = () => {
    if (onClick) {
      onClick(symbol);
    }
  };

  const handlePinClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onPinToggle(symbol);
  };

  return (
    <div
      className={`flex items-center justify-between p-3 bg-white rounded-lg shadow-sm hover:bg-gray-50 ${
        isDragging ? "shadow-lg opacity-90" : ""
      } ${onClick ? "cursor-pointer" : ""} ${className}`}
      onClick={handleCardClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      } : undefined}
    >
      {/* Asset Icon and Symbol */}
      <div className="flex items-center flex-1">
        <div className="w-8 h-8 flex-shrink-0">
          <img 
            src={imageUrl} 
            alt={symbol}
            className="w-full h-full object-cover rounded-full"
            onError={(e) => {
              // Fallback for missing icons
              const target = e.target as HTMLImageElement;
              target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23e5e7eb'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='system-ui' font-size='12'%3E%3F%3C/text%3E%3C/svg%3E";
            }}
          />
        </div>
        <div className="ml-3">
          <div className="font-medium text-sm text-gray-900">{symbol}</div>
        </div>
      </div>

      {/* Pin/Unpin Button */}
      <button
        onClick={handlePinClick}
        className={`p-2 rounded-md transition-all hover:scale-110 ${
          isPinned 
            ? "bg-blue-500 text-white hover:bg-blue-600" 
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        }`}
        aria-label={isPinned ? `Unpin ${symbol}` : `Pin ${symbol}`}
        title={isPinned ? "Unpin asset" : "Pin asset"}
      >
        {isPinned ? (
          <TbPinnedFilled className="w-4 h-4" />
        ) : (
          <TbPinned className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

export default PinnableAssetCard;