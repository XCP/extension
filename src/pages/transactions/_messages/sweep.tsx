import type { ReactNode } from "react";
import { memoForDisplay } from "@/components/domain/tx/tx-action-info";
import { fetchTransactionEvents, type Transaction } from "@/core/counterparty/api";
import { useReviewLookup } from "@/hooks/useReviewLookup";
import { t } from '@/i18n';
import { amountText, assetLabel, eventParams, messageData } from "@/pages/transactions/_messages/facts";

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

  // What moved. Balances are the CREDIT rows Core writes with `calling_function` "sweep", which
  // `/v2/transactions/{hash}` does not embed, so they are read on their own; ownership is one
  // ASSET_TRANSFER per asset, which it does.
  if (flags === undefined || (flags & FLAG_BALANCES) !== 0) {
    fields.push({
      label: t('messages_sweep_assets_swept'),
      value: <SweptBalances txHash={tx.tx_hash} />,
    });
  }

  const transferred = eventParams(tx, 'ASSET_TRANSFER')
    .map((event) => (typeof event.asset_longname === 'string' && event.asset_longname) || assetLabel(event, 'asset'))
    .filter((asset): asset is string => typeof asset === 'string' && asset !== '');
  if (transferred.length > 0) {
    fields.push({
      label: t('messages_sweep_ownership_transferred'),
      value: <AssetList items={transferred} />,
    });
  }

  return fields;
}

function AssetList({ items }: { items: string[] }) {
  return (
    <div className="space-y-1 max-h-32 overflow-y-auto">
      {items.map((item, idx) => (
        <div key={idx} className="text-xs break-all">
          {item}
        </div>
      ))}
    </div>
  );
}

/** The balances a sweep credited to its destination, at each asset's divisibility. */
function SweptBalances({ txHash }: { txHash: string }) {
  const credits = useReviewLookup(txHash, () => fetchTransactionEvents(txHash, 'CREDIT'));
  if (credits.status === 'loading') return <>{t('common_loading')}</>;
  if (credits.status === 'failed') return <>{t('messages_sweep_balances_unavailable')}</>;

  const amounts = credits.value
    .filter((event) => event.tx_hash === undefined || event.tx_hash === txHash)
    .filter((event) => event.params?.calling_function === 'sweep')
    .sort((a, b) => a.event_index - b.event_index)
    .map((event) => amountText({ ...event.params, asset: assetLabel(event.params, 'asset') }, 'quantity', 'asset'))
    .filter((amount): amount is string => amount !== undefined);
  if (amounts.length === 0) return <>{t('messages_sweep_no_balances')}</>;
  return <AssetList items={amounts} />;
}
