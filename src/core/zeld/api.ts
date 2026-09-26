/**
 * Read-only client for a ZeldHash indexer (`zeldhash-api`), the public one by default.
 *
 * The indexer answers which outpoints carry ZELD and how much, and which rewards an address has
 * earned. Nothing here is trusted for anything that moves money: balances are display and
 * selection hints, and every spend of a ZELD-bearing output is laid out so a wrong or stale
 * balance cannot lose ZELD (see `sendCompose.ts` and `protection.ts`).
 */

import { apiClient, isApiError } from '@/core/api/client';
import { isRecord } from '@/core/isRecord';
import { asDisplayUnits, type DisplayUnits, fromSatoshis } from '@/core/numeric';

/** The public ZeldHash indexer. Not a setting: there is one, and it is read-only. */
export const ZELD_API_BASE = 'https://api.zeldhash.com';

/**
 * The balance list's key for ZELD. A lowercase prefix with a colon can never be a Counterparty
 * asset name, and there is a real Counterparty asset called ZELD, so the row must not be keyed by
 * the bare name.
 */
export const ZELD_WALLET_ASSET = 'zeldhash:ZELD';
export const ZELD_DISPLAY_NAME = 'ZELD';

export interface ZeldUtxo {
  txid: string;
  vout: number;
  /** ZELD base units (8 decimals) on this outpoint. */
  balance: bigint;
}

export interface ZeldReward {
  txid: string;
  vout: number;
  block_index: number;
  reward: bigint;
  zero_count: number;
}

export interface ZeldAddressBalance {
  baseUnits: bigint;
  utxos: ZeldUtxo[];
}

const CACHE_MS = 30_000;
const utxoCache = new Map<string, { expires: number; promise: Promise<ZeldUtxo[]> }>();

export function clearZeldCaches(): void {
  utxoCache.clear();
}

/** A non-negative integer the indexer serialised as a JSON number, as a bigint. */
function toBaseUnits(value: unknown): bigint | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function toTxid(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : null;
}

/** Every well-formed entry, dropping malformed ones rather than failing the whole read. */
export function parseZeldUtxos(payload: unknown): ZeldUtxo[] {
  if (!Array.isArray(payload)) throw new Error('ZELD indexer returned an unexpected shape');
  const utxos: ZeldUtxo[] = [];
  for (const entry of payload) {
    if (!isRecord(entry)) continue;
    const txid = toTxid(entry.txid);
    const balance = toBaseUnits(entry.balance);
    const vout = entry.vout;
    if (!txid || balance === null || typeof vout !== 'number' || !Number.isInteger(vout) || vout < 0) continue;
    if (balance === 0n) continue;
    utxos.push({ txid, vout, balance });
  }
  return utxos;
}

export function parseZeldRewards(payload: unknown): ZeldReward[] {
  if (!Array.isArray(payload)) throw new Error('ZELD indexer returned an unexpected shape');
  const rewards: ZeldReward[] = [];
  for (const entry of payload) {
    if (!isRecord(entry)) continue;
    const txid = toTxid(entry.txid);
    const reward = toBaseUnits(entry.reward);
    if (!txid || reward === null || typeof entry.block_index !== 'number' || typeof entry.vout !== 'number') continue;
    rewards.push({
      txid,
      vout: entry.vout,
      block_index: entry.block_index,
      reward,
      zero_count: typeof entry.zero_count === 'number' ? entry.zero_count : 0,
    });
  }
  return rewards;
}

/** Outpoints of `address` that carry ZELD, per the indexer. Cached briefly per address. */
export function fetchZeldUtxos(address: string, signal?: AbortSignal): Promise<ZeldUtxo[]> {
  const key = address;
  const cached = utxoCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = (async () => {
    const response = await apiClient.get<unknown>(
      `${ZELD_API_BASE}/addresses/${encodeURIComponent(address)}/utxos`,
      { retries: 0, signal },
    );
    return parseZeldUtxos(response.data);
  })();
  utxoCache.set(key, { expires: Date.now() + CACHE_MS, promise });
  promise.catch(() => utxoCache.delete(key));
  return promise;
}

export async function fetchZeldBalance(address: string, signal?: AbortSignal): Promise<ZeldAddressBalance> {
  const utxos = await fetchZeldUtxos(address, signal);
  return { utxos, baseUnits: utxos.reduce((sum, utxo) => sum + utxo.balance, 0n) };
}

/** ZELD on one outpoint, or 0n when the indexer knows of none. */
export async function fetchZeldOutpointBalance(txid: string, vout: number, signal?: AbortSignal): Promise<bigint> {
  const response = await apiClient.get<unknown>(
    `${ZELD_API_BASE}/utxos/${encodeURIComponent(`${txid}:${vout}`)}`,
    { retries: 0, signal },
  );
  const data = response.data;
  if (!isRecord(data)) return 0n;
  return toBaseUnits(data.balance) ?? 0n;
}

/** Rewards earned by `address`, newest block first. */
export async function fetchZeldRewards(address: string, limit = 10, signal?: AbortSignal): Promise<ZeldReward[]> {
  try {
    // The indexer defaults to newest first. Its optional sort accepts only "zero_count".
    const response = await apiClient.get<unknown>(
      `${ZELD_API_BASE}/addresses/${encodeURIComponent(address)}/rewards?limit=${limit}&offset=0`,
      { retries: 0, signal },
    );
    return parseZeldRewards(response.data).sort((a, b) => b.block_index - a.block_index);
  } catch (error) {
    // An address with no rewards has a specific 404 response, not an unavailable history.
    if (isApiError(error) && error.status === 404 && isRecord(error.response?.data)
      && error.response.data.error === 'No rewards found for address.') return [];
    throw error;
  }
}

/** ZELD base units as a display amount with eight decimals, the same scale as satoshis. */
export function zeldBaseUnitsToDisplay(baseUnits: bigint): DisplayUnits {
  return asDisplayUnits(fromSatoshis(baseUnits.toString()));
}

/** Six leading zeros is the protocol minimum, so such a txid almost certainly carries ZELD. */
export function isLikelyZeldTxid(txid: string): boolean {
  return txid.toLowerCase().startsWith('000000');
}
