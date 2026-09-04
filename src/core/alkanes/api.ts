/** Read-only Alkanes outpoint queries used to protect carrier UTXOs. */

import { getActiveSettings } from '@/core/settings';

export const DEFAULT_ALKANES_API_BASE = 'https://mainnet.subfrost.io/v4/jsonrpc';
export const ALKANES_PROTOCOL_TAG = '1';

export interface AlkaneBalance {
  /** Alkane identifier as returned by the indexer, for example `2:0`. */
  id: string;
  /** Exact base-unit balance. Never pass this through a JavaScript number. */
  value: string;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null ? value as JsonRecord : undefined;
}

function exactInteger(value: unknown): string | undefined {
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
  if (typeof value === 'bigint' && value >= 0n) return value.toString();
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return undefined;
}

function alkaneId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  const record = asRecord(value);
  if (!record) return undefined;
  const block = exactInteger(record.block ?? record.block_height ?? record.height);
  const tx = exactInteger(record.tx ?? record.tx_index ?? record.index);
  return block !== undefined && tx !== undefined ? `${block}:${tx}` : undefined;
}

/**
 * Normalize the two response shapes used by metashrew/subfrost releases. Unknown shapes fail
 * closed rather than being interpreted as an empty balance sheet.
 */
export function parseAlkaneBalances(response: unknown): AlkaneBalance[] {
  const root = asRecord(response);
  const result = asRecord(root?.result);
  const sheet = asRecord(result?.balance_sheet ?? result?.balanceSheet);
  const cached = asRecord(sheet?.cached) ?? sheet;
  const rawBalances = cached?.balances;
  if (Array.isArray(rawBalances)) {
    return rawBalances.map((entry, index) => {
      const record = asRecord(entry);
      if (!record) throw new Error(`Invalid Alkanes balance at index ${index}`);
      const id = alkaneId(record.id ?? record.alkane ?? record.rune)
        ?? alkaneId({ block: record.block, tx: record.tx });
      const value = exactInteger(record.value ?? record.balance ?? record.amount);
      if (!id || value === undefined) throw new Error(`Invalid Alkanes balance at index ${index}`);
      return { id, value };
    }).filter((balance) => BigInt(balance.value) > 0n);
  }
  const balancesRecord = asRecord(rawBalances);
  if (balancesRecord) {
    return Object.entries(balancesRecord).map(([id, rawValue]) => {
      const value = exactInteger(rawValue);
      if (!/^\d+:\d+$/.test(id) || value === undefined) {
        throw new Error(`Invalid Alkanes balance for ${id}`);
      }
      return { id, value };
    }).filter((balance) => BigInt(balance.value) > 0n);
  }
  throw new Error('Alkanes response has no recognized balance list');
}

export async function fetchAlkanesByOutpoint(
  txid: string,
  vout: number,
  apiBase = getActiveSettings().alkanesApiBase ?? DEFAULT_ALKANES_API_BASE,
): Promise<AlkaneBalance[]> {
  if (!/^[0-9a-f]{64}$/i.test(txid)) throw new Error('Invalid Alkanes outpoint txid');
  if (!Number.isSafeInteger(vout) || vout < 0) throw new Error('Invalid Alkanes outpoint index');

  const response = await fetch(apiBase, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'alkanes_protorunesbyoutpoint',
      params: { txid, vout, protocolTag: ALKANES_PROTOCOL_TAG },
    }),
  });
  if (!response.ok) throw new Error(`Alkanes lookup failed (${response.status})`);
  const body: unknown = await response.json();
  const error = asRecord(asRecord(body)?.error);
  if (error) throw new Error(String(error.message ?? 'Alkanes JSON-RPC error'));
  return parseAlkaneBalances(body);
}
