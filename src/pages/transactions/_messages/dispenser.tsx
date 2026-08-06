import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount } from "@/core/format";
import { divide, isGreaterThan, multiply, roundDown } from "@/core/numeric";

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
  
  // Use API-provided normalized values (verbose=true always returns these)
  const isDivisible = params.asset_info?.divisible ?? true;
  const giveQuantity = params.give_quantity_normalized;
  const escrowQuantity = params.escrow_quantity_normalized;
  const btcPerDispense = params.satoshirate_normalized;
  
  // Derived from the normalized strings, so a large escrow does not lose digits on the way. A
  // missing or zero give quantity has no answer here — substituting one would put a plausible
  // number on the screen that nothing in the transaction says.
  const canDerive = escrowQuantity !== undefined
    && giveQuantity !== undefined
    && isGreaterThan(giveQuantity, 0);
  const totalDispenses = canDerive ? divide(escrowQuantity, giveQuantity) : null;
  const totalBtcValue = totalDispenses !== null && btcPerDispense !== undefined
    ? multiply(totalDispenses, btcPerDispense)
    : null;
  
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
  if (params.give_remaining_normalized !== undefined) {
    const giveRemaining = params.give_remaining_normalized;
    const remainingDispenses = canDerive && giveRemaining !== undefined
      ? roundDown(divide(giveRemaining, giveQuantity))
      : null;
    
    fields.push({
      label: "Remaining in Escrow",
      value: `${formatAmount({
        value: giveRemaining,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    });
    
    if (remainingDispenses !== null) {
      fields.push({
        label: "Remaining Dispenses",
        value: remainingDispenses.toFixed(),
      });
    }
  }

  // Add total calculations, when the transaction says enough to work them out.
  if (totalDispenses !== null) {
    fields.push({
      label: "Max Dispenses",
      value: roundDown(totalDispenses).toFixed(),
    });
  }

  if (totalBtcValue !== null) {
    fields.push({
      label: "Total BTC Value",
      value: `${formatAmount({
        value: totalBtcValue,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
    });
  }

  // Add oracle address if present
  if (params.oracle_address) {
    fields.push({
      label: "Oracle Address",
      value: params.oracle_address,
    });
  }

  return fields;
}