import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount } from "@/core/format";
import { t } from '@/i18n';
import { eventParams, messageData } from "@/pages/transactions/_messages/facts";

/**
 * Renders detailed information for btcpay transactions
 */
export function btcpay(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const payment = eventParams(tx, 'BTC_PAY')[0];
  const params = messageData(tx) ?? payment;
  if (!params) return [];

  // The message names the match; the amount paid is in the BTC_PAY event, and is the BTC this
  // transaction sent to its destination.
  const btcAmount = payment?.btc_amount_normalized ?? params.btc_amount_normalized ?? tx.btc_amount_normalized;

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
