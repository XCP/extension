import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";

import { t } from '@/i18n';
/**
 * Renders detailed information for cancel transactions
 */
export function cancel(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
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
      value: t('messages_cancel_cancelled_successfully'),
    },
  ];
}