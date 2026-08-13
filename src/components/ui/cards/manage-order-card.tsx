import type { ReactElement } from "react";
import { useNavigate } from "react-router";
import { AssetIcon } from "@/components/domain/asset/asset-icon";
import { PendingStatus } from "@/components/domain/balance/pending-status";
import type { Order } from "@/core/counterparty/api";
import { formatAmount, formatAsset } from "@/core/format";
import { getOrderBaseAmount, getTradingPair, isBuyOrder } from "@/core/tradingPair";

interface ManageOrderCardProps {
  order: Order;
  /**
   * True when a cancel of this order is already in the mempool. The Cancel button stands down —
   * a second cancel of the same order can only fail and burn its fee.
   */
  isCancelling?: boolean;
  className?: string;
}

/**
 * ManageOrderCard displays a user's own DEX order with cancel action.
 * Compact layout: Icon | Name + Buy/Sell remaining | Cancel button
 */
export function ManageOrderCard({
  order,
  isCancelling = false,
  className = "",
}: ManageOrderCardProps): ReactElement {
  const navigate = useNavigate();
  const isOpen = order.status === "open";

  // Determine canonical trading pair and direction
  const [baseAsset, quoteAsset] = getTradingPair(order.give_asset, order.get_asset);
  const isBuy = isBuyOrder(order.give_asset, order.get_asset);
  // A subasset's canonical name is numeric; the longname is what the user recognizes. Each side's
  // info is whichever of give/get that side came from — the sibling market card matched only the
  // base side and this one matched neither, so a cancel list read A95428956661682177.
  const infoFor = (asset: string) =>
    asset === order.give_asset ? order.give_asset_info : order.get_asset_info;
  const baseDisplay = formatAsset(baseAsset, { assetInfo: infoFor(baseAsset) });
  const quoteDisplay = formatAsset(quoteAsset, { assetInfo: infoFor(quoteAsset) });

  // Get remaining amount in base asset terms
  const remainingAmount = getOrderBaseAmount(order, baseAsset);

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/compose/order/cancel/${order.tx_hash}`);
  };

  const handleClick = () => {
    navigate(`/market/orders/${baseAsset}/${quoteAsset}`);
  };

  return (
    // Opening the order is a button, not the whole card: Cancel sits inside, and
    // a card-level key handler swallowed Enter before Cancel could act on it.
    <div
      className={`bg-white rounded-lg shadow-sm p-3 hover:shadow-md transition-shadow ${className}`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleClick}
          className="flex flex-1 min-w-0 items-center gap-3 text-left cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <AssetIcon asset={baseAsset} size="md" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 text-sm truncate">
              {baseDisplay}/{quoteDisplay}
            </div>
            <div className="text-xs text-gray-500">
              <span className={isBuy ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                {isBuy ? "Buy" : "Sell"}
              </span>
              {" "}{formatAmount({ value: remainingAmount, maximumFractionDigits: 2 })} remaining
            </div>
          </div>
        </button>
        {isOpen ? (
          isCancelling ? (
            <PendingStatus label="Cancelling" className="px-3 py-1.5" />
          ) : (
            <button type="button"
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Cancel
            </button>
          )
        ) : (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 capitalize">
            {order.status}
          </span>
        )}
      </div>
    </div>
  );
}
