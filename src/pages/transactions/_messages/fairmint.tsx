import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount, formatAmountExact } from "@/core/format";
import { divide, isGreaterThan } from "@/core/numeric";
import { t } from '@/i18n';
import { eventParams, messageData } from "@/pages/transactions/_messages/facts";

/**
 * Renders detailed information for fairmint transactions
 */
export function fairmint(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  // The message asks for a quantity. Its NEW_FAIRMINT event records what Core did with it:
  // `earn_quantity` is what the minter received, `commission` the fairminter issuer's cut of the
  // mint (the two add up to what was minted), and `paid_quantity` the XCP paid. A free mint's
  // message asks for 0 and the fairminter decides the amount, so only the event says what it was.
  const message = messageData(tx);
  const minted = eventParams(tx, 'NEW_FAIRMINT')[0];
  if (!message && !minted) return [];
  const asset: string = minted?.asset ?? message?.asset;
  const isDivisible = (minted?.asset_info ?? message?.asset_info)?.divisible !== false;
  const amount = (value: string) => `${formatAmountExact(value, { divisible: isDivisible })} ${asset}`;

  const fields: Array<{ label: string; value: string | ReactNode }> = [
    { label: t('common_type'), value: t('fairminter_fairmint_fairmint') },
    { label: t('common_asset'), value: asset },
  ];

  const received: string | undefined = minted?.earn_quantity_normalized;
  if (received !== undefined) {
    fields.push({ label: t('messages_fairmint_quantity_minted'), value: amount(received) });
  } else if (message?.quantity_normalized !== undefined) {
    // No event (unconfirmed, or not recorded): all there is to show is what was asked for.
    fields.push({ label: t('messages_fairmint_quantity_requested'), value: amount(message.quantity_normalized) });
  }

  const commission: string | undefined = minted?.commission_normalized;
  if (commission !== undefined && isGreaterThan(commission, 0)) {
    fields.push({ label: t('messages_fairmint_commission_paid'), value: amount(commission) });
  }

  // Price paid (if XCP model)
  const paid: string | undefined = minted?.paid_quantity_normalized;
  if (paid !== undefined && isGreaterThan(paid, 0)) {
    fields.push({
      label: t('messages_fairmint_xcp_paid'),
      value: `${formatAmountExact(paid)} XCP`,
    });

    // What each unit received cost: the commission is paid for but not received.
    if (received !== undefined && isGreaterThan(received, 0)) {
      fields.push({
        label: t('common_effective_price'),
        value: t('messages_fairmint_xcp_per', [formatAmount({
          value: divide(paid, received).toFixed(8),
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        }), String(asset)]),
      });
    }
  }

  // Fairminter status
  const fairminterStatus = minted?.fairminter_status ?? message?.fairminter_status;
  if (fairminterStatus !== undefined) {
    fields.push({
      label: t('messages_fairmint_fairminter_status'),
      value: fairminterStatus === 0 ? t('messages_fairmint_still_open') : t('messages_fairmint_closed_after_this'),
    });
  }

  return fields;
}
