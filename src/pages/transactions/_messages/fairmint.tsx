import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount } from "@/core/format";
import { isGreaterThan } from "@/core/numeric";

import { t } from '@/i18n';
/**
 * Renders detailed information for fairmint transactions
 */
export function fairmint(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];

  // Use API-provided normalized values (verbose=true always returns these)
  const isDivisible = params.asset_info?.divisible ?? true;
  const quantity = params.quantity_normalized;

  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: t('common_type'),
      value: "Fairmint",
    },
    {
      label: t('common_asset'),
      value: params.asset,
    },
    {
      label: t('messages_fairmint_quantity_minted'),
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
      label: t('messages_fairmint_commission_paid'),
      value: `${formatAmount({
        value: Number(params.commission_normalized),
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    });
  }

  // Price paid (if XCP model)
  if (params.paid_quantity_normalized !== undefined && isGreaterThan(params.paid_quantity_normalized, 0)) {
    const paidQuantity = params.paid_quantity_normalized;
    fields.push({
      label: t('messages_fairmint_xcp_paid'),
      value: `${formatAmount({
        value: paidQuantity,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} XCP`,
    });

    // Calculate effective price
    const effectivePrice = paidQuantity / quantity;
    fields.push({
      label: t('common_effective_price'),
      value: t('messages_fairmint_xcp_per', [String(formatAmount({
        value: effectivePrice,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })), String(params.asset)]),
    });
  }
  
  // Fairminter status
  if (params.fairminter_status !== undefined) {
    fields.push({
      label: t('messages_fairmint_fairminter_status'),
      value: params.fairminter_status === 0 ? t('messages_fairmint_still_open') : t('messages_fairmint_closed_after_this'),
    });
  }
  
  return fields;
}