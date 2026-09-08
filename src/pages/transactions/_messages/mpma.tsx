import type { ReactNode } from 'react';
import { isAssetDivisible, normalizeQuantity } from '@/components/domain/tx/tx-action-info';
import type { Transaction } from '@/core/counterparty/api';
import { formatAddress, formatAmount, formatAmountExact } from '@/core/format';
import { divide } from '@/core/numeric';
import { t } from '@/i18n';

type Data = Record<string, unknown>;
type Transfer = { asset: string; destination: string; quantity: bigint | null; data: Data };
const record = (value: unknown): Data | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null;

function rawQuantity(value: unknown): bigint | null {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return null;
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  return /^\d+$/.test(String(value)) ? BigInt(value) : null;
}

function transferRows(tx: Transaction): Data[] | null {
  const events = (tx.events ?? []).filter(event => event.event === 'MPMA_SEND'
    && (event.params?.tx_hash === tx.tx_hash || (event.params?.tx_hash === undefined && event.tx_hash === tx.tx_hash)))
    .sort((a, b) => a.event_index - b.event_index);
  if (events.length) return events.map(event => record(event.params) ?? {});

  const params = record(tx.unpacked_data?.params) ?? record(tx.unpacked_data?.message_data);
  if (Array.isArray(params?.asset_dest_quant_list)) {
    const info = record(params.asset_info);
    return params.asset_dest_quant_list.map((item: unknown) => {
      if (!Array.isArray(item)) return {};
      const [asset, destination, quantity, memo, memo_is_hex] = item;
      return { asset, destination, quantity, memo, memo_is_hex,
        // A single global flag cannot describe every asset in an MPMA. Match its identity.
        asset_info: info && (info.asset === asset || params.asset === asset) ? info : undefined };
    });
  }
  // Core compose.unpack currently takes send_info[0] per asset (compose.py:957–969).
  // Its message_data list is incomplete: never infer counts/totals from that lossy projection.
  return null;
}

/** Complete transfer details from this transaction; no additional API lookups. */
export function mpma(tx: Transaction): Array<{ label: string; value: string | ReactNode }> {
  const rows = transferRows(tx);
  if (!rows || rows.some(row => typeof row.asset !== 'string' || !row.asset || typeof row.destination !== 'string' || !row.destination)) {
    return [{ label: t('tx_action_multi_send'), value: t('messages_mpma_details_unavailable') }];
  }
  const transfers: Transfer[] = rows.map(row => ({
    asset: row.asset as string, destination: row.destination as string, quantity: rawQuantity(row.quantity), data: row,
  }));
  const groups = new Map<string, Transfer[]>();
  for (const transfer of transfers) {
    const group = groups.get(transfer.asset) ?? [];
    group.push(transfer);
    groups.set(transfer.asset, group);
  }

  const totalDestinations = new Set(transfers.map(transfer => transfer.destination)).size;
  const totalAssets = groups.size;
  const assetCount = formatAmount({ value: totalAssets, maximumFractionDigits: 0 });
  const assetsText = totalAssets === 1 ? t('messages_mpma_one_asset', [assetCount]) : t('messages_mpma_assets', [assetCount]);
  const addressCount = formatAmount({ value: totalDestinations, maximumFractionDigits: 0 });
  const addressesText = totalDestinations === 1 ? t('messages_mpma_one_address', [addressCount]) : t('messages_mpma_addresses', [addressCount]);
  const fields: Array<{ label: string; value: string | ReactNode }> = [{
    label: t('common_type'), value: t('messages_mpma_multi_send_to', [assetsText, addressesText]),
  }];

  for (const [asset, entries] of groups) {
    const known = new Set(entries.map(entry => isAssetDivisible(asset, entry.data, 'asset')).filter(value => value !== undefined));
    const divisible = known.size === 1 ? [...known][0] : undefined;
    const display = (quantity: bigint | null): string => quantity === null ? t('tx_action_unavailable')
      : divisible === undefined ? normalizeQuantity(quantity, asset)
        : formatAmountExact(divide(quantity.toString(), divisible ? 100_000_000 : 1).toFixed(), { divisible });
    const firstQuantity = entries[0]!.quantity;
    const equal = firstQuantity !== null && entries.every(entry => entry.quantity === firstQuantity);
    const total = entries.reduce<bigint | null>((sum, entry) => sum !== null && entry.quantity !== null ? sum + entry.quantity : null, 0n);
    fields.push({
      label: t('messages_mpma_recipients', [asset, formatAmount({ value: entries.length, maximumFractionDigits: 0 })]),
      value: <div className="space-y-1 max-h-32 overflow-y-auto">
        {entries.map((entry, index) => <div key={index} className="text-xs break-all py-0.5">
          <div title={entry.destination}>{formatAddress(entry.destination)}</div>
          {!equal && <div>{display(entry.quantity)} {asset}</div>}
          {typeof entry.data.memo === 'string' && entry.data.memo && <div>
            {entry.data.memo_is_hex ? t('tx_action_hex_label', [t('common_memo')]) : t('common_memo')}: {entry.data.memo}
          </div>}
        </div>)}
      </div>,
    });
    if (equal) fields.push({ label: t('messages_mpma_per_address', [asset]), value: display(firstQuantity) });
    fields.push({ label: t('messages_mpma_total_sent', [asset]), value: display(total) });
  }

  const params = record(tx.unpacked_data?.params);
  const memo = Array.isArray(params?.memos) ? params.memos[0] : undefined;
  if (typeof memo === 'string' && memo) fields.push({ label: t('common_memo'), value: <div className="break-all">{memo}</div> });
  return fields;
}
