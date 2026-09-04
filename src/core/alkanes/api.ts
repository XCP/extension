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

export interface AlkaneCarrier {
  txid: string;
  vout: number;
  /** Bitcoin value of the carrier output in satoshis, when supplied by the indexer. */
  value?: number;
  height?: number;
  balances: AlkaneBalance[];
}

export interface DieselAddressBalance {
  /** Exact DIESEL base units across every confirmed carrier at the address. */
  baseUnits: string;
  carriers: AlkaneCarrier[];
}

export const DIESEL_ALKANE_ID = '2:0';
/** Internal UI/cache key; deliberately cannot collide with a Counterparty asset name. */
export const DIESEL_WALLET_ASSET = 'ALKANES:DIESEL';

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
      params: [{ txid, vout, protocolTag: ALKANES_PROTOCOL_TAG }],
    }),
  });
  if (!response.ok) throw new Error(`Alkanes lookup failed (${response.status})`);
  const body: unknown = await response.json();
  const error = asRecord(asRecord(body)?.error);
  if (error) throw new Error(String(error.message ?? 'Alkanes JSON-RPC error'));
  return parseAlkaneBalances(body);
}

/**
 * Fetch every Alkanes carrier assigned to an address. Keeping the outpoints is important: an
 * address-level total alone cannot protect, roll over, or later send the token-bearing UTXOs.
 */
export async function fetchAlkanesByAddress(
  address: string,
  apiBase = getActiveSettings().alkanesApiBase ?? DEFAULT_ALKANES_API_BASE,
): Promise<AlkaneCarrier[]> {
  if (!address.trim()) throw new Error('Invalid Alkanes address');
  const response = await fetch(apiBase, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'alkanes_protorunesbyaddress',
      params: [{ address, protocolTag: ALKANES_PROTOCOL_TAG }],
    }),
  });
  if (!response.ok) throw new Error(`Alkanes lookup failed (${response.status})`);
  const body: unknown = await response.json();
  const root = asRecord(body);
  const error = asRecord(root?.error);
  if (error) throw new Error(String(error.message ?? 'Alkanes JSON-RPC error'));
  const result = asRecord(root?.result);
  const rawOutpoints = result?.outpoints;
  if (!Array.isArray(rawOutpoints)) {
    throw new Error('Alkanes response has no recognized outpoint list');
  }

  return rawOutpoints.map((entry, index) => {
    const record = asRecord(entry);
    const outpoint = asRecord(record?.outpoint);
    const txid = outpoint?.txid;
    const vout = exactInteger(outpoint?.vout ?? outpoint?.index);
    if (typeof txid !== 'string' || !/^[0-9a-f]{64}$/i.test(txid) || vout === undefined) {
      throw new Error(`Invalid Alkanes outpoint at index ${index}`);
    }
    const output = asRecord(record?.output);
    const rawValue = exactInteger(output?.value ?? record?.value);
    const rawHeight = exactInteger(record?.height);
    const balances = parseAlkaneBalances({
      result: { balance_sheet: record?.balance_sheet ?? record?.balanceSheet },
    });
    const value = rawValue !== undefined && BigInt(rawValue) <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(rawValue)
      : undefined;
    const height = rawHeight !== undefined && BigInt(rawHeight) <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(rawHeight)
      : undefined;
    return { txid, vout: Number(vout), value, height, balances };
  });
}

export async function fetchDieselBalance(
  address: string,
  apiBase?: string,
): Promise<DieselAddressBalance> {
  const carriers = await fetchAlkanesByAddress(address, apiBase);
  const baseUnits = carriers.reduce((total, carrier) => total + carrier.balances
    .filter((balance) => balance.id === DIESEL_ALKANE_ID)
    .reduce((subtotal, balance) => subtotal + BigInt(balance.value), 0n), 0n);
  return {
    baseUnits: baseUnits.toString(),
    carriers: carriers.filter((carrier) => carrier.balances.some(
      (balance) => balance.id === DIESEL_ALKANE_ID,
    )),
  };
}

/** Convert exact 8-decimal DIESEL base units without passing through floating point. */
export function dieselBaseUnitsToDisplay(baseUnits: string): string {
  if (!/^\d+$/.test(baseUnits)) throw new Error('Invalid DIESEL base units');
  const value = BigInt(baseUnits);
  const whole = value / 100_000_000n;
  const fraction = (value % 100_000_000n).toString().padStart(8, '0');
  return `${whole}.${fraction}`;
}
