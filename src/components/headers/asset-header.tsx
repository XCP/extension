import React, { useEffect, useState, useRef } from 'react';
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
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const prevAssetRef = useRef<string | null>(null);

  // Update cache if props differ from cached data
  useEffect(() => {
    if (!cached || JSON.stringify(cached) !== JSON.stringify(assetInfo)) {
      setAssetHeader(assetInfo.asset, assetInfo);
    }
  }, [assetInfo, cached, setAssetHeader]);

  // Use cached data if available, otherwise fall back to props
  const displayInfo = cached ?? assetInfo;

  // Reset image state when asset changes
  useEffect(() => {
    if (prevAssetRef.current !== displayInfo.asset) {
      // Only reset if asset actually changed
      if (prevAssetRef.current !== null) {
        setImageLoaded(false);
        setImageError(false);
      }
      prevAssetRef.current = displayInfo.asset;
    }
  }, [displayInfo.asset]);

  // Convert supply from satoshi-like units to actual units for divisible assets
  const displaySupply = displayInfo.divisible 
    ? Number(displayInfo.supply || 0) / 100000000 
    : Number(displayInfo.supply || 0);

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(true);
  };

  return (
    <div className={`flex items-center ${className}`}>
      <div className="relative w-12 h-12 mr-4">
        {/* Placeholder/fallback */}
        {(!imageLoaded || imageError) && (
          <div className="absolute inset-0 bg-gray-200 rounded flex items-center justify-center text-gray-500 text-xs font-semibold">
            {displayInfo.asset.slice(0, 3)}
          </div>
        )}
        {/* Actual image */}
        <img
          src={`https://app.xcp.io/img/icon/${displayInfo.asset}`}
          alt={displayInfo.asset}
          className={`absolute inset-0 w-12 h-12 transition-opacity duration-200 ${
            imageLoaded && !imageError ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </div>
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
