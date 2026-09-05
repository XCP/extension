/** Read-only Alkanes outpoint queries used to protect token-bearing UTXOs. */

import { getActiveSettings } from '@/core/settings';

export const DEFAULT_ALKANES_API_BASE = 'https://mainnet.subfrost.io/v4/jsonrpc';
export const ALKANES_PROTOCOL_TAG = '1';

export interface AlkaneBalance {
  /** Alkane identifier as returned by the indexer, for example `2:0`. */
  id: string;
  /** Exact base-unit balance. Never pass this through a JavaScript number. */
  value: string;
}

export interface AlkaneUtxo {
  txid: string;
  vout: number;
  /** Bitcoin value of the token-bearing output in satoshis, when supplied by the indexer. */
  value?: number;
  /** Provider metadata; some releases put the Alkane id block here, NOT Bitcoin confirmation. */
  height?: number;
  balances: AlkaneBalance[];
}

export interface DieselAddressBalance {
  /** Exact DIESEL base units across every confirmed token-bearing UTXO at the address. */
  baseUnits: string;
  utxos: AlkaneUtxo[];
}

export const DIESEL_ALKANE_ID = '2:0';
/** Internal UI/cache key; deliberately cannot collide with a Counterparty asset name. */
export const DIESEL_WALLET_ASSET = 'ALKANES:DIESEL';

type JsonRecord = Record<string, unknown>;

// The anonymous default endpoint has a shared 20-request/minute limit and does not accept
// JSON-RPC arrays. Serialize starts below that limit instead of bursting 30 outpoint POSTs.
let defaultRequestQueue: Promise<unknown> = Promise.resolve();
let nextDefaultRequestAt = 0;
const DEFAULT_REQUEST_INTERVAL_MS = 3_200;

async function rpc(apiBase: string, method: string, params: unknown[]): Promise<unknown> {
  const request = async () => {
    if (apiBase === DEFAULT_ALKANES_API_BASE) {
      const wait = nextDefaultRequestAt - Date.now();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      nextDefaultRequestAt = Date.now() + DEFAULT_REQUEST_INTERVAL_MS;
    }
    const response = await fetch(apiBase, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (response.status === 429) {
      const retrySeconds = Number(response.headers.get('Retry-After'));
      if (apiBase === DEFAULT_ALKANES_API_BASE) {
        nextDefaultRequestAt = Date.now() + Math.max(60_000,
          Number.isFinite(retrySeconds) ? retrySeconds * 1_000 : 0);
      }
      throw new Error('Alkanes indexer rate limit reached. Please wait a minute and retry.');
    }
    if (!response.ok) throw new Error(`Alkanes lookup failed (${response.status})`);
    const body: unknown = await response.json();
    const error = asRecord(asRecord(body)?.error);
    if (error) throw new Error(String(error.message ?? 'Alkanes JSON-RPC error'));
    return body;
  };
  if (apiBase !== DEFAULT_ALKANES_API_BASE) return request();
  const pending = defaultRequestQueue.then(request, request);
  defaultRequestQueue = pending.catch(() => undefined);
  return pending;
}

/** The indexer's processed Bitcoin height, not AlkaneUtxo.height (which is an asset id). */
export async function fetchAlkanesIndexedHeight(
  apiBase = getActiveSettings().alkanesApiBase ?? DEFAULT_ALKANES_API_BASE,
): Promise<number> {
  const body = await rpc(apiBase, 'metashrew_height', []);
  const height = exactInteger(asRecord(body)?.result);
  if (height === undefined || BigInt(height) > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Alkanes indexer returned an invalid processed height');
  }
  return Number(height);
}

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

  const body = await rpc(apiBase, 'alkanes_protorunesbyoutpoint', [
    { txid, vout, protocolTag: ALKANES_PROTOCOL_TAG },
  ]);
  return parseAlkaneBalances(body);
}

/**
 * Fetch every Alkanes-bearing UTXO assigned to an address. Keeping the outpoints is important: an
 * address-level total alone cannot protect, roll over, or later send the token-bearing UTXOs.
 */
export async function fetchAlkanesByAddress(
  address: string,
  apiBase = getActiveSettings().alkanesApiBase ?? DEFAULT_ALKANES_API_BASE,
): Promise<AlkaneUtxo[]> {
  if (!address.trim()) throw new Error('Invalid Alkanes address');
  const body = await rpc(apiBase, 'alkanes_protorunesbyaddress', [
    { address, protocolTag: ALKANES_PROTOCOL_TAG },
  ]);
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
    if (
      typeof txid !== 'string'
      || !/^[0-9a-f]{64}$/i.test(txid)
      || vout === undefined
      || BigInt(vout) > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
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
  const utxos = await fetchAlkanesByAddress(address, apiBase);
  const baseUnits = utxos.reduce((total, utxo) => total + utxo.balances
    .filter((balance) => balance.id === DIESEL_ALKANE_ID)
    .reduce((subtotal, balance) => subtotal + BigInt(balance.value), 0n), 0n);
  return {
    baseUnits: baseUnits.toString(),
    utxos: utxos.filter((utxo) => utxo.balances.some(
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
