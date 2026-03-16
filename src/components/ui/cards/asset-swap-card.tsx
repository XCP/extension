import { type ReactElement, type KeyboardEvent, type MouseEvent } from 'react';
import { FaCopy, FaCheck } from '@/components/icons';
import { formatAddress } from '@/utils/format';
import type { SwapListing } from '@/utils/xcpdex-api';

interface AssetSwapCardProps {
  listing: SwapListing;
  /** Formatted total price (e.g. "0.00250000 BTC") */
  formattedTotalPrice: string;
  /** Formatted per-unit price (e.g. "25 sats/unit") */
  formattedUnitPrice: string;
  onClick?: () => void;
  onCopyAddress?: (address: string) => void;
  isCopied?: boolean;
  className?: string;
}

/**
 * AssetSwapCard displays a swap listing on an asset-specific page.
 * Matches the AssetDispenserCard layout: price (green) + quantity, seller address.
 */
export function AssetSwapCard({
  listing,
  formattedTotalPrice,
  formattedUnitPrice,
  onClick,
  onCopyAddress,
  isCopied = false,
  className = '',
}: AssetSwapCardProps): ReactElement {
  const qty = listing.asset_quantity;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  const handleCopyClick = (e: MouseEvent) => {
    e.stopPropagation();
    onCopyAddress?.(listing.seller_address);
  };

  return (
    <div
      className={`bg-white rounded-lg shadow-sm p-3 ${onClick ? 'hover:shadow-md transition-shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500' : ''} ${className}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-green-600">
            {formattedTotalPrice}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {formattedUnitPrice} per unit
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <div className="text-xs text-gray-700">
            {qty} units
          </div>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <span className="text-xs text-gray-400 truncate">
              {formatAddress(listing.seller_address, true)}
            </span>
            {onCopyAddress && (
              <button
                onClick={handleCopyClick}
                className={`flex-shrink-0 p-0.5 rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isCopied
                    ? 'text-green-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                aria-label="Copy seller address"
              >
                {isCopied ? (
                  <FaCheck className="size-3" aria-hidden="true" />
                ) : (
                  <FaCopy className="size-3" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
