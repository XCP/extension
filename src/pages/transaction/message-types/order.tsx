import { type ReactNode, useState } from "react";
import { FaExchangeAlt } from "react-icons/fa";
import { formatAmount } from "@/utils/format";
import type { Transaction } from "@/utils/blockchain/counterparty";

/**
 * Interactive price display component for orders
 */
function PriceDisplay({ 
  giveAsset, 
  getAsset, 
  giveQuantity, 
  getQuantity 
}: {
  giveAsset: string;
  getAsset: string;
  giveQuantity: number;
  getQuantity: number;
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  
  const priceRatio = getQuantity / giveQuantity;
  
  const display = isFlipped
    ? `1 ${getAsset} = ${formatAmount({
        value: 1 / priceRatio,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} ${giveAsset}`
    : `1 ${giveAsset} = ${formatAmount({
        value: priceRatio,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} ${getAsset}`;
  
  return (
    <div className="flex items-center justify-between">
      <span>{display}</span>
      <button
        type="button"
        onClick={() => setIsFlipped(!isFlipped)}
        className="p-1 hover:bg-gray-100 rounded-full transition-colors ml-2"
        aria-label="Flip price ratio"
      >
        <FaExchangeAlt className="w-3 h-3 text-gray-600" />
      </button>
    </div>
  );
}

/**
 * Renders detailed information for order transactions
 */
export function order(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  // Try to get params from unpacked_data first, then check events
  let params = tx.unpacked_data?.params;
  if (!params) {
    const orderEvent = tx.events?.find((e: any) => 
      e.event === 'ORDER' || 
      e.event === 'OPEN_ORDER' ||
      e.event === 'NEW_ORDER'
    );
    params = orderEvent?.params;
  }
  if (!params) return [];
  
  const giveIsDivisible = params.give_asset_info?.divisible ?? true;
  const getIsDivisible = params.get_asset_info?.divisible ?? true;
  
  const giveQuantity = giveIsDivisible ? 
    params.give_quantity / 1e8 : 
    params.give_quantity;
  const getQuantity = getIsDivisible ? 
    params.get_quantity / 1e8 : 
    params.get_quantity;
  
  const giveRemaining = params.give_remaining !== undefined ?
    (giveIsDivisible ? params.give_remaining / 1e8 : params.give_remaining) :
    giveQuantity;
  const getRemaining = params.get_remaining !== undefined ?
    (getIsDivisible ? params.get_remaining / 1e8 : params.get_remaining) :
    getQuantity;
  
  // Calculate fill percentage
  const fillPercentage = giveQuantity > 0 ? 
    ((giveQuantity - giveRemaining) / giveQuantity * 100).toFixed(1) : 
    "0";
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: "Type",
      value: params.give_asset === "BTC" ? "Buy Order" : 
             params.get_asset === "BTC" ? "Sell Order" : 
             "Token Swap",
    },
    {
      label: "Status",
      value: params.status === "open" ? "🟢 Open" :
             params.status === "filled" ? "✅ Filled" :
             params.status === "cancelled" ? "❌ Cancelled" :
             params.status === "expired" ? "⏰ Expired" :
             params.status || "Unknown",
    },
    {
      label: "Give",
      value: `${formatAmount({
        value: giveQuantity,
        minimumFractionDigits: giveIsDivisible ? 8 : 0,
        maximumFractionDigits: giveIsDivisible ? 8 : 0,
      })} ${params.give_asset}`,
    },
    {
      label: "Get",
      value: `${formatAmount({
        value: getQuantity,
        minimumFractionDigits: getIsDivisible ? 8 : 0,
        maximumFractionDigits: getIsDivisible ? 8 : 0,
      })} ${params.get_asset}`,
    },
    {
      label: "Price",
      value: (
        <PriceDisplay
          giveAsset={params.give_asset}
          getAsset={params.get_asset}
          giveQuantity={giveQuantity}
          getQuantity={getQuantity}
        />
      ),
    },
  ];

  // Add remaining quantities if partially filled
  if (params.give_remaining !== undefined && giveRemaining < giveQuantity) {
    fields.push({
      label: "Give Remaining",
      value: `${formatAmount({
        value: giveRemaining,
        minimumFractionDigits: giveIsDivisible ? 8 : 0,
        maximumFractionDigits: giveIsDivisible ? 8 : 0,
      })} ${params.give_asset}`,
    });
    
    fields.push({
      label: "Get Remaining",
      value: `${formatAmount({
        value: getRemaining,
        minimumFractionDigits: getIsDivisible ? 8 : 0,
        maximumFractionDigits: getIsDivisible ? 8 : 0,
      })} ${params.get_asset}`,
    });
    
    fields.push({
      label: "Fill Progress",
      value: (
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full"
              style={{ width: `${fillPercentage}%` }}
            />
          </div>
          <span className="text-sm">{fillPercentage}%</span>
        </div>
      ),
    });
  }

  // Add expiration
  if (params.expiration !== undefined) {
    if (params.expiration === 0) {
      fields.push({
        label: "Expiration",
        value: "Never",
      });
    } else {
      const currentBlock = params.block_index || 0;
      const expiresAt = currentBlock + params.expiration;
      const blocksRemaining = expiresAt - currentBlock;
      
      fields.push({
        label: "Expiration",
        value: `${params.expiration} blocks (${blocksRemaining > 0 ? `${blocksRemaining} remaining` : "Expired"})`,
      });
    }
  }

  // Add fee details
  if (params.fee_required !== undefined && params.fee_required > 0) {
    fields.push({
      label: "Fee Required",
      value: `${formatAmount({
        value: params.fee_required / 1e8,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
    });
  }

  if (params.fee_provided !== undefined && params.fee_provided > 0) {
    fields.push({
      label: "Fee Provided",
      value: `${formatAmount({
        value: params.fee_provided / 1e8,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
    });
  }

  return fields;
}