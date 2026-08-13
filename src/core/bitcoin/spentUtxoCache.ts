import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';

/**
 * Spent UTXO Cache — Prevents race conditions in rapid transactions.
 *
 * After broadcasting a transaction, records which UTXOs were consumed so
 * subsequent UTXO selections can exclude them before mempool propagation
 * catches up (typically 1-10 seconds).
 *
 * In-memory only — clears on restart, which is fine since the mempool will
 * have caught up by then. Uses lazy TTL expiry (no timers).
 *
 * THE MAP IS PER-CONTEXT, and that bit us: the background worker recorded on
 * broadcast (transactionBroadcaster) while compose and UTXO selection read in
 * the POPUP — two contexts, two maps, so the popup consulted a permanently
 * empty copy and quick back-to-back transactions re-picked just-spent inputs
 * ("UTXO not found for input 0"). Every context that composes must therefore
 * record on its own side of the boundary: the popup does so in
 * wallet-context's broadcastTransaction wrapper, from the signed hex it just
 * sent across.
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
 * Record every input of a signed transaction as spent, from its raw hex.
 *
 * For callers that hold the transaction they just broadcast rather than a
 * parsed input list. Unparseable hex records nothing — a transaction that
 * cannot be parsed was not broadcast by us, and guessing inputs would
 * exclude UTXOs that are still spendable.
 */
export function recordSpentInputsFromRawTx(rawTxHex: string): void {
  const parsed = parseRawTransactionLocally(rawTxHex);
  if (!parsed) return;
  recordSpentUtxos(parsed.inputs.map(({ txid, vout }) => ({ txid, vout })));
}

/**
 * Clear all entries. Useful for testing or manual reset.
 */
export function clearSpentUtxoCache(): void {
  spentUtxos.clear();
  pendingChange.clear();
}

/**
 * Get the number of tracked entries (including possibly expired ones).
 * For debugging purposes.
 */
export function getSpentUtxoCacheSize(): number {
  return spentUtxos.size;
}

// ── Pending change: the symmetric twin ───────────────────────────────────────
//
// The map above records what a broadcast took AWAY so the next compose cannot
// re-spend it. This one records what a broadcast gave BACK: outputs paying our
// own addresses, registered as immediately-spendable virtual UTXOs. Without it,
// an address whose only UTXO was just spent has nothing to compose with until
// mempool.space lists the change — a seconds-wide window where back-to-back
// chaining fails on "no UTXOs" despite the wallet holding the change in its
// hand. Same TTL, same reasoning: by expiry the mempool lists it for real.
//
// Which outputs are SAFE to register is not decided here — an attach binds an
// asset to an output paying ourselves, and registering that as plain BTC would
// let the next compose burn the attachment. `core/counterparty/pendingChange`
// owns that judgment; this module just remembers outpoints.

interface PendingChangeEntry {
  address: string;
  value: number;
  timestamp: number;
}

const pendingChange = new Map<string, PendingChangeEntry>();

/** Register outputs of our own broadcast as spendable-by-us. */
export function recordPendingChange(
  entries: { txid: string; vout: number; address: string; value: number }[]
): void {
  const now = Date.now();
  for (const { txid, vout, address, value } of entries) {
    pendingChange.set(makeKey(txid, vout), { address, value, timestamp: now });
  }
}

/**
 * The virtual UTXOs currently registered for an address. Expired entries are
 * lazily dropped; entries later spent by another of our own transactions are
 * filtered by the caller via {@link isUtxoRecentlySpent}, keeping one
 * definition of "spent".
 */
export function getPendingChangeUtxos(
  address: string
): { txid: string; vout: number; value: number }[] {
  const now = Date.now();
  const result: { txid: string; vout: number; value: number }[] = [];
  for (const [key, entry] of pendingChange) {
    if (now - entry.timestamp > SPENT_UTXO_TTL_MS) {
      pendingChange.delete(key);
      continue;
    }
    if (entry.address !== address) continue;
    const [txid, vout] = key.split(':');
    result.push({ txid: txid!, vout: Number(vout), value: entry.value });
  }
  return result;
}
