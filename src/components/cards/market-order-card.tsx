import { type ReactElement, type KeyboardEvent } from "react";
import { FaExchangeAlt } from "@/components/icons";
import { AssetIcon } from "@/components/asset-icon";
import { formatAmount } from "@/utils/format";
import type { Order, OrderDetails } from "@/utils/blockchain/counterparty/api";

interface MarketOrderCardProps {
  order: Order | OrderDetails;
  onClick?: () => void;
  className?: string;
}

/**
 * MarketOrderCard displays a DEX order for browsing/matching.
 * Shows assets being traded, price, and available quantity.
 */
export function MarketOrderCard({
  order,
  onClick,
  className = "",
}: MarketOrderCardProps): ReactElement {
  // Handle both Order and OrderDetails types - only OrderDetails has asset_info
  const orderDetails = order as OrderDetails;
  const giveAsset = orderDetails.give_asset_info?.asset_longname || order.give_asset;
  const getAsset = orderDetails.get_asset_info?.asset_longname || order.get_asset;
  const price = Number(order.get_quantity_normalized) / Number(order.give_quantity_normalized);

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
        <AssetIcon asset={order.give_asset} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-900 truncate max-w-[80px]">{giveAsset}</span>
            <FaExchangeAlt className="text-gray-400 size-3 flex-shrink-0" aria-hidden="true" />
            <span className="text-gray-600 truncate max-w-[80px]">{getAsset}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {formatAmount({ value: Number(order.give_remaining_normalized), maximumFractionDigits: 2 })} available
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-blue-600">
            {formatAmount({ value: price, maximumFractionDigits: 8 })}
          </div>
          <div className="text-xs text-gray-400">{getAsset}/unit</div>
        </div>
      </div>
    </div>
  );
}
