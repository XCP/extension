import { type ReactElement, type KeyboardEvent } from 'react';
import { AssetIcon } from '@/components/domain/asset/asset-icon';
import { formatAmount, formatAsset } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';
import type { SwapListing } from '@/utils/xcpdex-api';

interface MarketSwapCardProps {
  listing: SwapListing;
  onClick?: () => void;
  className?: string;
}

/**
 * MarketSwapCard displays a swap listing for browsing.
 * Compact layout: AssetIcon | name + quantity | price
 */
export function MarketSwapCard({
  listing,
  onClick,
  className = '',
}: MarketSwapCardProps): ReactElement {
  const priceBtc = fromSatoshis(listing.price_sats, true);
  const displayName = formatAsset(listing.asset, {
    assetInfo: { asset_longname: listing.asset_longname },
    shorten: true,
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={`bg-white rounded-lg shadow-sm p-3 ${onClick ? 'hover:shadow-md transition-shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500' : ''} ${className}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-center gap-3">
        <AssetIcon asset={listing.asset} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between">
            <span className="font-medium text-blue-600 text-sm truncate">{displayName}</span>
            <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
              {listing.asset_quantity}
            </span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>
              {formatAmount({ value: priceBtc, minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC
            </span>
            <span>{listing.price_sats.toLocaleString()} sats</span>
          </div>
        </div>
      </div>
    </div>
  );
}
