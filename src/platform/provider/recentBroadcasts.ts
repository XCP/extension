/**
 * Trusted, cross-context prevouts from transactions this extension successfully broadcast.
 *
 * Provider requests are handled in the MV3 background worker, while raw-transaction approvals
 * and signing run in a popup. Session storage bridges that boundary and survives worker suspension.
 */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import type { TrustedBroadcastPrevout } from '@/core/bitcoin/trustedPrevout';
import { extractSafeOwnChangeOutputs } from '@/core/counterparty/pendingChange';
import { createWriteLock, isExpired } from '@/platform/storage/mutex';

const STORAGE_KEY = 'recent_safe_broadcast_prevouts';
const TTL_MS = 15 * 60 * 1000;
const MAX_TRANSACTIONS = 50;
const TXID_PATTERN = /^[a-f0-9]{64}$/i;
const HEX_PATTERN = /^(?:[a-f0-9]{2})+$/i;

interface RecentBroadcastTransaction {
  txid: string;
  rawTxHex: string;
  timestamp: number;
  outputs: Array<{
    vout: number;
    address: string;
    value: number;
    scriptPubKey: string;
  }>;
}

const withWriteLock = createWriteLock();

function isRecentBroadcastOutput(value: unknown): value is RecentBroadcastTransaction['outputs'][number] {
  if (!value || typeof value !== 'object') return false;
  const output = value as Partial<RecentBroadcastTransaction['outputs'][number]>;
  return Number.isSafeInteger(output.vout)
    && output.vout! >= 0
    && typeof output.address === 'string'
    && output.address.length > 0
    && Number.isSafeInteger(output.value)
    && output.value! > 0
    && typeof output.scriptPubKey === 'string'
    && HEX_PATTERN.test(output.scriptPubKey);
}

function isRecentBroadcastTransaction(value: unknown): value is RecentBroadcastTransaction {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RecentBroadcastTransaction>;
  return typeof item.txid === 'string'
    && TXID_PATTERN.test(item.txid)
    && typeof item.rawTxHex === 'string'
    && HEX_PATTERN.test(item.rawTxHex)
    && typeof item.timestamp === 'number'
    && Number.isFinite(item.timestamp)
    && Array.isArray(item.outputs)
    && item.outputs.every(isRecentBroadcastOutput);
}

async function readRecent(): Promise<RecentBroadcastTransaction[]> {
  try {
    const result = await chrome.storage.session.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    if (!Array.isArray(stored)) return [];
    return stored
      .filter(isRecentBroadcastTransaction)
      .filter((item) => !isExpired(item.timestamp, TTL_MS));
  } catch {
    return [];
  }
}

/** Persist safe outputs only after the containing transaction has broadcast successfully. */
export async function rememberSuccessfulBroadcast(
  rawTxHex: string,
  ownAddresses: Iterable<string>
): Promise<void> {
  const safeOutputs = extractSafeOwnChangeOutputs(rawTxHex, ownAddresses);
  if (safeOutputs.length === 0) return;

  const txid = safeOutputs[0]!.txid;
  const transaction: RecentBroadcastTransaction = {
    txid,
    rawTxHex,
    timestamp: Date.now(),
    outputs: safeOutputs.map(({ vout, address, value, scriptPubKey }) => ({
      vout,
      address,
      value,
      scriptPubKey,
    })),
  };

  await withWriteLock(async () => {
    const existing = await readRecent();
    const next = [transaction, ...existing.filter((item) => item.txid !== txid)]
      .slice(0, MAX_TRANSACTIONS);
    await chrome.storage.session.set({ [STORAGE_KEY]: next });
  });
}

/** Resolve an input without waiting for a public Bitcoin indexer to observe its parent. */
export async function getTrustedBroadcastPrevout(
  txid: string,
  vout: number,
  address?: string
): Promise<TrustedBroadcastPrevout | null> {
  const transactions = await readRecent();
  const transaction = transactions.find((item) => item.txid === txid);
  const output = transaction?.outputs.find((item) => item.vout === vout);
  if (
    !transaction
    || !output
    || (address !== undefined
      && normalizeAddressForComparison(output.address) !== normalizeAddressForComparison(address))
  ) return null;
  return { txid, rawTxHex: transaction.rawTxHex, ...output };
}

/** Test/debug reset. */
export async function clearRecentBroadcasts(): Promise<void> {
  await chrome.storage.session.remove(STORAGE_KEY);
}
