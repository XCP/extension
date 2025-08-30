import React, { useEffect, useState, useRef } from 'react';
import { useHeader } from '@/contexts/header-context';
import { formatAmount } from '@/utils/format';

/**
 * Represents a token balance.
 */
interface TokenBalance {
  asset: string;
  asset_info?: {
    asset_longname: string | null;
    description?: string;
    issuer?: string;
    divisible?: boolean;
    locked?: boolean;
    supply?: string | number;
  };
  quantity_normalized?: string;
}

/**
 * Props for the BalanceHeader component.
 */
interface BalanceHeaderProps {
  balance: TokenBalance;
  className?: string;
}

/**
 * Displays a header with token balance information, using cached data from HeaderContext.
 * @param props BalanceHeaderProps
 * @returns JSX.Element
 */
export const BalanceHeader = ({ balance, className = '' }: BalanceHeaderProps) => {
  const { setBalanceHeader } = useHeader();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const prevAssetRef = useRef<string | null>(null);

  // Update cache with the current balance data
  useEffect(() => {
    setBalanceHeader(balance.asset, balance);
  }, [balance, setBalanceHeader]);

  // Always use props data as the source of truth
  const displayBalance = balance;

  // Reset image state when asset changes
  useEffect(() => {
    if (prevAssetRef.current !== displayBalance.asset) {
      // Only reset if asset actually changed
      if (prevAssetRef.current !== null) {
        setImageLoaded(false);
        setImageError(false);
      }
      prevAssetRef.current = displayBalance.asset;
    }
  }, [displayBalance.asset]);

  // Format the balance based on divisibility
  const formattedBalance = displayBalance.quantity_normalized
    ? formatAmount({
        value: Number(displayBalance.quantity_normalized),
        minimumFractionDigits: displayBalance.asset_info?.divisible ? 8 : 0,
        maximumFractionDigits: displayBalance.asset_info?.divisible ? 8 : 0,
        useGrouping: true,
      })
    : '0';

  // Determine display name and text size based on asset name length
  const displayName = displayBalance.asset_info?.asset_longname || displayBalance.asset;
  const textSizeClass =
    !displayBalance.asset_info?.asset_longname && displayBalance.asset.startsWith('A')
      ? 'text-lg'
      : displayName.length > 21
      ? 'text-sm'
      : displayName.length > 18
      ? 'text-base'
      : displayName.length > 12
      ? 'text-lg'
      : 'text-xl';

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
            {displayBalance.asset.slice(0, 3)}
          </div>
        )}
        {/* Actual image */}
        <img
          src={`https://app.xcp.io/img/icon/${displayBalance.asset}`}
          alt={displayBalance.asset}
          className={`absolute inset-0 w-12 h-12 transition-opacity duration-200 ${
            imageLoaded && !imageError ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </div>
      <div>
        <h2 className={`${textSizeClass} font-bold break-all`}>{displayName}</h2>
        <p className="text-sm text-gray-600">Available: {formattedBalance}</p>
      </div>
    </div>
  );
};
