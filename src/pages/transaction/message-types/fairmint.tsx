import { type ReactNode } from "react";
import { formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";
import type { Transaction } from "@/utils/blockchain/counterparty/api";

/**
 * Renders detailed information for fairmint transactions
 */
export function fairmint(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  const isDivisible = params.asset_info?.divisible ?? true;
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: "Type",
      value: "Fairmint",
    },
    {
      label: "Asset",
      value: params.asset,
    },
    {
      label: "Quantity Minted",
      value: `${formatAmount({
        value: isDivisible ? fromSatoshis(params.quantity, true) : params.quantity,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    },
  ];
  
  // Commission if applicable
  if (params.commission !== undefined && params.commission > 0) {
    const commissionAmount = isDivisible ? fromSatoshis(params.commission, true) : params.commission;
    fields.push({
      label: "Commission Paid",
      value: `${formatAmount({
        value: commissionAmount,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    });
  }
  
  // Price paid (if XCP model)
  if (params.paid !== undefined && params.paid > 0) {
    fields.push({
      label: "XCP Paid",
      value: `${formatAmount({
        value: fromSatoshis(params.paid, true),
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} XCP`,
    });
    
    // Calculate effective price
    const quantity = isDivisible ? fromSatoshis(params.quantity, true) : params.quantity;
    const effectivePrice = fromSatoshis(params.paid, true) / quantity;
    fields.push({
      label: "Effective Price",
      value: `${formatAmount({
        value: effectivePrice,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} XCP per ${params.asset}`,
    });
  }
  
  // Fairminter status
  if (params.fairminter_status !== undefined) {
    fields.push({
      label: "Fairminter Status",
      value: params.fairminter_status === 0 ? "Still Open" : "Closed After This",
    });
  }
  
  return fields;
}