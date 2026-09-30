/**
 * Where the wallet's locked coins (core/bitcoin/coinLocks.ts) are read and written from.
 *
 * Each extension context installs a store once from its composition root, with the calls that
 * reach the keychain from there: the background calls the wallet service itself, the popup and
 * side panel go through its client. Without one (tests, other contexts) no coin is locked.
 *
 * A read is also when locks come off by themselves: the caller's UTXO read of the address says
 * which locked coins are still unspent, and the background applies the spent and orphan rules to
 * it. A lookup that fails says nothing, so it removes nothing; a store that fails is an error,
 * because answering "no locks" would let a send spend an offer's coin.
 */

import {
  activeCoinLocks,
  type CoinLock,
  type CoinLockUpdate,
  coinLocksOf,
  type OfferCoinCommitment,
  outpointOf,
  withCoinLockUpdate,
} from '@/core/bitcoin/coinLocks';
import { fetchUTXOs, type UTXO } from '@/core/bitcoin/utxo';

export interface CoinLockStore {
  /** The address's live locks, unlocked ones included. Empty while the keychain is locked. */
  read(address: string): Promise<CoinLock[]>;
  update(address: string, update: CoinLockUpdate): Promise<void>;
  /** Background only: record what a signature just committed. */
  commit?(address: string, commitments: OfferCoinCommitment[]): Promise<void>;
}

let store: CoinLockStore | null = null;

export function setCoinLockStore(next: CoinLockStore | null): void {
  store = next;
}

export function getCoinLockStore(): CoinLockStore | null {
  return store;
}

/**
 * The live locks of `address`, after telling the store what `utxos` (or a fresh read, when not
 * given) shows of them. The observation is best effort: if it cannot be written, the locks read
 * are still returned and enforced.
 */
export async function readCoinLocks(address: string, utxos?: readonly UTXO[]): Promise<CoinLock[]> {
  if (!store) return [];
  const locks = await store.read(address);
  if (locks.length === 0) return locks;
  let observed: readonly UTXO[] | null = utxos ?? null;
  if (!observed) {
    try {
      observed = await fetchUTXOs(address);
    } catch {
      return locks;
    }
  }
  const present = new Set(observed.map(outpointOf));
  const update: CoinLockUpdate = { observed: { present: locks.map(lock => lock.outpoint).filter(outpoint => present.has(outpoint)) } };
  // The same rules the background applies, run here first: an observation that changes nothing
  // (the usual case) costs no round trip and no keychain write.
  const next = withCoinLockUpdate(locks, address, update, Math.floor(Date.now() / 1000));
  if (!next) return locks;
  try {
    await store.update(address, update);
    return coinLocksOf(next, address);
  } catch (error) {
    console.warn('Failed to record locked coins seen on chain:', error);
    return locks;
  }
}

/** The outpoints of `address` that selection and composing must leave alone. */
export async function lockedOutpoints(address: string, utxos?: readonly UTXO[]): Promise<Map<string, CoinLock>> {
  const locks = activeCoinLocks(await readCoinLocks(address, utxos));
  return new Map(locks.map(lock => [lock.outpoint, lock]));
}
