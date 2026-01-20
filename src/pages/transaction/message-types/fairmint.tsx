import { type ReactNode } from "react";
import { formatAmount } from "@/utils/format";
import type { Transaction } from "@/utils/blockchain/counterparty/api";

/**
 * Renders detailed information for fairmint transactions
 */
export function fairmint(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];

  // Use API-provided normalized values (verbose=true always returns these)
  const isDivisible = params.asset_info?.divisible ?? true;
  const quantity = Number(params.quantity_normalized);

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
        value: quantity,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    },
  ];

  // Commission if applicable
  if (params.commission_normalized !== undefined && Number(params.commission_normalized) > 0) {
    fields.push({
      label: "Commission Paid",
      value: `${formatAmount({
        value: Number(params.commission_normalized),
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    });
  }

  // Price paid (if XCP model)
  if (params.paid_quantity_normalized !== undefined && Number(params.paid_quantity_normalized) > 0) {
    const paidQuantity = Number(params.paid_quantity_normalized);
    fields.push({
      label: "XCP Paid",
      value: `${formatAmount({
        value: paidQuantity,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} XCP`,
    });

    // Calculate effective price
    const effectivePrice = paidQuantity / quantity;
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