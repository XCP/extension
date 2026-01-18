import { type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { FaExternalLinkAlt } from "@/components/icons";
import { AssetIcon } from "@/components/asset-icon";
import { Button } from "@/components/button";
import { formatAmount } from "@/utils/format";
import type { Order } from "@/utils/blockchain/counterparty/api";

interface ManageOrderCardProps {
  order: Order;
  className?: string;
}

/**
 * ManageOrderCard displays a user's own DEX order with cancel action.
 */
export function ManageOrderCard({
  order,
  className = "",
}: ManageOrderCardProps): ReactElement {
  const navigate = useNavigate();

  return (
    <div className={`bg-white rounded-lg shadow-sm p-3 ${className}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <AssetIcon asset={order.give_asset} size="sm" />
          <div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-gray-900">{order.give_asset}</span>
              <span className="text-gray-400">→</span>
              <span className="font-medium text-gray-900">{order.get_asset}</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {formatAmount({ value: Number(order.give_remaining_normalized), maximumFractionDigits: 4 })} / {formatAmount({ value: Number(order.give_quantity_normalized), maximumFractionDigits: 4 })} remaining
            </div>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
          order.status === "open" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
        }`}>
          {order.status}
        </span>
      </div>
      <div className="flex gap-2">
        <Button
          color="gray"
          onClick={() => navigate(`/compose/cancel/${order.tx_hash}`)}
          fullWidth
        >
          Cancel
        </Button>
        <button
          onClick={() => window.open(`https://www.xcp.io/tx/${order.tx_hash}`, "_blank")}
          className="px-3 py-2 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="View on XCP.io"
        >
          <FaExternalLinkAlt className="size-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
