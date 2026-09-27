import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount } from "@/core/format";
import { t } from '@/i18n';
import { eventParams, messageData } from "@/pages/transactions/_messages/facts";

/**
 * Renders detailed information for attach (UTXO attach) transactions
 */
export function attach(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const attached = eventParams(tx, 'ATTACH_TO_UTXO')[0];
  const params = messageData(tx) ?? attached;
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

  // Destination UTXO. The event names the UTXO the asset landed on; the message only says which
  // output was asked for, and null when it left the choice to the node.
  const destination = typeof attached?.destination === 'string' && attached.destination.includes(':')
    ? attached.destination
    : undefined;
  fields.push({
    label: t('messages_attach_destination_utxo'),
    value: destination
      ? <span className="text-xs break-all">{destination}</span>
      : params.destination_vout != null
        ? t('messages_attach_output', [String(params.destination_vout)])
        : t('messages_attach_same_as_source'),
  });

  // Show if it's a move or attach
  if (params.move !== undefined) {
    fields.push({
      label: t('messages_attach_operation'),
      value: params.move ? t('messages_attach_move_to_utxo') : t('messages_attach_attach_to_utxo'),
    });
  }

  return fields;
}
