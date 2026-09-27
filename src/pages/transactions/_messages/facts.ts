import type { Transaction } from "@/core/counterparty/api";
import { fromSatoshis } from "@/core/numeric";
import { t } from '@/i18n';

type Data = Record<string, any>;

const record = (value: unknown): Data | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : undefined;

/**
 * The message's own fields. Core's `/v2/transactions/{hash}` puts them in
 * `unpacked_data.message_data`; `params` is read first for records already shaped that way.
 */
export function messageData(tx: Transaction): Data | undefined {
  return record(tx.unpacked_data?.params) ?? record(tx.unpacked_data?.message_data);
}

/** The params of this transaction's events of one kind, in ledger order. */
export function eventParams(tx: Transaction, event: string): Data[] {
  return (tx.events ?? [])
    .filter((e) => e.event === event && (e.params?.tx_hash === undefined || e.params.tx_hash === tx.tx_hash))
    .sort((a, b) => a.event_index - b.event_index)
    .map((e) => record(e.params))
    .filter((params): params is Data => params !== undefined);
}

/**
 * `quantity asset` in display units: the API's normalized figure when it sent one, else the raw
 * integer scaled by the asset's divisibility, else the raw integer marked as base units rather
 * than guessed at.
 */
export function amountText(data: Data, quantityKey: string, assetKey: string): string | undefined {
  const asset = data[assetKey];
  const raw = data[quantityKey];
  if (raw == null || typeof asset !== 'string' || !asset) return undefined;
  const normalized = data[`${quantityKey}_normalized`];
  if (normalized != null) return `${normalized} ${asset}`;
  if (!/^\d+$/.test(String(raw))) return undefined;
  const divisible = asset === 'XCP' || asset === 'BTC' ? true : record(data[`${assetKey}_info`])?.divisible;
  if (divisible === true) return `${fromSatoshis(String(raw), { removeTrailingZeros: false })} ${asset}`;
  if (divisible === false) return `${String(raw)} ${asset}`;
  return `${t('tx_action_base_units', [String(raw)])} ${asset}`;
}
