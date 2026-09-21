import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";

import { t } from '@/i18n';
/**
 * Renders detailed information for move_utxo transactions
 */
export function move_utxo(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: t('common_type'),
      value: t('messages_move_utxo_utxo_move'),
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
      value: t('messages_move_utxo_same_as_source_consolidation'),
    });
  }
  
  // Show moved UTXOs if available
  if (params.utxos && params.utxos.length > 0) {
    fields.push({
      label: t('messages_move_utxo_utxos_moved'),
      value: `${params.utxos.length} UTXO${params.utxos.length > 1 ? 's' : ''}`,
    });
  }
  
  return fields;
}