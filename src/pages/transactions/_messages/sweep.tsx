import type { ReactNode } from "react";
import { memoForDisplay } from "@/components/domain/tx/tx-action-info";
import type { Transaction } from "@/core/counterparty/api";
import { t } from '@/i18n';
import { eventParams, messageData } from "@/pages/transactions/_messages/facts";

/** Core's sweep flags (messages/sweep.py): what to sweep, and how to read the memo. */
const FLAG_BALANCES = 1;
const FLAG_OWNERSHIP = 2;
const FLAG_BINARY_MEMO = 4;

/**
 * Renders detailed information for sweep transactions
 */
export function sweep(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const params = messageData(tx) ?? eventParams(tx, 'SWEEP')[0];
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
  
  // Flags. Balances and ownership say what was swept; the binary-memo flag says only that the
  // memo is raw bytes, which Core's API then returns as hex.
  const flags = typeof params.flags === 'number' ? params.flags : undefined;
  if (flags !== undefined) {
    const flagDescriptions: string[] = [];
    if (flags & FLAG_BALANCES) flagDescriptions.push(t('messages_sweep_include_balances'));
    if (flags & FLAG_OWNERSHIP) flagDescriptions.push(t('messages_sweep_include_ownership'));

    fields.push({
      label: t('messages_sweep_flags'),
      value: flagDescriptions.length > 0 ? flagDescriptions.join(", ") : t('messages_sweep_raw_value', [String(flags)]),
    });
  }

  // Memo: text unless the binary-memo flag is set, then its bytes as hex.
  const { memo, memoEncoding } = memoForDisplay({
    memo: params.memo,
    memoIsBinary: flags !== undefined && (flags & FLAG_BINARY_MEMO) !== 0,
  });
  if (memo) {
    fields.push({
      label: memoEncoding === 'hex' ? t('tx_action_hex_label', [t('common_memo')]) : t('common_memo'),
      value: (
        <div className="break-all">
          {memo}
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
              {event.params.asset}: {event.params.quantity || t('messages_sweep_ownership')}
            </div>
          ))}
        </div>
      ),
    });
  }
  
  return fields;
}