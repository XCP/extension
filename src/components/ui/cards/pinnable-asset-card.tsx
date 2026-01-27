import { type ReactElement } from "react";
import { TbPinned, TbPinnedFilled } from "@/components/icons";
import { FiChevronUp, FiChevronDown } from "@/components/icons";
import { AssetIcon } from "@/components/domain/asset/asset-icon";

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
  /** Whether to show up/down arrows */
  showArrows?: boolean;
  /** Handler for moving up */
  onMoveUp?: () => void;
  /** Handler for moving down */
  onMoveDown?: () => void;
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
 * - Optional up/down arrow buttons for reordering
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
 *   showArrows={true}
 *   onMoveUp={handleMoveUp}
 *   onMoveDown={handleMoveDown}
 * />
 * ```
 */
export function PinnableAssetCard({
  symbol,
  isPinned,
  onPinToggle,
  showArrows = false,
  onMoveUp,
  onMoveDown,
  onClick,
  className = ""
}: PinnableAssetCardProps): ReactElement {
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
      className={`flex items-center justify-between p-3 bg-white rounded-lg shadow-sm hover:bg-gray-50 ${onClick ? "cursor-pointer" : ""} ${className}`}
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
        <AssetIcon asset={symbol} size="sm" className="flex-shrink-0" />
        <div className="ml-3">
          <div className="font-medium text-sm text-gray-900">{symbol}</div>
        </div>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-1">
        {/* Up/Down arrows */}
        {showArrows && (
          <div className="flex flex-col">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMoveUp?.();
              }}
              disabled={!onMoveUp}
              className={`p-0.5 rounded transition-colors ${
                !onMoveUp
                  ? "text-gray-300 cursor-not-allowed"
                  : "text-gray-600 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
              }`}
              aria-label={`Move ${symbol} up`}
              title="Move up"
            >
              <FiChevronUp className="size-3" aria-hidden="true" />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMoveDown?.();
              }}
              disabled={!onMoveDown}
              className={`p-0.5 rounded transition-colors ${
                !onMoveDown
                  ? "text-gray-300 cursor-not-allowed"
                  : "text-gray-600 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
              }`}
              aria-label={`Move ${symbol} down`}
              title="Move down"
            >
              <FiChevronDown className="size-3" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Pin/Unpin Button */}
        <button
          onClick={handlePinClick}
          className={`p-2 rounded-md transition-colors hover:scale-110 cursor-pointer ${
            isPinned
              ? "bg-blue-500 text-white hover:bg-blue-600"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
          aria-label={isPinned ? `Unpin ${symbol}` : `Pin ${symbol}`}
          title={isPinned ? "Unpin asset" : "Pin asset"}
        >
          {isPinned ? (
            <TbPinnedFilled className="size-4" aria-hidden="true" />
          ) : (
            <TbPinned className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

