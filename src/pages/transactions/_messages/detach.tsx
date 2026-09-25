import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";

import { t } from '@/i18n';
/**
 * Renders detailed information for detach (UTXO detach) transactions
 */
export function detach(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
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
  
  // Show detached assets if available in events
  const detachEvents = tx.events?.filter((e: any) => 
    e.event === 'UTXO_DETACH' || 
    e.event === 'ASSET_DETACH'
  );
  
  if (detachEvents && detachEvents.length > 0) {
    fields.push({
      label: t('messages_detach_assets_detached'),
      value: (
        <div className="space-y-1">
          {detachEvents.map((event: any, idx: number) => (
            <div key={idx} className="text-xs">
              {event.params.asset}: {event.params.quantity}
            </div>
          ))}
        </div>
      ),
    });
  }
  
  return fields;
}