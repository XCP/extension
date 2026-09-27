import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount } from "@/core/format";
import { t } from '@/i18n';
import { assetLabel, eventParams, messageData } from "@/pages/transactions/_messages/facts";

/**
 * Renders detailed information for dividend transactions
 */
export function dividend(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = messageData(tx) ?? eventParams(tx, 'ASSET_DIVIDEND')[0];
  if (!params) return [];

  const asset = assetLabel(params, 'asset') ?? params.asset;
  const dividendAsset = assetLabel(params, 'dividend_asset') ?? params.dividend_asset;
  // The per-unit amount is in the dividend asset, so its divisibility sets the decimals.
  const isDivisibleDividend = params.dividend_asset === 'XCP' || params.dividend_asset === 'BTC'
    || (params.dividend_asset_info?.divisible ?? true);
  const digits = isDivisibleDividend ? 8 : 0;

  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: t('common_type'),
      value: t('messages_dividend_dividend_distribution'),
    },
    {
      label: t('common_asset'),
      value: asset,
    },
    {
      label: t('common_dividend_asset'),
      value: dividendAsset,
    },
    {
      label: t('messages_dividend_quantity_per_unit'),
      value: `${formatAmount({
        value: params.quantity_per_unit_normalized,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })} ${dividendAsset} per ${asset}`,
    },
  ];

  // Calculate total if we have holder information
  if (params.total_distributed_normalized !== undefined) {
    fields.push({
      label: t('messages_dividend_total_distributed'),
      value: `${formatAmount({
        value: Number(params.total_distributed_normalized),
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })} ${dividendAsset}`,
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
