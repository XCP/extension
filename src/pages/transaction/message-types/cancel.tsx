import { type ReactNode } from "react";
import type { Transaction } from "@/utils/blockchain/counterparty";

/**
 * Renders detailed information for cancel transactions
 */
export function cancel(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  return [
    {
      label: "Type",
      value: "Order Cancellation",
    },
    {
      label: "Cancelled Order TX",
      value: (
        <span className="text-xs break-all font-mono">
          {params.offer_hash}
        </span>
      ),
    },
    {
      label: "Status",
      value: "✅ Cancelled Successfully",
    },
  ];
}