import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { t } from '@/i18n';
import { amountText, eventParams, messageData } from "@/pages/transactions/_messages/facts";

/**
 * Renders detailed information for detach (UTXO detach) transactions
 */
export function detach(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  // The message carries only the destination; what left the UTXO is in its DETACH_FROM_UTXO
  // events, one per asset.
  const detached = eventParams(tx, 'DETACH_FROM_UTXO');
  const params = messageData(tx) ?? detached[0];
  if (!params) return [];

  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: t('common_type'),
      value: t('messages_detach_utxo_detach'),
    },
  ];

  // Destination
  if (params.destination) {
    fields.push({
      label: t('common_destination'),
      value: (
        <span className="text-xs break-all">
          {params.destination}
        </span>
      ),
    });
  } else {
    fields.push({
      label: t('common_destination'),
      value: t('messages_detach_same_as_source_detach_in'),
    });
  }

  const amounts = detached.map((event) => amountText(event, 'quantity', 'asset')).filter((amount) => amount !== undefined);
  if (amounts.length > 0) {
    fields.push({
      label: t('messages_detach_assets_detached'),
      value: (
        <div className="space-y-1">
          {amounts.map((amount, idx) => (
            <div key={idx} className="text-xs">
              {amount}
            </div>
          ))}
        </div>
      ),
    });
  }

  return fields;
}
