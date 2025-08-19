import React, { useEffect } from 'react';
import { useHeader } from '@/contexts/header-context';
import { formatAmount } from '@/utils/format';

/**
 * Information about an asset.
 */
export interface AssetInfo {
  asset: string;
  asset_longname: string | null;
  description?: string;
  issuer?: string;
  divisible: boolean;
  locked: boolean;
  supply?: string | number;
}

/**
 * Props for the AssetHeader component.
 */
interface AssetHeaderProps {
  assetInfo: AssetInfo;
  className?: string;
}

/**
 * Displays a header with asset information, using cached data from HeaderContext.
 * @param props AssetHeaderProps
 * @returns JSX.Element
 */
export const AssetHeader = ({ assetInfo, className = '' }: AssetHeaderProps) => {
  const { subheadings, setAssetHeader } = useHeader();
  const cached = subheadings.assets[assetInfo.asset];

  // Update cache if props differ from cached data
  useEffect(() => {
    if (!cached || JSON.stringify(cached) !== JSON.stringify(assetInfo)) {
      setAssetHeader(assetInfo.asset, assetInfo);
    }
  }, [assetInfo, cached, setAssetHeader]);

  // Use cached data if available, otherwise fall back to props
  const displayInfo = cached ?? assetInfo;

  return (
    <div className={`flex items-center ${className}`}>
      <img
        src={`https://app.xcp.io/img/icon/${displayInfo.asset}`}
        alt={displayInfo.asset}
        className="w-12 h-12 mr-4"
      />
      <div>
        <h2 className="text-xl font-bold break-all">
          {displayInfo.asset_longname || displayInfo.asset}
        </h2>
        <p className="text-gray-600 text-sm">
          Supply:{' '}
          {formatAmount({
            value: Number(displayInfo.supply || 0), // Default to 0 if supply is undefined
            minimumFractionDigits: displayInfo.divisible ? 8 : 0,
            maximumFractionDigits: displayInfo.divisible ? 8 : 0,
            useGrouping: true,
          })}
        </p>
      </div>
    </div>
  );
};
