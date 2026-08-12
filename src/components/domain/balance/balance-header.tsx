import type { ReactElement } from 'react';
import { AssetIcon } from '@/components/domain/asset/asset-icon';
import type { TokenBalance } from '@/core/counterparty/api';
import { formatAmount } from '@/core/format';
import { toBigNumber } from '@/core/numeric';

/**
 * Props for the BalanceHeader component.
 */
interface BalanceHeaderProps {
  /** The token balance to display */
  balance: TokenBalance;
  /** Optional CSS classes */
  className?: string;
  /**
   * Display units arriving from unconfirmed transactions. Never part of the balance figure —
   * unconfirmed money in is not money you can spend — so it renders with an explicit plus.
   */
  pendingIncoming?: string;
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
/**
 * Displays a balance. It must not write the shared balance cache.
 *
 * It used to, unguarded, from a `balance` prop every caller builds inline — so it wrote on every
 * render, with a value the caller was still catching up to. `useAssetBalance` owns that cache and
 * (since #291) depends on it, so the two overwrote each other and the dispenser form's balance
 * alternated between 0 and the real amount at render speed.
 */
export const BalanceHeader = ({
  balance,
  className = '',
  pendingIncoming,
}: BalanceHeaderProps): ReactElement => {
  const hasIncoming = !!pendingIncoming && toBigNumber(pendingIncoming).isGreaterThan(0);
  const pendingDigits = {
    minimumFractionDigits: 0,
    maximumFractionDigits: balance.asset_info?.divisible ? 8 : 0,
    useGrouping: true,
  };
  // Format the balance based on divisibility
  const formattedBalance = balance.quantity_normalized
    ? formatAmount({
        value: balance.quantity_normalized,
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
        <p className="text-sm text-gray-600">
          Balance: {formattedBalance}
          {/* The only annotation left, and it says something the number cannot: money arriving,
              never part of the figure until confirmed. Plus sign so it cannot be misread as a
              deduction. Outgoing needs no note (the figure already IS spendable), and the
              unreadable-pending state renders nothing either — it occurs only on malformed node
              responses, the shown figure is still the true confirmed balance, and a note nobody
              can act on or explain is noise (the flag still exists on AssetDetails for anything
              that later wants to gate on it). */}
          {hasIncoming && (
            <span className="text-xs italic text-gray-400">
              {' '}(+{formatAmount({ value: pendingIncoming!, ...pendingDigits })} incoming)
            </span>
          )}
        </p>
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