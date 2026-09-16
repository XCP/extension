import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount } from "@/core/format";

import { t } from '@/i18n';
/**
 * Renders detailed information for dividend transactions
 */
export function dividend(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];

  // Use API-provided normalized values (verbose=true always returns these)
  const quantityPerUnit = params.quantity_per_unit_normalized;
  const isDivisibleDividend = params.dividend_asset_info?.divisible ?? true;
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: t('common_type'),
      value: t('messages_dividend_dividend_distribution'),
    },
    {
      label: t('common_asset'),
      value: params.asset,
    },
    {
      label: t('common_dividend_asset'),
      value: params.dividend_asset,
    },
    {
      label: t('messages_dividend_quantity_per_unit'),
      value: `${formatAmount({
        value: quantityPerUnit,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} ${params.dividend_asset} per ${params.asset}`,
    },
  ];
  
  // Calculate total if we have holder information
  if (params.total_distributed_normalized !== undefined) {
    fields.push({
      label: t('messages_dividend_total_distributed'),
      value: `${formatAmount({
        value: Number(params.total_distributed_normalized),
        minimumFractionDigits: isDivisibleDividend ? 8 : 0,
        maximumFractionDigits: isDivisibleDividend ? 8 : 0,
      })} ${params.dividend_asset}`,
    });
  }
  
  // Number of holders
  if (params.holder_count !== undefined) {
    fields.push({
      label: t('messages_dividend_holders_receiving'),
      value: params.holder_count.toString(),
    });
  }
  
  // Add any filters applied
  if (params.filters) {
    fields.push({
      label: t('messages_dividend_filters_applied'),
      value: params.filters,
    });
  }
  
  return fields;
}