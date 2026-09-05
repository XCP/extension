/**
 * In-memory journal for wallet-authored unconfirmed DIESEL UTXOs.
 *
 * Public Alkanes indexers may not expose mempool state. Recording the exact output that our wallet
 * built and broadcast lets bulk flows continue one bounded dependency chain without treating an
 * arbitrary unconfirmed output as trusted. The journal is deliberately not persisted.
 */

export interface PendingDieselUtxo {
  txid: string;
  vout: number;
  address: string;
  value: number;
  chainDepth: number;
}

interface PendingDieselEntry extends PendingDieselUtxo {
  timestamp: number;
  active: boolean;
}

// Long enough for an interactive bulk operation. After restart or expiry, unconfirmed UTXOs fail
// closed until an indexer proves their Alkanes state.
const PENDING_DIESEL_TTL_MS = 30 * 60_000;
/** Bitcoin Core's default ancestor count includes the transaction itself. */
export const MAX_PENDING_DIESEL_CHAIN = 25;
const pendingDieselUtxos = new Map<string, PendingDieselEntry>();

function makeKey(txid: string, vout: number): string {
  return `${txid}:${vout}`;
}

/** Record the exact wallet output targeted by a successfully broadcast DIESEL mint. */
export function recordPendingDieselUtxo(
  entry: Omit<PendingDieselUtxo, 'chainDepth'>,
  inputs: Array<{ txid: string; vout: number }>,
): PendingDieselUtxo {
  const now = Date.now();
  let parentDepth = 0;
  for (const input of inputs) {
    const key = makeKey(input.txid, input.vout);
    const parent = pendingDieselUtxos.get(key);
    if (!parent) continue;
    if (now - parent.timestamp > PENDING_DIESEL_TTL_MS) {
      pendingDieselUtxos.delete(key);
      continue;
    }
    if (!parent.active) continue;
    parentDepth = Math.max(parentDepth, parent.chainDepth);
    parent.active = false;
  }
  const recorded: PendingDieselEntry = {
    ...entry,
    chainDepth: parentDepth + 1,
    timestamp: now,
    active: true,
  };
  pendingDieselUtxos.set(makeKey(entry.txid, entry.vout), recorded);
  return recorded;
}

/** Active, wallet-authored unconfirmed DIESEL chain tips for an address. */
export function getPendingDieselUtxos(address: string): PendingDieselUtxo[] {
  const now = Date.now();
  const result: PendingDieselUtxo[] = [];
  for (const [key, entry] of pendingDieselUtxos) {
    if (now - entry.timestamp > PENDING_DIESEL_TTL_MS) {
      pendingDieselUtxos.delete(key);
      continue;
    }
    if (!entry.active || entry.address !== address) continue;
    result.push({
      txid: entry.txid,
      vout: entry.vout,
      address: entry.address,
      value: entry.value,
      chainDepth: entry.chainDepth,
    });
  }
  return result;
}

/** A chain tip reached a block; its next child starts a fresh 25-transaction policy window. */
export function confirmPendingDieselUtxo(txid: string, vout: number): void {
  pendingDieselUtxos.delete(makeKey(txid, vout));
}

/** Clear the unconfirmed journal. Used on wallet/test reset. */
export function clearPendingDieselUtxos(): void {
  pendingDieselUtxos.clear();
}
