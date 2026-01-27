import { useEffect, type ReactElement } from 'react';
import { useHeader } from '@/contexts/header-context';
import { AssetIcon } from '@/components/domain/asset/asset-icon';
import { formatAmount } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';
import type { AssetInfo } from '@/utils/blockchain/counterparty/api';

/**
 * Props for the AssetHeader component.
 */
interface AssetHeaderProps {
  /** The asset information to display */
  assetInfo: AssetInfo;
  /** Optional CSS classes */
  className?: string;
}

/**
 * AssetHeader Component
 * 
 * Displays a header with asset information, using cached data from HeaderContext.
 * Uses the shared AssetIcon component for consistent icon display.
 * 
 * @param props - The component props
 * @returns A React element representing the asset header
 * 
 * @example
 * ```tsx
 * <AssetHeader 
 *   assetInfo={assetDetails}
 *   className="mb-4"
 * />
 * ```
 */
export const AssetHeader = ({ assetInfo, className = '' }: AssetHeaderProps): ReactElement => {
  const { subheadings, setAssetHeader } = useHeader();
  const cached = subheadings.assets[assetInfo.asset];

  // Update cache if props differ from cached data
  useEffect(() => {
    // Compare relevant fields instead of JSON.stringify for better performance
    const hasChanged = !cached || 
      cached.asset !== assetInfo.asset ||
      cached.asset_longname !== assetInfo.asset_longname ||
      cached.supply !== assetInfo.supply ||
      cached.divisible !== assetInfo.divisible ||
      cached.locked !== assetInfo.locked;
      
    if (hasChanged) {
      setAssetHeader(assetInfo.asset, assetInfo);
    }
  }, [assetInfo, cached, setAssetHeader]);

  // Use cached data if available, otherwise fall back to props
  const displayInfo = cached ?? assetInfo;

  // Convert supply from satoshi-like units to actual units for divisible assets
  // Using fromSatoshis for safe conversion
  const displaySupply = displayInfo.divisible 
    ? fromSatoshis(displayInfo.supply || 0, { asNumber: true })
    : Number(displayInfo.supply || 0);

  return (
    <div className={`flex items-center ${className}`}>
      <AssetIcon asset={displayInfo.asset} size="lg" className="mr-4" />
      <div>
        <h2 className="text-xl font-bold break-all">
          {displayInfo.asset_longname || displayInfo.asset}
        </h2>
        <p className="text-gray-600 text-sm">
          Supply:{' '}
          {formatAmount({
            value: displaySupply,
            minimumFractionDigits: displayInfo.divisible ? 8 : 0,
            maximumFractionDigits: displayInfo.divisible ? 8 : 0,
            useGrouping: true,
          })}
        </p>
      </div>
    </div>
  );
};