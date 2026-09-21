import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount } from "@/core/format";

import { t } from '@/i18n';
/**
 * Renders detailed information for attach (UTXO attach) transactions
 */
export function attach(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  // Use API-provided normalized values (verbose=true always returns these)
  const isDivisible = params.asset_info?.divisible ?? true;
  const quantity = params.quantity_normalized;

  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: t('common_type'),
      value: t('messages_attach_utxo_attach'),
    },
    {
      label: t('common_asset'),
      value: params.asset,
    },
    {
      label: t('common_quantity'),
      value: `${formatAmount({
        value: quantity,
        minimumFractionDigits: isDivisible ? 8 : 0,
        maximumFractionDigits: isDivisible ? 8 : 0,
      })} ${params.asset}`,
    },
  ];
  
  // Destination UTXO
  if (params.destination_vout !== undefined) {
    fields.push({
      label: t('messages_attach_destination_utxo'),
      value: t('messages_attach_output', [String(params.destination_vout)]),
    });
  } else {
    fields.push({
      label: t('messages_attach_destination_utxo'),
      value: t('messages_attach_same_as_source'),
    });
  }
  
  // Show if it's a move or attach
  if (params.move !== undefined) {
    fields.push({
      label: t('messages_attach_operation'),
      value: params.move ? t('messages_attach_move_to_utxo') : t('messages_attach_attach_to_utxo'),
    });
  }
  
  return fields;
}