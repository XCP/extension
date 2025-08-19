import { type ReactNode } from "react";
import { formatAmount, formatDate } from "@/utils/format";
import type { Transaction } from "@/utils/blockchain/counterparty";

/**
 * Renders detailed information for bet transactions
 */
export function bet(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [];
  
  // Bet type
  const betTypeMap: Record<number, string> = {
    0: "Bull CFD",
    1: "Bear CFD",
    2: "Equal",
    3: "Not Equal",
  };
  
  fields.push({
    label: "Bet Type",
    value: betTypeMap[params.bet_type] || `Type ${params.bet_type}`,
  });
  
  fields.push({
    label: "Feed Address",
    value: (
      <span className="text-xs break-all">
        {params.feed_address}
      </span>
    ),
  });
  
  // Wager amount
  fields.push({
    label: "Wager",
    value: `${formatAmount({
      value: params.wager_quantity / 1e8,
      minimumFractionDigits: 8,
      maximumFractionDigits: 8,
    })} XCP`,
  });
  
  // Counterwager amount
  fields.push({
    label: "Counterwager",
    value: `${formatAmount({
      value: params.counterwager_quantity / 1e8,
      minimumFractionDigits: 8,
      maximumFractionDigits: 8,
    })} XCP`,
  });
  
  // Calculate odds
  const odds = params.wager_quantity / (params.wager_quantity + params.counterwager_quantity) * 100;
  fields.push({
    label: "Odds",
    value: `${odds.toFixed(2)}% / ${(100 - odds).toFixed(2)}%`,
  });
  
  // Deadline
  if (params.deadline) {
    fields.push({
      label: "Deadline",
      value: formatDate(params.deadline * 1000),
    });
  }
  
  // Target value for Equal/NotEqual bets
  if (params.target_value !== undefined && (params.bet_type === 2 || params.bet_type === 3)) {
    fields.push({
      label: "Target Value",
      value: params.target_value.toString(),
    });
  }
  
  // Leverage for CFD bets
  if (params.leverage !== undefined && (params.bet_type === 0 || params.bet_type === 1)) {
    fields.push({
      label: "Leverage",
      value: `${params.leverage}x`,
    });
  }
  
  // Expiration
  if (params.expiration !== undefined) {
    fields.push({
      label: "Expiration",
      value: params.expiration === 0 ? "Never" : `${params.expiration} blocks`,
    });
  }
  
  // Status
  if (params.status) {
    const statusMap: Record<string, string> = {
      "open": "🟢 Open",
      "filled": "✅ Filled",
      "cancelled": "❌ Cancelled",
      "expired": "⏰ Expired",
      "settled": "💰 Settled",
    };
    
    fields.push({
      label: "Status",
      value: statusMap[params.status] || params.status,
    });
  }
  
  return fields;
}