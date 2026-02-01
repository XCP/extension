import { type ReactElement, type KeyboardEvent } from "react";
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import { formatAmount } from "@/utils/format";
import type { DispenserDetails } from "@/utils/blockchain/counterparty/api";

interface MarketDispenserCardProps {
  dispenser: DispenserDetails;
  formattedPrice?: string;
  onClick?: () => void;
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
  className = "",
}: MarketDispenserCardProps): ReactElement {
  const assetName = dispenser.asset_info?.asset_longname || dispenser.asset;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (onClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick();
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
          <div className="flex justify-between">
            <span className="font-medium text-blue-600 text-sm truncate">{assetName}</span>
            {Number(dispenser.give_quantity_normalized) !== 1 && (
              <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                {formatAmount({ value: Number(dispenser.give_quantity_normalized), maximumFractionDigits: 2 })} per dispense
              </span>
            )}
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{formattedPrice ?? `${formatAmount({ value: dispenser.satoshirate, maximumFractionDigits: 0 })} sats`}</span>
            <span>{formatAmount({ value: Number(dispenser.give_remaining_normalized), maximumFractionDigits: 0 })} remaining</span>
          </div>
        </div>
      </div>
    </div>
  );
}
