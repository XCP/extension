import { type ReactElement, type KeyboardEvent } from 'react';
import { FaSpinner } from '@/components/icons';
import { AssetIcon } from '@/components/domain/asset/asset-icon';
import { formatAmount, formatAsset } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';
import type { SwapListing } from '@/utils/xcpdex-api';

interface ManageSwapCardProps {
  listing: SwapListing;
  isCancelling?: boolean;
  onCancel?: () => void;
  onClick?: () => void;
  className?: string;
}

/**
 * ManageSwapCard displays a user's own swap listing with inline cancel action.
 * Compact layout matching ManageDispenserCard: Icon | name + price | Cancel button
 */
export function ManageSwapCard({
  listing,
  isCancelling = false,
  onCancel,
  onClick,
  className = '',
}: ManageSwapCardProps): ReactElement {
  const priceBtc = fromSatoshis(listing.price_sats, true);
  const displayName = formatAsset(listing.asset, {
    assetInfo: { asset_longname: listing.asset_longname },
    shorten: true,
  });

  const handleCancelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCancel?.();
  };

  const handleClick = () => {
    onClick?.();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className={`bg-white rounded-lg shadow-sm p-3 hover:shadow-md transition-shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center gap-3">
        <AssetIcon asset={listing.asset} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 text-sm truncate">
            {displayName}
          </div>
          <div className="text-xs text-gray-500">
            {formatAmount({ value: priceBtc, minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC
          </div>
        </div>
        <button
          onClick={handleCancelClick}
          disabled={isCancelling}
          className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
        >
          {isCancelling ? (
            <FaSpinner className="size-3 animate-spin" aria-label="Cancelling..." />
          ) : (
            'Cancel'
          )}
        </button>
      </div>
    </div>
  );
}
