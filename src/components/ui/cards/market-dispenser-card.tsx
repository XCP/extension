import { type ReactElement, type KeyboardEvent, type MouseEvent } from "react";
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import { formatAmount } from "@/utils/format";
import type { DispenserDetails } from "@/utils/blockchain/counterparty/api";

interface MarketDispenserCardProps {
  dispenser: DispenserDetails;
  formattedPrice?: string;
  onClick?: () => void;
  onAssetClick?: () => void;
  className?: string;
}

/**
 * MarketDispenserCard displays a dispenser for browsing/purchasing.
 * Shows asset icon, name, price, and remaining supply.
 */
export function MarketDispenserCard({
  dispenser,
  formattedPrice,
  onClick,
  onAssetClick,
  className = "",
}: MarketDispenserCardProps): ReactElement {
  const assetName = dispenser.asset_info?.asset_longname || dispenser.asset;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick();
    }
  };

  const handleAssetClick = (e: MouseEvent) => {
    if (onAssetClick) {
      e.stopPropagation();
      onAssetClick();
    }
  };

  return (
    <div
      className={`bg-white rounded-lg shadow-sm p-3 ${onClick ? "hover:shadow-md transition-shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" : ""} ${className}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-center gap-3">
        <AssetIcon asset={dispenser.asset} size="md" />
        <div className="flex-1 min-w-0">
          {onAssetClick ? (
            <button
              onClick={handleAssetClick}
              className="font-medium text-blue-600 hover:text-blue-800 text-sm truncate text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              {assetName}
            </button>
          ) : (
            <div className="font-medium text-gray-900 text-sm truncate">{assetName}</div>
          )}
          <div className="text-xs text-gray-500">
            {formatAmount({ value: Number(dispenser.give_quantity_normalized), maximumFractionDigits: 2 })} per dispense
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-green-600">
            {formattedPrice ?? `${formatAmount({ value: dispenser.satoshirate, maximumFractionDigits: 0 })} sats`}
          </div>
          <div className="text-xs text-gray-400">
            {formatAmount({ value: Number(dispenser.give_remaining_normalized), maximumFractionDigits: 0 })} remaining
          </div>
        </div>
      </div>
    </div>
  );
}
