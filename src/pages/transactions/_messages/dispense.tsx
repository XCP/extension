import { type ReactNode } from "react";
import { formatAmount } from "@/utils/format";
import type { Transaction } from "@/utils/blockchain/counterparty/api";

/**
 * Renders detailed information for dispense transactions (when someone uses a dispenser)
 */
export function dispense(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  // For dispense transactions, data is in the events array
  const dispenseEvent = tx.events?.find((e: any) => e.event === 'DISPENSE');
  
  if (!dispenseEvent?.params) {
    // Fallback to transaction root data (use normalized value)
    const btcAmount = Number(tx.btc_amount_normalized ?? 0);
    return [
      {
        label: "Dispenser Address",
        value: tx.destination || "N/A",
      },
      {
        label: "BTC Paid",
        value: `${formatAmount({
          value: btcAmount,
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        })} BTC`,
      },
    ];
  }
  
  const params = dispenseEvent.params;
  const isDivisible = params.asset_info?.divisible ?? true;

  // Use API-provided normalized values (verbose=true always returns these)
  const quantityReceived = Number(params.dispense_quantity_normalized);
  const btcPaid = Number(params.btc_amount_normalized);
    
  const pricePerUnit = quantityReceived > 0 ? btcPaid / quantityReceived : 0;
  
  return [
    {
      label: "Original Dispenser TX",
      value: params.dispenser_tx_hash ? (
        <span className="text-xs break-all font-mono">
          {params.dispenser_tx_hash}
        </span>
      ) : "N/A",
    },
    {
      label: "Asset Received",
      value: params.asset || "N/A",
    },
    {
      label: "Quantity Received",
      value: `${formatAmount({
        value: quantityReceived,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    },
    {
      label: "BTC Paid",
      value: `${formatAmount({
        value: btcPaid,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
    },
    {
      label: "Effective Price",
      value: pricePerUnit > 0 ? `${formatAmount({
        value: pricePerUnit,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC per ${params.asset}` : "N/A",
    },
    {
      label: "From Dispenser",
      value: (
        <span className="text-xs break-all">
          {params.source || "N/A"}
        </span>
      ),
    },
    {
      label: "To Address",
      value: (
        <span className="text-xs break-all">
          {params.destination || "N/A"}
        </span>
      ),
    },
    {
      label: "Dispense Index",
      value: params.dispense_index !== undefined ? 
        `#${params.dispense_index}` : "N/A",
    },
  ];
}