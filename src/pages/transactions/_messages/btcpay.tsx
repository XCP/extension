import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount } from "@/core/format";

import { t } from '@/i18n';
/**
 * Renders detailed information for btcpay transactions
 */
export function btcpay(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];

  // Use API-provided normalized values (verbose=true always returns these)
  const btcAmount = params.btc_amount_normalized;
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: t('common_type'),
      value: t('messages_btcpay_btc_payment_order_settlement'),
    },
    {
      label: t('common_order_match_id'),
      value: (
        <span className="text-xs break-all font-mono">
          {params.order_match_id}
        </span>
      ),
    },
    {
      label: t('messages_btcpay_btc_amount'),
      value: `${formatAmount({
        value: btcAmount,
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      })} BTC`,
    },
  ];
  
  // Status
  if (params.status) {
    fields.push({
      label: t('common_status'),
      value: params.status === "valid" ? t('messages_btcpay_valid_payment') : params.status,
    });
  }
  
  return fields;
}