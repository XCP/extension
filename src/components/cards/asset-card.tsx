import { type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { AssetIcon } from "@/components/asset-icon";
import { AssetMenu } from "@/components/menus/asset-menu";
import type { OwnedAsset } from "@/utils/blockchain/counterparty/api";
import { formatAsset, formatAmount } from "@/utils/format";

/**
 * Props interface for the AssetCard component
 */
interface AssetCardProps {
  /** The owned asset data to display */
  asset: OwnedAsset;
  /** Optional custom click handler - if not provided, defaults to navigation to asset page */
  onClick?: (asset: string) => void;
  /** Whether to show the asset menu - defaults to true */
  showMenu?: boolean;
  /** Optional custom CSS classes */
  className?: string;
}

/**
 * AssetCard Component
 * 
 * A reusable card component for displaying owned asset information including:
 * - Asset icon and formatted name
 * - Asset supply with proper decimal formatting
 * - Optional asset menu for actions
 * - Click navigation to asset detail page
 * 
 * @param props - The component props
 * @returns A ReactElement representing the asset card
 * 
 * @example
 * ```tsx
 * <AssetCard 
 *   asset={ownedAsset} 
 *   onClick={(asset) => navigate(`/custom/${asset}`)}
 *   showMenu={false}
 * />
 * ```
 */
export function AssetCard({
  asset,
  onClick,
  showMenu = true,
  className = ""
}: AssetCardProps): ReactElement {
  const navigate = useNavigate();

  // Handle card click - use custom handler or default to asset navigation
  const handleClick = () => {
    if (onClick) {
      onClick(asset.asset);
    } else {
      navigate(`/assets/${encodeURIComponent(asset.asset)}`);
    }
  };

  return (
    <div
      className={`relative flex items-center p-4 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`View ${asset.asset} details`}
    >
      {/* Asset Icon */}
      <AssetIcon asset={asset.asset} size="lg" className="flex-shrink-0" />

      {/* Asset Information */}
      <div className="ml-3 flex-grow">
        {/* Asset Name/Symbol */}
        <div className="font-medium text-sm text-gray-900">
          {formatAsset(asset.asset, { assetInfo: { asset_longname: asset.asset_longname }, shorten: true })}
        </div>
        
        {/* Asset Supply */}
        <div className="text-sm text-gray-500">
          Supply: {formatAmount({ 
            value: Number(asset.supply_normalized), 
            minimumFractionDigits: 0, 
            maximumFractionDigits: 8 
          })}
        </div>
      </div>

      {/* Asset Menu (if enabled) */}
      {showMenu && (
        <div className="absolute top-2 right-2">
          <AssetMenu ownedAsset={asset} />
        </div>
      )}
    </div>
  );
}

