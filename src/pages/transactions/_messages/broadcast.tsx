import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount, formatDate } from "@/core/format";
import { divide, isGreaterThan } from "@/core/numeric";
import { t } from '@/i18n';
import { eventParams, messageData } from "@/pages/transactions/_messages/facts";

/**
 * Renders detailed information for broadcast transactions
 */
export function broadcast(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const event = eventParams(tx, 'BROADCAST')[0];
  const params = messageData(tx) ?? event;
  if (!params) return [];

  const fields: Array<{ label: string; value: string | ReactNode }> = [];

  // Every broadcast carries a value and a fee fraction; a plain text broadcast sets both to zero.
  const value = Number(params.value);
  const hasValue = params.value != null && Number.isFinite(value) && value !== 0;
  const feeFractionInt = /^\d+$/.test(String(params.fee_fraction_int ?? '')) ? String(params.fee_fraction_int) : undefined;
  const hasFee = feeFractionInt !== undefined && isGreaterThan(feeFractionInt, 0);

  // Determine broadcast type
  let broadcastType = t('messages_broadcast_general_broadcast');
  if (params.text && params.text.startsWith("options ")) {
    broadcastType = t('messages_broadcast_address_options');
  } else if (hasValue || hasFee) {
    broadcastType = t('messages_broadcast_oracle_broadcast');
  }

  fields.push({
    label: t('common_type'),
    value: broadcastType,
  });

  // Text content
  if (params.text) {
    fields.push({
      label: t('messages_broadcast_text'),
      value: (
        <div className="break-all font-mono text-xs">
          {params.text}
        </div>
      ),
    });
  }

  // Oracle value
  if (hasValue) {
    fields.push({
      label: t('common_value'),
      value: String(params.value),
    });
  }

  // Fee fraction: an integer where 100,000,000 is the whole, so 1,000,000 is 1%.
  if (hasFee) {
    fields.push({
      label: t('common_fee_fraction'),
      value: `${formatAmount({ value: divide(feeFractionInt, 1_000_000), maximumFractionDigits: 6 })}%`,
    });
  }

  // Timestamp
  if (params.timestamp) {
    fields.push({
      label: t('messages_broadcast_timestamp'),
      value: formatDate(params.timestamp),
    });
  }

  // Lock status: recorded on the BROADCAST event, not in the message.
  const locked = params.locked ?? event?.locked;
  if (locked !== undefined) {
    fields.push({
      label: t('common_locked'),
      value: locked ? '🔒 ' + t('tx_action_yes') : '🔓 ' + t('tx_action_no'),
    });
  }

  return fields;
}
