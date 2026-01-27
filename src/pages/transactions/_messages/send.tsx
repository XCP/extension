import { type ReactNode } from "react";
import { formatAmount } from "@/utils/format";
import type { Transaction } from "@/utils/blockchain/counterparty/api";

/**
 * Renders detailed information for send transactions
 */
export function send(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  // Try to get params from unpacked_data first, then check events
  let params = tx.unpacked_data?.params;
  if (!params) {
    const sendEvent = tx.events?.find((e: any) => e.event === 'SEND' || e.event === 'ENHANCED_SEND');
    params = sendEvent?.params;
  }
  if (!params) return [];
  
  // Use API-provided normalized values (verbose=true always returns these)
  const isDivisible = params.asset_info?.divisible ?? false;
  const quantity = Number(params.quantity_normalized);
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: "Asset",
      value: params.asset,
    },
    {
      label: "Amount",
      value: `${formatAmount({
        value: quantity,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    },
  ];
  
  // Add memo if present
  if (params.memo) {
    fields.push({
      label: "Memo",
      value: (
        <div className="break-all">
          {params.memo}
        </div>
      ),
    });
  }
  
  // Add memo type if specified
  if (params.memo_type) {
    fields.push({
      label: "Memo Type",
      value: params.memo_type,
    });
  }
  
  // Show if it's an enhanced send
  if (params.enhanced_send || tx.unpacked_data?.message_type === 'enhanced_send') {
    fields.push({
      label: "Type",
      value: "Enhanced Send (with memo)",
    });
  }
  
  return fields;
}