import { type ReactNode } from "react";
import type { Transaction } from "@/utils/blockchain/counterparty";

/**
 * Renders detailed information for move_utxo transactions
 */
export function move_utxo(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: "Type",
      value: "UTXO Move",
    },
  ];
  
  // Destination
  if (params.destination) {
    fields.push({
      label: "Destination",
      value: (
        <span className="text-xs break-all">
          {params.destination}
        </span>
      ),
    });
  } else {
    fields.push({
      label: "Destination",
      value: "Same as source (consolidation)",
    });
  }
  
  // Show moved UTXOs if available
  if (params.utxos && params.utxos.length > 0) {
    fields.push({
      label: "UTXOs Moved",
      value: `${params.utxos.length} UTXO${params.utxos.length > 1 ? 's' : ''}`,
    });
  }
  
  return fields;
}