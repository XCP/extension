import type { ReactNode } from "react";
import type { Transaction } from "@/core/counterparty/api";

import { t } from '@/i18n';
/**
 * Renders detailed information for sweep transactions
 */
export function sweep(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = tx.unpacked_data?.params;
  if (!params) return [];
  
  const fields: Array<{ label: string; value: string | ReactNode }> = [
    {
      label: t('common_type'),
      value: t('messages_sweep_sweep_all_assets'),
    },
    {
      label: t('common_destination'),
      value: (
        <span className="text-xs break-all">
          {params.destination}
        </span>
      ),
    },
  ];
  
  // Flags
  if (params.flags !== undefined) {
    const flagDescriptions: string[] = [];
    if (params.flags & 1) flagDescriptions.push(t('messages_sweep_include_balances'));
    if (params.flags & 2) flagDescriptions.push(t('messages_sweep_include_ownership'));
    if (params.flags & 4) flagDescriptions.push(t('messages_sweep_close_dispensers'));
    
    fields.push({
      label: t('messages_sweep_flags'),
      value: flagDescriptions.length > 0 ? flagDescriptions.join(", ") : t('messages_sweep_raw_value', [String(params.flags)]),
    });
  }
  
  // Memo
  if (params.memo) {
    fields.push({
      label: t('common_memo'),
      value: (
        <div className="break-all">
          {params.memo}
        </div>
      ),
    });
  }
  
  // Show swept assets if available in events
  const sweepEvents = tx.events?.filter((e: any) => 
    e.event === 'ASSET_TRANSFER' || 
    e.event === 'SEND' || 
    e.event === 'OWNERSHIP_TRANSFER'
  );
  
  if (sweepEvents && sweepEvents.length > 0) {
    fields.push({
      label: t('messages_sweep_assets_swept'),
      value: (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {sweepEvents.map((event: any, idx: number) => (
            <div key={idx} className="text-xs">
              {event.params.asset}: {event.params.quantity || "ownership"}
            </div>
          ))}
        </div>
      ),
    });
  }
  
  return fields;
}