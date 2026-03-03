/**
 * Spent UTXO Cache — Prevents race conditions in rapid transactions.
 *
 * After broadcasting a transaction, records which UTXOs were consumed so
 * subsequent UTXO selections can exclude them before mempool propagation
 * catches up (typically 1-10 seconds).
 *
 * In-memory only — clears on service worker restart, which is fine since
 * mempool will have caught up by then. Uses lazy TTL expiry (no timers).
 */

const SPENT_UTXO_TTL_MS = 60_000; // 60 seconds

const spentUtxos = new Map<string, number>();

function makeKey(txid: string, vout: number): string {
  return `${txid}:${vout}`;
}

/**
 * Record UTXOs as recently spent after a successful broadcast.
 */
export function recordSpentUtxos(inputs: { txid: string; vout: number }[]): void {
  const now = Date.now();
  for (const { txid, vout } of inputs) {
    spentUtxos.set(makeKey(txid, vout), now);
  }
}

/**
 * Check if a UTXO was recently spent (within TTL).
 * Expired entries are lazily removed on read.
 */
export function isUtxoRecentlySpent(txid: string, vout: number): boolean {
  const key = makeKey(txid, vout);
  const timestamp = spentUtxos.get(key);
  if (timestamp === undefined) return false;

  if (Date.now() - timestamp > SPENT_UTXO_TTL_MS) {
    spentUtxos.delete(key);
    return false;
  }
  return true;
}

/**
 * Clear all entries. Useful for testing or manual reset.
 */
export function clearSpentUtxoCache(): void {
  spentUtxos.clear();
}

/**
 * Get the number of tracked entries (including possibly expired ones).
 * For debugging purposes.
 */
export function getSpentUtxoCacheSize(): number {
  return spentUtxos.size;
}
