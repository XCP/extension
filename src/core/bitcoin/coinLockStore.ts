/**
 * Where the wallet's locked coins (core/bitcoin/coinLocks.ts) are read and written from.
 *
 * Each extension context installs a store once from its composition root, with the calls that
 * reach the keychain from there: the background calls the wallet service itself, the popup and
 * side panel go through its client. Without one (tests, other contexts) no coin is locked.
 *
 * A read is also when locks come off by themselves: the caller's UTXO read of the address says
 * which of the locks it loaded are unspent and which it missed, and the background applies the
 * rules to that. Missing is only a candidate; an outspend lookup after the read
 * (core/bitcoin/outspend.ts) says whether the coin is really spent. A lookup that fails says
 * nothing, so it removes nothing; a store that fails is an error, because answering "no locks"
 * would let a send spend an offer's coin.
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
import { checkOutspends } from '@/core/bitcoin/outspend';
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
 * are still returned and enforced. A lock the read missed is still returned: it is only a
 * candidate until the chain says it is spent.
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
  const unspent = new Set(observed.map(outpointOf));
  // Named one by one from the locks loaded above, so a lock made since is not this read's to judge.
  const present = locks.filter(lock => unspent.has(lock.outpoint)).map(lock => lock.outpoint);
  const absent = locks.filter(lock => !unspent.has(lock.outpoint)).map(lock => lock.outpoint);
  const next = await recordObservation(address, locks, { observed: { present, absent } });
  // Not awaited: a candidate stays locked meanwhile, so no send waits on the network to settle it.
  if (absent.length > 0) void resolveCoinLockCandidates(address, next, absent);
  // Include a hand lock created while the UTXO request was in flight in this send's exclusions.
  return store ? store.read(address) : next;
}

/**
 * `locks` after `update`, telling the store when that changes anything. The same rules the
 * background applies, run here first: an observation that changes nothing (the usual case) costs
 * no round trip and no keychain write.
 */
async function recordObservation(address: string, locks: CoinLock[], update: CoinLockUpdate): Promise<CoinLock[]> {
  const next = withCoinLockUpdate(locks, address, update, Math.floor(Date.now() / 1000));
  if (!next || !store) return locks;
  try {
    await store.update(address, update);
    return coinLocksOf(next, address);
  } catch (error) {
    console.warn('Failed to record locked coins seen on chain:', error);
    return locks;
  }
}

/**
 * Ask the chain about `candidates`, locks of `address` a UTXO read missed, and record what it
 * proved. Bounded and throttled by checkOutspends; never throws.
 */
export async function resolveCoinLockCandidates(address: string, locks: CoinLock[], candidates: readonly string[]): Promise<void> {
  try {
    const { spent, unknown } = await checkOutspends(candidates);
    if (spent.length > 0 || unknown.length > 0) await recordObservation(address, locks, { observed: { spent, unknown } });
  } catch (error) {
    console.warn('Failed to check locked coins on chain:', error);
  }
}

/** The outpoints of `address` that selection and composing must leave alone. */
export async function lockedOutpoints(address: string, utxos?: readonly UTXO[]): Promise<Map<string, CoinLock>> {
  const locks = activeCoinLocks(await readCoinLocks(address, utxos));
  return new Map(locks.map(lock => [lock.outpoint, lock]));
}
