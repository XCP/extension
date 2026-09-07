import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatDate } from "@/core/format";

import { t } from '@/i18n';
/**
 * Renders detailed information for broadcast transactions
 */
export function broadcast(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [];
  
  // Determine broadcast type
  let broadcastType = t('messages_broadcast_general_broadcast');
  if (params.text && params.text.startsWith("options ")) {
    broadcastType = t('messages_broadcast_address_options');
  } else if (params.value !== undefined && params.value !== null) {
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
  if (params.value !== undefined && params.value !== null) {
    fields.push({
      label: t('common_value'),
      value: params.value.toString(),
    });
  }
  
  // Fee fraction
  if (params.fee_fraction !== undefined) {
    const feePercentage = (params.fee_fraction / 10000).toFixed(2);
    fields.push({
      label: t('common_fee_fraction'),
      value: `${params.fee_fraction} (${feePercentage}%)`,
    });
  }
  
  // Timestamp
  if (params.timestamp) {
    fields.push({
      label: t('messages_broadcast_timestamp'),
      value: formatDate(params.timestamp),
    });
  }
  
  // Lock status
  if (params.locked !== undefined) {
    fields.push({
      label: t('common_locked'),
      value: params.locked ? "🔒 Yes" : "🔓 No",
    });
  }
  
  return fields;
}