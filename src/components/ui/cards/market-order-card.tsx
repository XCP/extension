import { type ReactElement, type KeyboardEvent } from "react";
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import { formatAmount } from "@/utils/format";
import { getTradingPair, getOrderPricePerUnit, getOrderBaseAmount, isBuyOrder } from "@/utils/trading-pair";
import type { Order, OrderDetails } from "@/utils/blockchain/counterparty/api";

interface MarketOrderCardProps {
  order: Order | OrderDetails;
  onClick?: () => void;
  className?: string;
}

/**
 * MarketOrderCard displays a DEX order for browsing on the market index.
 * Layout mirrors MarketDispenserCard: Icon | Name + details | Price
 */
export function MarketOrderCard({
  order,
  onClick,
  className = "",
}: MarketOrderCardProps): ReactElement {
  // Determine canonical trading pair order
  const [baseAsset, quoteAsset] = getTradingPair(order.give_asset, order.get_asset);
  const isBuy = isBuyOrder(order.give_asset, order.get_asset);

  // Handle both Order and OrderDetails types - only OrderDetails has asset_info
  const orderDetails = order as OrderDetails;
  const baseDisplay = (isBuy ? orderDetails.get_asset_info?.asset_longname : orderDetails.give_asset_info?.asset_longname) || baseAsset;

  // Calculate price and remaining amount using trading pair utilities
  const price = getOrderPricePerUnit(order, baseAsset);
  const remainingAmount = getOrderBaseAmount(order, baseAsset);

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
        <AssetIcon asset={baseAsset} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-blue-600 text-sm truncate">{baseDisplay}</div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>
              <span className={isBuy ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                {isBuy ? "Buy" : "Sell"}
              </span>
              {" @ "}{formatAmount({ value: price, maximumFractionDigits: 8 })} {quoteAsset}
            </span>
            <span>{formatAmount({ value: remainingAmount, maximumFractionDigits: 2 })} remaining</span>
          </div>
        </div>
      </div>
    </div>
  );
}
