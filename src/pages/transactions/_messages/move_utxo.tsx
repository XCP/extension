import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";
import { t } from '@/i18n';
import { amountText, eventParams, messageData } from "@/pages/transactions/_messages/facts";

/**
 * Renders detailed information for UTXO moves.
 *
 * A move spends an asset-bearing UTXO and carries no message, so Core lists it as `utxomove`
 * with its facts in UTXO_MOVE events, one per asset. The legacy `utxo` message carries the same
 * facts in its message data.
 */
export function move_utxo(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const events = eventParams(tx, 'UTXO_MOVE');
  const legacy = messageData(tx);
  const moves = events.length ? events : legacy ? [legacy] : [];
  if (moves.length === 0) return [];

  const fields: Array<{ label: string; value: string | ReactNode }> = [
    { label: t('common_type'), value: t('messages_move_utxo_utxo_move') },
  ];

  for (const move of moves) {
    const amount = amountText(move, 'quantity', 'asset');
    if (amount) fields.push({ label: t('common_amount'), value: amount });
  }

  const unique = (values: unknown[]) => [...new Set(values.filter((v): v is string => typeof v === 'string' && v !== ''))];
  for (const source of unique(moves.map((move) => move.source))) {
    fields.push({ label: t('tx_action_from_utxo'), value: <span className="text-xs break-all">{source}</span> });
  }
  for (const destination of unique(moves.map((move) => move.destination_address ?? move.destination))) {
    fields.push({ label: t('common_destination'), value: <span className="text-xs break-all">{destination}</span> });
  }

  return fields;
}
