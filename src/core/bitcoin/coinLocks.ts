/**
 * The wallet's locked coins: outputs of its own that nothing but the user's say-so may spend.
 *
 * A marketplace offer is BTC that stays in the bidder's wallet. An exact offer is backed by a
 * funding slot the site pre-signs a spend of; a collection offer by a parent that spends the
 * bidder's funding coins and is never broadcast alone. Either way the offer lives only as long as
 * those coins stay unspent, so an ordinary send that happened to pick one would cancel the offer
 * without a word. The wallet therefore locks each coin a signed offer commits (only what the
 * signature itself proved, see core/counterparty/marketplace/offerCoinLocks.ts), and retains coins
 * the user previously locked by hand. Selection and every compose leave locked
 * coins alone, and a site asking to sign one is told so first.
 *
 * It lives in the encrypted keychain beside the ZELD record (core/zeld/knownOutpoints.ts) for the
 * same reasons: which outputs an address holds and what they back is the user's own linkable data,
 * a write only re-encrypts under the session key, and a reset forgets it with everything else. A
 * restored wallet starts with no locks; the marketplace can hand its offers back later.
 *
 * Locks come off by themselves, and only on evidence. A coin missing from a UTXO read is only a
 * candidate: that read is cached, fails over between indexers whose mempools differ, and leaves out
 * coins spent in the mempool. A candidate comes off when an outspend lookup (core/bitcoin/outspend.ts)
 * shows it spent by a confirmed transaction, or when both indexers have never heard of its funding
 * transaction after a day as a candidate. An offer lock also comes off when the offer
 * expired over an hour ago (an expired offer cannot settle); no offer lock outlives the longest
 * offer. A failed lookup is not evidence and removes nothing. A lock the user made by hand has no
 * expiry and no orphan rule: only a confirmed spend of the coin removes it.
 */
import { MAX_OFFER_ID_LENGTH, MAX_OFFER_IDS } from '@/constants/offerLimits';
import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { isRecord } from '@/core/isRecord';
import type { CoinLock, CoinLockKind, CoinLockUpdate, OfferCoinCommitment } from '@/types/coinLocks';


/** Outpoints one update may name. */
export const MAX_COIN_LOCK_UPDATE = 500;
/** Offer ids one lock keeps. Several offers may share a funding slot; far fewer ever do. */
export const MAX_COIN_LOCK_REFS = MAX_OFFER_IDS;

const MAX_ORIGIN_LENGTH = 512;
const MAX_ADDRESS_LENGTH = 128;

/**
 * A lock never seen on chain after this long funds nothing that went out; nor does a candidate
 * whose funding transaction neither indexer has known for this long.
 */
export const COIN_LOCK_ORPHAN_SECONDS = 24 * 60 * 60;
/** How long past its offer's expiry a lock is kept: an expired offer cannot settle after this. */
export const COIN_LOCK_EXPIRY_GRACE_SECONDS = 60 * 60;
/**
 * The furthest ahead an offer lock may expire when written: the longest offer the marketplace
 * makes (90 days, as core/counterparty/policyOffer.ts checks) plus the grace. A site claiming a
 * later expiry, or none, still cannot lock a coin for longer.
 */
export const MAX_COIN_LOCK_EXPIRY_SECONDS = 90 * 24 * 60 * 60 + COIN_LOCK_EXPIRY_GRACE_SECONDS;
const COIN_LOCK_SEEN_REFRESH_SECONDS = 60 * 60;

const OUTPOINT = /^[0-9a-f]{64}:\d{1,10}$/;
const KINDS: readonly CoinLockKind[] = ['manual', 'offer_slot', 'collection_offer'];

/** `txid:vout` in the form locks are keyed by, or null. */
export function normalizeOutpoint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  return OUTPOINT.test(lower) ? lower : null;
}

export const outpointOf = (utxo: { txid: string; vout: number }): string =>
  `${utxo.txid.toLowerCase()}:${utxo.vout}`;

const isTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isSats = isTimestamp;
const isRef = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_OFFER_ID_LENGTH;

/** One stored lock, or null when anything about it is malformed. */
function parseStoredLock(value: unknown): CoinLock | null {
  if (!isRecord(value)) return null;
  const outpoint = normalizeOutpoint(value.outpoint);
  const kind = KINDS.find(item => item === value.kind);
  if (!outpoint || !kind
    || typeof value.address !== 'string' || value.address.length === 0 || value.address.length > MAX_ADDRESS_LENGTH
    || typeof value.manual !== 'boolean' || (kind === 'manual' && !value.manual)
    || !Array.isArray(value.refs) || value.refs.length > MAX_COIN_LOCK_REFS || !value.refs.every(isRef)
    || !isSats(value.valueSats)
    || (value.origin !== null && (typeof value.origin !== 'string' || value.origin.length > MAX_ORIGIN_LENGTH))
    || (value.expiresAt !== null && !isTimestamp(value.expiresAt))
    || !isTimestamp(value.createdAt)
    || (value.seenAt !== null && !isTimestamp(value.seenAt))
    || (value.candidateSince !== undefined && !isTimestamp(value.candidateSince))
    || typeof value.unlocked !== 'boolean') return null;
  return {
    outpoint,
    address: normalizeAddressForComparison(value.address),
    kind,
    manual: value.manual,
    refs: [...value.refs as string[]],
    valueSats: value.valueSats,
    origin: value.origin as string | null,
    expiresAt: value.expiresAt as number | null,
    createdAt: value.createdAt,
    seenAt: value.seenAt as number | null,
    ...(value.candidateSince !== undefined ? { candidateSince: value.candidateSince } : {}),
    unlocked: value.unlocked,
  };
}

/**
 * The stored list, keeping every well-formed lock, one per address and outpoint.
 * Count-based eviction would silently make a still-committed coin spendable. Bound individual
 * updates instead; remove accepted locks only through their lifecycle or an explicit unlock.
 */
export function sanitizeCoinLocks(value: unknown): CoinLock[] {
  if (!Array.isArray(value)) return [];
  const byKey = new Map<string, CoinLock>();
  for (const item of value) {
    const lock = parseStoredLock(item);
    if (lock) byKey.set(`${lock.address} ${lock.outpoint}`, lock);
  }
  return [...byKey.values()];
}

const outpointList = (field: unknown, what: string): string[] => {
  if (field === undefined) return [];
  if (!Array.isArray(field) || field.length > MAX_COIN_LOCK_UPDATE) throw new Error(`Invalid ${what}`);
  return field.map((item) => {
    const outpoint = normalizeOutpoint(item);
    if (!outpoint) throw new Error(`Invalid ${what}`);
    return outpoint;
  });
};

/** Validate a page's update before it reaches the keychain. Throws on anything malformed. */
export function parseCoinLockUpdate(value: unknown): CoinLockUpdate {
  if (!isRecord(value)) throw new Error('Invalid coin lock update');
  const update: CoinLockUpdate = {};
  if (value.lock !== undefined) {
    if (!Array.isArray(value.lock) || value.lock.length > MAX_COIN_LOCK_UPDATE) throw new Error('Invalid coin lock update');
    update.lock = value.lock.map((item) => {
      const outpoint = isRecord(item) ? normalizeOutpoint(item.outpoint) : null;
      if (!outpoint || !isRecord(item) || !isSats(item.valueSats)) throw new Error('Invalid coin lock update');
      return { outpoint, valueSats: item.valueSats };
    });
  }
  if (value.unlock !== undefined) update.unlock = outpointList(value.unlock, 'coin lock update');
  if (value.relock !== undefined) update.relock = outpointList(value.relock, 'coin lock update');
  if (value.observed !== undefined) {
    const { observed } = value;
    if (!isRecord(observed)) throw new Error('Invalid coin lock update');
    update.observed = {};
    for (const field of ['present', 'absent', 'spent', 'unknown'] as const) {
      if (observed[field] !== undefined) update.observed[field] = outpointList(observed[field], 'coin lock update');
    }
  }
  return update;
}

function mergeOfferRefs(...groups: readonly string[][]): string[] {
  const refs = [...new Set(groups.flat())];
  if (refs.length > MAX_COIN_LOCK_REFS) throw new Error('Too many offers share this coin. Cancel unused offers before adding more.');
  return refs;
}

/** Validate the background's own offer commitments before they reach the keychain. */
export function parseOfferCoinCommitments(value: unknown): OfferCoinCommitment[] {
  if (!Array.isArray(value) || value.length > MAX_COIN_LOCK_UPDATE) throw new Error('Invalid offer coin commitments');
  return value.map((item) => {
    const outpoint = isRecord(item) ? normalizeOutpoint(item.outpoint) : null;
    if (!outpoint || !isRecord(item)
      || (item.kind !== 'offer_slot' && item.kind !== 'collection_offer')
      || !Array.isArray(item.refs) || !item.refs.every(isRef)
      || !isSats(item.valueSats)
      || typeof item.origin !== 'string' || item.origin.length === 0 || item.origin.length > MAX_ORIGIN_LENGTH
      || (item.expiresAt !== null && !isTimestamp(item.expiresAt))) {
      throw new Error('Invalid offer coin commitments');
    }
    return {
      outpoint,
      kind: item.kind,
      refs: mergeOfferRefs(item.refs as string[]),
      valueSats: item.valueSats,
      origin: item.origin,
      expiresAt: item.expiresAt as number | null,
    };
  });
}

/** The recorded locks of `address`, oldest first, exactly as stored. */
export function coinLocksOf(entries: readonly CoinLock[], address: string): CoinLock[] {
  const key = normalizeAddressForComparison(address);
  return entries.filter(lock => lock.address === key);
}

/** The offer part of a lock is over: past its expiry by more than the grace period. */
const offerExpired = (lock: CoinLock, now: number): boolean =>
  lock.kind !== 'manual' && lock.expiresAt !== null && now > lock.expiresAt + COIN_LOCK_EXPIRY_GRACE_SECONDS;

/** A lock whose offer ended becomes the hand lock it also was, or goes. */
function withoutEndedOffer(lock: CoinLock): CoinLock | null {
  return lock.manual
    ? { ...lock, kind: 'manual', refs: [], origin: null, expiresAt: null, unlocked: false }
    : null;
}

/** Apply the rules that need only the clock: an offer that ended over an hour ago. */
function applyClock(lock: CoinLock, now: number): CoinLock | null {
  return offerExpired(lock, now) ? withoutEndedOffer(lock) : lock;
}

/**
 * The locks of `address` as they stand at `now` (unix seconds): expired offers already off, so a
 * read never enforces a lock the next write would drop. Unlocked records are included; callers
 * that enforce use `activeCoinLocks`.
 */
export function liveCoinLocks(entries: readonly CoinLock[], address: string, now: number): CoinLock[] {
  return coinLocksOf(entries, address).flatMap((lock) => {
    const live = applyClock(lock, now);
    return live ? [live] : [];
  });
}

/** Locks that keep their coin out of reach. */
export const activeCoinLocks = (locks: readonly CoinLock[]): CoinLock[] => locks.filter(lock => !lock.unlocked);

/**
 * A lock as a decision made against it depends on: everything but when a UTXO read last saw or
 * missed the coin (`seenAt`, `candidateSince`), which ordinary balance reads and outspend checks
 * rewrite. The signing guard and an open review's key both compare locks by this.
 */
export const coinLockTerms = (lock: CoinLock): string => JSON.stringify([
  lock.address, lock.outpoint, lock.kind, lock.manual, lock.origin,
  lock.refs, lock.expiresAt, lock.createdAt, lock.unlocked,
]);

/** Whether a locked coin backs any offer (else the user locked it by hand alone). */
export const backsOffers = (lock: Pick<CoinLock, 'kind'>): boolean => lock.kind !== 'manual';

function sameLocks(left: readonly CoinLock[], right: readonly CoinLock[]): boolean {
  return left.length === right.length && left.every((lock, index) => JSON.stringify(lock) === JSON.stringify(right[index]));
}

/** `entries` with `address`'s locks replaced by `next`; null when nothing changed. */
function replaceAddress(entries: readonly CoinLock[], address: string, current: readonly CoinLock[], next: CoinLock[]): CoinLock[] | null {
  if (sameLocks(current, next)) return null;
  const key = normalizeAddressForComparison(address);
  return [...entries.filter(lock => lock.address !== key), ...next];
}

/**
 * `entries` with a page's `update` applied to `address` at `now`, or null when nothing changes, so
 * an unchanged read costs no keychain write. The clock rules are applied on every write too.
 */
export function withCoinLockUpdate(
  entries: readonly CoinLock[],
  address: string,
  update: CoinLockUpdate,
  now: number,
): CoinLock[] | null {
  const key = normalizeAddressForComparison(address);
  const current = coinLocksOf(entries, address);
  const unlock = new Set(update.unlock ?? []);
  const relock = new Set(update.relock ?? []);
  const present = new Set(update.observed?.present ?? []);
  const absent = new Set(update.observed?.absent ?? []);
  const spent = new Set(update.observed?.spent ?? []);
  const unknown = new Set(update.observed?.unknown ?? []);
  const next: CoinLock[] = [];
  for (const recorded of current) {
    let lock: CoinLock | null = applyClock(recorded, now);
    if (lock && spent.has(lock.outpoint)) {
      // Spent by a confirmed transaction: whatever it backed is over.
      lock = null;
    } else if (lock && present.has(lock.outpoint)) {
      // Refreshed at most hourly: the rules only ask whether it was ever seen, and a write per
      // read would re-encrypt the keychain on every send.
      if (lock.seenAt === null || now - lock.seenAt >= COIN_LOCK_SEEN_REFRESH_SECONDS) lock = { ...lock, seenAt: now };
      if (lock.candidateSince !== undefined) {
        const { candidateSince: _found, ...seen } = lock;
        lock = seen;
      }
    } else if (lock && absent.has(lock.outpoint)) {
      if (lock.candidateSince === undefined) lock = { ...lock, candidateSince: now };
    }
    if (lock && unknown.has(lock.outpoint) && lock.candidateSince !== undefined
      && now - lock.candidateSince >= COIN_LOCK_ORPHAN_SECONDS) {
      // A day missing, and neither indexer knows the funding: it never went out, or was replaced.
      lock = withoutEndedOffer(lock);
    }
    if (lock && unlock.has(lock.outpoint)) {
      lock = lock.kind === 'manual' ? null : { ...lock, manual: false, unlocked: true };
    }
    if (lock && relock.has(lock.outpoint) && lock.unlocked) {
      lock = { ...lock, unlocked: false };
    }
    if (lock) next.push(lock);
  }
  for (const { outpoint, valueSats } of update.lock ?? []) {
    const index = next.findIndex(lock => lock.outpoint === outpoint);
    if (index >= 0) {
      next[index] = { ...next[index]!, manual: true, unlocked: false };
    } else {
      next.push({
        outpoint, address: key, kind: 'manual', manual: true, refs: [], valueSats,
        origin: null, expiresAt: null, createdAt: now, seenAt: now, unlocked: false,
      });
    }
  }
  return replaceAddress(entries, address, current, next);
}

/** The later of two offer expiries; an unknown one yields to a known one. */
const laterExpiry = (left: number | null, right: number | null): number | null =>
  left === null ? right : right === null ? left : Math.max(left, right);

/** An offer lock's expiry as written at `now`: never past the longest offer, an unknown one included. */
const cappedExpiry = (expiresAt: number | null, now: number): number =>
  Math.min(expiresAt ?? Number.POSITIVE_INFINITY, now + MAX_COIN_LOCK_EXPIRY_SECONDS);

/**
 * `entries` with offer commitments a signature just proved added to `address`, or null when they
 * are already recorded. One lock per coin: a further offer on the same slot adds its id and extends
 * the expiry (never past MAX_COIN_LOCK_EXPIRY_SECONDS from now), and a coin locked by hand keeps
 * that too. A fresh commitment locks the coin again even if the user had unlocked it: they just
 * signed something that relies on it.
 */
export function withOfferCoinLocks(
  entries: readonly CoinLock[],
  address: string,
  commitments: readonly OfferCoinCommitment[],
  now: number,
): CoinLock[] | null {
  const key = normalizeAddressForComparison(address);
  const current = coinLocksOf(entries, address);
  const next = current.flatMap((lock) => {
    const live = applyClock(lock, now);
    return live ? [live] : [];
  });
  for (const commitment of commitments) {
    const index = next.findIndex(lock => lock.outpoint === commitment.outpoint);
    const existing = index >= 0 ? next[index]! : null;
    if (!existing) {
      next.push({
        outpoint: commitment.outpoint, address: key, kind: commitment.kind, manual: false,
        refs: mergeOfferRefs(commitment.refs), valueSats: commitment.valueSats,
        origin: commitment.origin, expiresAt: cappedExpiry(commitment.expiresAt, now), createdAt: now, seenAt: null,
        unlocked: false,
      });
      continue;
    }
    const offer = backsOffers(existing);
    next[index] = {
      ...existing,
      kind: offer ? existing.kind : commitment.kind,
      refs: mergeOfferRefs(existing.refs, commitment.refs),
      valueSats: existing.valueSats > 0 ? existing.valueSats : commitment.valueSats,
      origin: offer ? existing.origin ?? commitment.origin : commitment.origin,
      expiresAt: cappedExpiry(offer ? laterExpiry(existing.expiresAt, commitment.expiresAt) : commitment.expiresAt, now),
      unlocked: false,
    };
  }
  return replaceAddress(entries, address, current, next);
}
