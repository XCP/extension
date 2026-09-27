import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { t } from '@/i18n';
import { eventParams, messageData } from "@/pages/transactions/_messages/facts";

/**
 * Renders detailed information for cancel transactions
 */
export function cancel(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = messageData(tx) ?? eventParams(tx, 'CANCEL_ORDER')[0];
  if (!params) return [];

  // Core records an invalid cancel with its reason in the status; only a valid one cancelled.
  const status = typeof params.status === 'string' ? params.status : 'valid';

  return [
    {
      label: t('common_type'),
      value: t('messages_cancel_order_cancellation'),
    },
    {
      label: t('messages_cancel_cancelled_order_tx'),
      value: (
        <span className="text-xs break-all font-mono">
          {params.offer_hash}
        </span>
      ),
    },
    {
      label: t('common_status'),
      value: status === 'valid' ? t('messages_cancel_cancelled_successfully') : status,
    },
  ];
}
