import { type ReactNode } from "react";
import { formatAmount } from "@/utils/format";
import type { Transaction } from "@/utils/blockchain/counterparty";

/**
 * Renders detailed information for dispenser transactions
 */
export function dispenser(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  // Try to get params from unpacked_data first, then check events
  let params = tx.unpacked_data?.params;
  if (!params) {
    const dispenserEvent = tx.events?.find((e: any) => 
      e.event === 'DISPENSER' || 
      e.event === 'OPEN_DISPENSER' || 
      e.event === 'DISPENSER_UPDATE'
    );
    params = dispenserEvent?.params;
  }
  if (!params) return [];
  
  const isDivisible = params.asset_info?.divisible ?? true;
  const giveQuantity = isDivisible ? params.give_quantity / 1e8 : params.give_quantity;
  const escrowQuantity = isDivisible ? params.escrow_quantity / 1e8 : params.escrow_quantity;
  const satoshirate = params.satoshirate || params.mainchainrate;
  const btcPerDispense = satoshirate / 1e8;
  
  // Calculate derived values
  const totalDispenses = escrowQuantity / giveQuantity;
  const totalBtcValue = totalDispenses * btcPerDispense;
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: "Asset",
      value: params.asset,
    },
    {
      label: "Status",
      value: params.status === 0 ? "🟢 Open" : 
             params.status === 10 ? "🔴 Closed" : 
             params.status === 11 ? "⚠️ Closing" : "Unknown",
    },
    {
      label: "Give per Dispense",
      value: `${formatAmount({
        value: giveQuantity,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    },
    {
      label: "Price per Dispense",
      value: `${formatAmount({
        value: btcPerDispense,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
    },
    {
      label: "Total Escrow",
      value: `${formatAmount({
        value: escrowQuantity,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    },
  ];

  // Add remaining quantity if available
  if (params.give_remaining !== undefined) {
    const giveRemaining = isDivisible ? params.give_remaining / 1e8 : params.give_remaining;
    const remainingDispenses = Math.floor(giveRemaining / giveQuantity);
    
    fields.push({
      label: "Remaining in Escrow",
      value: `${formatAmount({
        value: giveRemaining,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    });
    
    fields.push({
      label: "Remaining Dispenses",
      value: remainingDispenses.toString(),
    });
  }

  // Add total calculations
  fields.push({
    label: "Max Dispenses",
    value: Math.floor(totalDispenses).toString(),
  });
  
  fields.push({
    label: "Total BTC Value",
    value: `${formatAmount({
      value: totalBtcValue,
      minimumFractionDigits: 8,
      maximumFractionDigits: 8,
    })} BTC`,
  });

  // Add oracle address if present
  if (params.oracle_address) {
    fields.push({
      label: "Oracle Address",
      value: params.oracle_address,
    });
  }

  return fields;
}