import { useEffect, type ReactElement } from 'react';
import { useHeader } from '@/contexts/header-context';
import { AssetIcon } from '@/components/asset-icon';
import { formatAmount } from '@/utils/format';
import type { TokenBalance } from '@/utils/blockchain/counterparty/api';

/**
 * Props for the BalanceHeader component.
 */
interface BalanceHeaderProps {
  /** The token balance to display */
  balance: TokenBalance;
  /** Optional CSS classes */
  className?: string;
}

/**
 * BalanceHeader Component
 * 
 * Displays a header with token balance information, using cached data from HeaderContext.
 * Uses the shared AssetIcon component for consistent icon display.
 * 
 * @param props - The component props
 * @returns A React element representing the balance header
 * 
 * @example
 * ```tsx
 * <BalanceHeader 
 *   balance={tokenBalance}
 *   className="mb-4"
 * />
 * ```
 */
export const BalanceHeader = ({ balance, className = '' }: BalanceHeaderProps): ReactElement => {
  const { setBalanceHeader } = useHeader();

  // Update cache with the current balance data
  useEffect(() => {
    setBalanceHeader(balance.asset, balance);
  }, [balance, setBalanceHeader]);

  // Format the balance based on divisibility
  const formattedBalance = balance.quantity_normalized
    ? formatAmount({
        value: Number(balance.quantity_normalized),
        minimumFractionDigits: balance.asset_info?.divisible ? 8 : 0,
        maximumFractionDigits: balance.asset_info?.divisible ? 8 : 0,
        useGrouping: true,
      })
    : '0';

  // Determine display name and text size based on asset name length
  const displayName = balance.asset_info?.asset_longname || balance.asset;
  const textSizeClass = getTextSizeClass(displayName, balance.asset);

  return (
    <div className={`flex items-center ${className}`}>
      <AssetIcon asset={balance.asset} size="lg" className="mr-4" />
      <div>
        <h2 className={`${textSizeClass} font-bold break-all`}>{displayName}</h2>
        <p className="text-sm text-gray-600">Available: {formattedBalance}</p>
      </div>
    </div>
  );
};

/**
 * Determines the appropriate text size class based on asset name characteristics
 * @param displayName - The name to display
 * @param assetName - The original asset name
 * @returns The Tailwind CSS text size class
 */
function getTextSizeClass(displayName: string, assetName: string): string {
  // Special handling for A-named assets without longname
  const isNumericAsset = assetName.startsWith('A') && !displayName.includes('.');
  
  if (isNumericAsset) {
    return 'text-lg';
  }
  
  // Size based on display name length
  if (displayName.length > 21) {
    return 'text-sm';
  } else if (displayName.length > 18) {
    return 'text-base';
  } else if (displayName.length > 12) {
    return 'text-lg';
  }
  
  return 'text-xl';
}