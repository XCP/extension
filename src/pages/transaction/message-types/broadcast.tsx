import { type ReactNode } from "react";
import type { Transaction } from "@/utils/blockchain/counterparty";

/**
 * Renders detailed information for broadcast transactions
 */
export function broadcast(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [];
  
  // Determine broadcast type
  let broadcastType = "General Broadcast";
  if (params.text && params.text.startsWith("options ")) {
    broadcastType = "Address Options";
  } else if (params.value !== undefined && params.value !== null) {
    broadcastType = "Oracle Broadcast";
  }
  
  fields.push({
    label: "Type",
    value: broadcastType,
  });
  
  // Text content
  if (params.text) {
    fields.push({
      label: "Text",
      value: (
        <div className="break-all font-mono text-xs">
          {params.text}
        </div>
      ),
    });
  }
  
  // Oracle value
  if (params.value !== undefined && params.value !== null) {
    fields.push({
      label: "Value",
      value: params.value.toString(),
    });
  }
  
  // Fee fraction
  if (params.fee_fraction !== undefined) {
    const feePercentage = (params.fee_fraction / 10000).toFixed(2);
    fields.push({
      label: "Fee Fraction",
      value: `${params.fee_fraction} (${feePercentage}%)`,
    });
  }
  
  // Timestamp
  if (params.timestamp) {
    fields.push({
      label: "Timestamp",
      value: new Date(params.timestamp * 1000).toLocaleString(),
    });
  }
  
  // Lock status
  if (params.locked !== undefined) {
    fields.push({
      label: "Locked",
      value: params.locked ? "🔒 Yes" : "🔓 No",
    });
  }
  
  return fields;
}