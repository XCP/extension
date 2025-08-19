import { type ReactNode } from "react";
import { formatAmount } from "@/utils/format";
import type { Transaction } from "@/utils/blockchain/counterparty";

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
        value: isDivisible ? params.quantity / 1e8 : params.quantity,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    },
  ];
  
  // Commission if applicable
  if (params.commission !== undefined && params.commission > 0) {
    const commissionAmount = isDivisible ? params.commission / 1e8 : params.commission;
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
        value: params.paid / 1e8,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} XCP`,
    });
    
    // Calculate effective price
    const quantity = isDivisible ? params.quantity / 1e8 : params.quantity;
    const effectivePrice = params.paid / 1e8 / quantity;
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