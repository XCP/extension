import type { ReactElement } from "react";
import { useNavigate } from "react-router";
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import { BalanceMenu } from "@/components/domain/balance/balance-menu";
import { PendingStatus } from "@/components/domain/balance/pending-status";
import type { TokenBalance } from "@/core/counterparty/api";
import { formatAmount, formatAsset } from "@/core/format";

/**
 * Props interface for the BalanceCard component
 */
interface BalanceCardProps {
  /** The token balance data to display */
  token: TokenBalance;
  /** Optional custom click handler - if not provided, defaults to navigation to balance page */
  onClick?: (asset: string) => void;
  /** Whether to show the balance menu - defaults to true */
  showMenu?: boolean;
  /** Optional custom CSS classes */
  className?: string;
  /**
   * What the mempool is doing to this asset, e.g. "Sending". Shown bottom-right in italics beside
   * the amount. The amount itself is the confirmed balance and is never adjusted to match.
   */
  pendingStatus?: string;
}

/**
 * BalanceCard Component
 * 
 * A reusable card component for displaying token balance information including:
 * - Asset icon and formatted name
 * - Formatted balance amount with proper decimal places
 * - Optional balance menu for actions
 * - Click navigation to balance detail page
 * 
 * @param props - The component props
 * @returns A ReactElement representing the balance card
 * 
 * @example
 * ```tsx
 * <BalanceCard 
 *   token={balance} 
 *   onClick={(asset) => navigate(`/custom/${asset}`)}
 *   showMenu={false}
 * />
 * ```
 */
export function BalanceCard({
  token,
  onClick,
  showMenu = true,
  className = "",
  pendingStatus,
}: BalanceCardProps): ReactElement {
  const navigate = useNavigate();

  // Handle card click - use custom handler or default to balance navigation
  const handleClick = () => {
    if (onClick) {
      onClick(token.asset);
    } else {
      navigate(`/assets/${encodeURIComponent(token.asset)}/balance`);
    }
  };

  // Determine if the asset is divisible for proper decimal formatting
  const isDivisible = token.asset_info?.divisible ?? false;

  return (
    // The card is a container, not a control: the menu is its own button, and a
    // button cannot contain another one. Opening the balance is the button here.
    <div className={`relative bg-white rounded-lg shadow-sm ${className}`}>
      <button
        type="button"
        className="flex w-full items-center p-4 text-left rounded-lg cursor-pointer hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        onClick={handleClick}
      >
        {/* Asset Icon */}
        <AssetIcon asset={token.asset} size="lg" className="flex-shrink-0" />

        {/* Asset Information */}
        <div className="ml-3 flex-grow">
          {/* Asset Name/Symbol */}
          <div className="font-medium text-sm text-gray-900">
            {formatAsset(token.asset, { assetInfo: token.asset_info, shorten: true })}
          </div>

          {/* Balance amount, with whatever the mempool is doing to it on the right. */}
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-gray-500">
              {formatAmount({
                value: token.quantity_normalized,
                minimumFractionDigits: isDivisible ? 8 : 0,
                maximumFractionDigits: isDivisible ? 8 : 0,
                useGrouping: true,
              })}
            </span>
            {/* Reserve room for the menu button, which floats over the card's top right. */}
            {pendingStatus && <PendingStatus label={pendingStatus} className="ml-2 mr-6" />}
          </div>
        </div>
      </button>

      {/* Balance Menu (if enabled) */}
      {showMenu && (
        <div className="absolute top-2 right-2">
          <BalanceMenu asset={token.asset} />
        </div>
      )}
    </div>
  );
}

