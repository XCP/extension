import React, { type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { AssetIcon } from "@/components/asset-icon";
import { BalanceMenu } from "@/components/menus/balance-menu";
import type { TokenBalance } from "@/utils/blockchain/counterparty";
import { formatAmount, formatAsset } from "@/utils/format";

/**
 * Props interface for the BalanceCard component
 */
interface BalanceCardProps {
  /** The token balance data to display */
  token: TokenBalance;
  /** Optional custom click handler - if not provided, defaults to navigation to send page */
  onClick?: (asset: string) => void;
  /** Whether to show the balance menu - defaults to true */
  showMenu?: boolean;
  /** Optional custom CSS classes */
  className?: string;
}

/**
 * BalanceCard Component
 * 
 * A reusable card component for displaying token balance information including:
 * - Asset icon and formatted name
 * - Formatted balance amount with proper decimal places
 * - Optional balance menu for actions
 * - Click navigation to send composition page
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
  className = ""
}: BalanceCardProps): ReactElement {
  const navigate = useNavigate();

  // Handle card click - use custom handler or default to send navigation
  const handleClick = () => {
    if (onClick) {
      onClick(token.asset);
    } else {
      navigate(`/compose/send/${encodeURIComponent(token.asset)}`);
    }
  };

  // Determine if the asset is divisible for proper decimal formatting
  const isDivisible = token.asset_info?.divisible ?? false;

  return (
    <div
      className={`relative flex items-center p-3 bg-white rounded-lg shadow-sm cursor-pointer hover:bg-gray-50 ${className}`}
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
        
        {/* Balance Amount */}
        <div className="text-sm text-gray-500">
          {formatAmount({
            value: Number(token.quantity_normalized),
            minimumFractionDigits: isDivisible ? 8 : 0,
            maximumFractionDigits: isDivisible ? 8 : 0,
            useGrouping: true,
          })}
        </div>
      </div>

      {/* Balance Menu (if enabled) */}
      {showMenu && (
        <div className="absolute top-2 right-2">
          <BalanceMenu asset={token.asset} />
        </div>
      )}
    </div>
  );
}

export default BalanceCard;