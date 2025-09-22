import { type ReactNode } from "react";
import { formatAmount } from "@/utils/format";
import { fromSatoshis } from "@/utils/numeric";
import type { Transaction } from "@/utils/blockchain/counterparty/api";

/**
 * Renders detailed information for dividend transactions
 */
export function dividend(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  const quantityPerUnit = fromSatoshis(params.quantity_per_unit, true);
  const isDivisibleDividend = params.dividend_asset_info?.divisible ?? true;
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: "Type",
      value: "Dividend Distribution",
    },
    {
      label: "Asset",
      value: params.asset,
    },
    {
      label: "Dividend Asset",
      value: params.dividend_asset,
    },
    {
      label: "Quantity per Unit",
      value: `${formatAmount({
        value: quantityPerUnit,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} ${params.dividend_asset} per ${params.asset}`,
    },
  ];
  
  // Calculate total if we have holder information
  if (params.total_distributed !== undefined) {
    fields.push({
      label: "Total Distributed",
      value: `${formatAmount({
        value: isDivisibleDividend ? fromSatoshis(params.total_distributed, true) : params.total_distributed,
        minimumFractionDigits: isDivisibleDividend ? 8 : 0,
        maximumFractionDigits: isDivisibleDividend ? 8 : 0,
      })} ${params.dividend_asset}`,
    });
  }
  
  // Number of holders
  if (params.holder_count !== undefined) {
    fields.push({
      label: "Holders Receiving",
      value: params.holder_count.toString(),
    });
  }
  
  // Add any filters applied
  if (params.filters) {
    fields.push({
      label: "Filters Applied",
      value: params.filters,
    });
  }
  
  return fields;
}