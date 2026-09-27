import type { ReactNode } from "react";
import { memoForDisplay } from "@/components/domain/tx/tx-action-info";
import type { Transaction } from "@/core/counterparty/api";
import { hexToBytes } from "@/core/counterparty/unpack/binary";
import { t } from '@/i18n';
import { amountText, eventParams, messageData } from "@/pages/transactions/_messages/facts";

/**
 * Renders detailed information for destroy transactions: what was destroyed, and the tag.
 */
export function destroy(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const data = messageData(tx) ?? eventParams(tx, 'ASSET_DESTRUCTION')[0];
  if (!data) return [];

  const fields: Array<{ label: string; value: string | ReactNode }> = [
    { label: t('common_type'), value: t('tx_action_destroy') },
  ];

  const destroyed = amountText(data, 'quantity', 'asset');
  if (destroyed) fields.push({ label: t('common_amount'), value: destroyed });

  // Core returns the tag as hex. It is shown the way a memo is: text when the bytes are text,
  // otherwise the exact bytes in hex.
  const tag = typeof data.tag === 'string' ? data.tag : '';
  if (tag) {
    const bytes = /^(?:[0-9a-fA-F]{2})+$/.test(tag) ? hexToBytes(tag) : undefined;
    const { memo, memoEncoding } = bytes ? memoForDisplay({ memoBytes: bytes }) : { memo: tag, memoEncoding: 'text' as const };
    if (memo) {
      fields.push({
        label: memoEncoding === 'hex' ? t('tx_action_hex_label', [t('tx_action_tag')]) : t('tx_action_tag'),
        value: <span className="break-all">{memo}</span>,
      });
    }
  }

  return fields;
}
