/**
 * The wallet's locked coins: outputs of its own that nothing but the user's say-so may spend.
 *
 * A marketplace offer is BTC that stays in the bidder's wallet. An exact offer is backed by a
 * funding slot the site pre-signs a spend of; a collection offer by a parent that spends the
 * bidder's funding coins and is never broadcast alone. Either way the offer lives only as long as
 * those coins stay unspent, so an ordinary send that happened to pick one would cancel the offer
 * without a word. The wallet therefore locks each coin a signed offer commits (only what the
 * signature itself proved, see core/counterparty/marketplace/offerCoinLocks.ts), and the user can
 * lock any plain coin by hand as classic coin control. Selection and every compose leave locked
 * coins alone, and a site asking to sign one is told so first.
 *
 * It lives in the encrypted keychain beside the ZELD record (core/zeld/knownOutpoints.ts) for the
 * same reasons: which outputs an address holds and what they back is the user's own linkable data,
 * a write only re-encrypts under the session key, and a reset forgets it with everything else. A
 * restored wallet starts with no locks; the marketplace can hand its offers back later.
 *
 * Locks come off by themselves, and only on evidence: the coin was seen unspent and is now gone
 * (spent), it was never seen a day after the offer was signed (the funding never went out, or was
 * replaced), or the offer expired over an hour ago (an expired offer cannot settle). A failed
 * lookup is not evidence and removes nothing. A lock the user made by hand has no expiry and no
 * orphan rule: only spending the coin removes it.
 */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { isRecord } from '@/core/isRecord';

export type CoinLockKind = 'manual' | 'offer_slot' | 'collection_offer';
export type OfferCoinLockKind = Exclude<CoinLockKind, 'manual'>;

export interface CoinLock {
  /** `txid:vout`, txid in lowercase hex. */
  outpoint: string;
  /** The owning address, as `normalizeAddressForComparison` writes it. */
  address: string;
  /** Why it is locked: by hand, or for an offer (which wins when both apply). */
  kind: CoinLockKind;
  /** The user also locked it by hand. Always true for `manual`; kept when an offer adds its own. */
  manual: boolean;
  /** Offer, authorization or policy-offer ids the coin backs, when the signed intent named them. */
  refs: string[];
  valueSats: number;
  /** The site whose signature request committed the coin. Null for a lock made by hand. */
  origin: string | null;
  /** Unix seconds, the latest expiry across the offers it backs. Null when none is known. */
  expiresAt: number | null;
  /** Unix seconds. */
  createdAt: number;
  /** Unix seconds when the coin was last seen unspent, or null before it ever was. */
  seenAt: number | null;
  /** The user unlocked it. The record stays while the offer lives, so it can be locked again. */
  unlocked: boolean;
}

/** One offer commitment a signature proved, as the background records it. */
export interface OfferCoinCommitment {
  outpoint: string;
  kind: OfferCoinLockKind;
  refs: string[];
  valueSats: number;
  origin: string;
  expiresAt: number | null;
}

/** What an extension page may change: its own coin control, and what its UTXO read observed. */
export interface CoinLockUpdate {
  /** Lock these coins by hand. */
  lock?: Array<{ outpoint: string; valueSats: number }>;
  /** Unlock: a hand lock is removed, an offer lock is marked unlocked. */
  unlock?: string[];
  /** Lock an unlocked offer coin again while its offer lives. */
  relock?: string[];
  /**
   * A successful UTXO read of the address, as the lock outpoints it found unspent. Every other
   * lock of the address was absent from that read, which is what the spent and orphan rules need.
   */
  observed?: { present: string[] };
}

/** Locks kept per address. */
export const MAX_COIN_LOCKS_PER_ADDRESS = 200;
/** Locks kept across every address. */
export const MAX_COIN_LOCK_ENTRIES = 2_000;
/** Outpoints one update may name. */
export const MAX_COIN_LOCK_UPDATE = 500;
/** Offer ids one lock keeps. Several offers may share a funding slot; far fewer ever do. */
export const MAX_COIN_LOCK_REFS = 64;
const MAX_REF_LENGTH = 128;
const MAX_ORIGIN_LENGTH = 512;
const MAX_ADDRESS_LENGTH = 128;

/** A lock that was never seen on chain after this long funds nothing that went out. */
export const COIN_LOCK_ORPHAN_SECONDS = 24 * 60 * 60;
/** How long past its offer's expiry a lock is kept: an expired offer cannot settle after this. */
export const COIN_LOCK_EXPIRY_GRACE_SECONDS = 60 * 60;
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
  typeof value === 'string' && value.length > 0 && value.length <= MAX_REF_LENGTH;

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
    unlocked: value.unlocked,
  };
}

/**
 * The stored list, keeping only well-formed locks, one per address and outpoint, at most the most
 * recent MAX. A malformed record is dropped, never a lockout.
 */
export function sanitizeCoinLocks(value: unknown): CoinLock[] {
  if (!Array.isArray(value)) return [];
  const byKey = new Map<string, CoinLock>();
  for (const item of value) {
    const lock = parseStoredLock(item);
    if (lock) byKey.set(`${lock.address} ${lock.outpoint}`, lock);
  }
  return [...byKey.values()].slice(-MAX_COIN_LOCK_ENTRIES);
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
    if (!isRecord(value.observed)) throw new Error('Invalid coin lock update');
    update.observed = { present: outpointList(value.observed.present, 'coin lock update') };
  }
  return update;
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
      refs: [...new Set(item.refs as string[])].slice(0, MAX_COIN_LOCK_REFS),
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

/** Whether a locked coin backs any offer (else the user locked it by hand alone). */
export const backsOffers = (lock: Pick<CoinLock, 'kind'>): boolean => lock.kind !== 'manual';

function sameLocks(left: readonly CoinLock[], right: readonly CoinLock[]): boolean {
  return left.length === right.length && left.every((lock, index) => JSON.stringify(lock) === JSON.stringify(right[index]));
}

/** `entries` with `address`'s locks replaced by `next`, bounded; null when nothing changed. */
function replaceAddress(entries: readonly CoinLock[], address: string, current: readonly CoinLock[], next: CoinLock[]): CoinLock[] | null {
  const bounded = next.slice(-MAX_COIN_LOCKS_PER_ADDRESS);
  if (sameLocks(current, bounded)) return null;
  const key = normalizeAddressForComparison(address);
  return [...entries.filter(lock => lock.address !== key), ...bounded].slice(-MAX_COIN_LOCK_ENTRIES);
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
  const present = update.observed ? new Set(update.observed.present) : null;
  const next: CoinLock[] = [];
  for (const recorded of current) {
    let lock: CoinLock | null = applyClock(recorded, now);
    if (lock && present) {
      if (present.has(lock.outpoint)) {
        // Refreshed at most hourly: the rules only ask whether it was ever seen, and a write per
        // read would re-encrypt the keychain on every send.
        if (lock.seenAt === null || now - lock.seenAt >= COIN_LOCK_SEEN_REFRESH_SECONDS) lock = { ...lock, seenAt: now };
      } else if (lock.seenAt !== null) {
        // Seen unspent before and gone now: spent. Whatever it backed is over.
        lock = null;
      } else if (lock.kind !== 'manual' && now - lock.createdAt > COIN_LOCK_ORPHAN_SECONDS) {
        // A day on and never seen: the funding never went out, or a replacement spent its inputs.
        lock = withoutEndedOffer(lock);
      }
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

/**
 * `entries` with offer commitments a signature just proved added to `address`, or null when they
 * are already recorded. One lock per coin: a further offer on the same slot adds its id and extends
 * the expiry, and a coin locked by hand keeps that too. A fresh commitment locks the coin again
 * even if the user had unlocked it: they just signed something that relies on it.
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
        refs: commitment.refs.slice(0, MAX_COIN_LOCK_REFS), valueSats: commitment.valueSats,
        origin: commitment.origin, expiresAt: commitment.expiresAt, createdAt: now, seenAt: null, unlocked: false,
      });
      continue;
    }
    const offer = backsOffers(existing);
    next[index] = {
      ...existing,
      kind: offer ? existing.kind : commitment.kind,
      refs: [...new Set([...existing.refs, ...commitment.refs])].slice(0, MAX_COIN_LOCK_REFS),
      valueSats: existing.valueSats > 0 ? existing.valueSats : commitment.valueSats,
      origin: offer ? existing.origin ?? commitment.origin : commitment.origin,
      expiresAt: offer ? laterExpiry(existing.expiresAt, commitment.expiresAt) : commitment.expiresAt,
      unlocked: false,
    };
  }
  return replaceAddress(entries, address, current, next);
}
