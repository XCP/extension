import { type ReactElement, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import { formatAmount } from "@/utils/format";
import { getTradingPair, getOrderBaseAmount, isBuyOrder } from "@/utils/trading-pair";
import type { Order } from "@/utils/blockchain/counterparty/api";

interface ManageOrderCardProps {
  order: Order;
  className?: string;
}

/**
 * ManageOrderCard displays a user's own DEX order with cancel action.
 * Compact layout: Icon | Name + Buy/Sell remaining | Cancel button
 */
export function ManageOrderCard({
  order,
  className = "",
}: ManageOrderCardProps): ReactElement {
  const navigate = useNavigate();
  const isOpen = order.status === "open";

  // Determine canonical trading pair and direction
  const [baseAsset, quoteAsset] = getTradingPair(order.give_asset, order.get_asset);
  const isBuy = isBuyOrder(order.give_asset, order.get_asset);
  const baseDisplay = baseAsset;

  // Get remaining amount in base asset terms
  const remainingAmount = getOrderBaseAmount(order, baseAsset);

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/compose/order/cancel/${order.tx_hash}`);
  };

  const handleClick = () => {
    navigate(`/market/orders/${baseAsset}/${quoteAsset}`);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className={`bg-white rounded-lg shadow-sm p-3 hover:shadow-md transition-shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center gap-3">
        <AssetIcon asset={baseAsset} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 text-sm truncate">
            {baseDisplay}/{quoteAsset}
          </div>
          <div className="text-xs text-gray-500">
            <span className={isBuy ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
              {isBuy ? "Buy" : "Sell"}
            </span>
            {" "}{formatAmount({ value: remainingAmount, maximumFractionDigits: 2 })} remaining
          </div>
        </div>
        {isOpen ? (
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Cancel
          </button>
        ) : (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 capitalize">
            {order.status}
          </span>
        )}
      </div>
    </div>
  );
}
