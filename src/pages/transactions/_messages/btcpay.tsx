import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount } from "@/core/format";

/**
 * Renders detailed information for btcpay transactions
 */
export function btcpay(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];

  // Use API-provided normalized values (verbose=true always returns these)
  const btcAmount = params.btc_amount_normalized;
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: "Type",
      value: "BTC Payment (Order Settlement)",
    },
    {
      label: "Order Match ID",
      value: (
        <span className="text-xs break-all font-mono">
          {params.order_match_id}
        </span>
      ),
    },
    {
      label: "BTC Amount",
      value: `${formatAmount({
        value: btcAmount,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
    },
  ];
  
  // Status
  if (params.status) {
    fields.push({
      label: "Status",
      value: params.status === "valid" ? "✅ Valid Payment" : params.status,
    });
  }
  
  return fields;
}