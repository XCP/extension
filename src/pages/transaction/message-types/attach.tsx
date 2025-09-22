import { type ReactNode } from "react";
import { formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";
import type { Transaction } from "@/utils/blockchain/counterparty/api";

/**
 * Renders detailed information for attach (UTXO attach) transactions
 */
export function attach(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  const isDivisible = params.asset_info?.divisible ?? true;
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: "Type",
      value: "UTXO Attach",
    },
    {
      label: "Asset",
      value: params.asset,
    },
    {
      label: "Quantity",
      value: `${formatAmount({
        value: isDivisible ? fromSatoshis(params.quantity, true) : params.quantity,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    },
  ];
  
  // Destination UTXO
  if (params.destination_vout !== undefined) {
    fields.push({
      label: "Destination UTXO",
      value: `Output #${params.destination_vout}`,
    });
  } else {
    fields.push({
      label: "Destination UTXO",
      value: "Same as source",
    });
  }
  
  // Show if it's a move or attach
  if (params.move !== undefined) {
    fields.push({
      label: "Operation",
      value: params.move ? "Move to UTXO" : "Attach to UTXO",
    });
  }
  
  return fields;
}