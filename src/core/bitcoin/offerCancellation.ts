/** Site-declared cancellation, approved with a message signature. Never contacts the marketplace. */

import { MAX_CANCELLED_OFFER_IDS, MAX_OFFER_COMMITMENTS, MAX_OFFER_ID_LENGTH } from '@/constants/offerLimits';
import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { normalizeOutpoint } from '@/core/bitcoin/coinLocks';
import { isRecord } from '@/core/isRecord';
import type { CoinLock } from '@/types/coinLocks';

export const MAX_CANCEL_OFFER_COINS = MAX_OFFER_COMMITMENTS;

export interface CancelOffersIntent {
  standard: 'counterparty-marketplace';
  action: 'cancel_offers';
  offerIds: string[];
  coins: Array<{ outpoint: { txid: string; vout: number }; stillCommitted: boolean }>;
}

/** Optional metadata must not break ordinary message signing. Invalid entries are ignored. */
export function parseCancelOffersIntent(value: unknown): CancelOffersIntent | undefined {
  if (!isRecord(value) || value.standard !== 'counterparty-marketplace' || value.action !== 'cancel_offers'
    || !Array.isArray(value.offerIds) || !Array.isArray(value.coins)) return undefined;
  const offerIds = [...new Set(value.offerIds.slice(0, MAX_CANCELLED_OFFER_IDS).filter((id): id is string =>
    typeof id === 'string' && id.length > 0 && id.length <= MAX_OFFER_ID_LENGTH))];
  if (offerIds.length === 0) return undefined;
  const coins = new Map<string, CancelOffersIntent['coins'][number]>();
  for (const coin of value.coins.slice(0, MAX_CANCEL_OFFER_COINS)) {
    if (!isRecord(coin) || !isRecord(coin.outpoint) || typeof coin.stillCommitted !== 'boolean') continue;
    const { txid, vout } = coin.outpoint;
    if (typeof txid !== 'string' || typeof vout !== 'number' || !Number.isSafeInteger(vout) || vout < 0 || vout > 0xffffffff) continue;
    const key = normalizeOutpoint(`${txid}:${vout}`);
    if (!key) continue;
    // Contradictory duplicate claims must preserve the lock.
    coins.set(key, { outpoint: { txid: txid.toLowerCase(), vout }, stillCommitted: coin.stillCommitted || coins.get(key)?.stillCommitted === true });
  }
  return { standard: 'counterparty-marketplace', action: 'cancel_offers', offerIds, coins: [...coins.values()] };
}

export interface CancelOfferCoinReview {
  outpoint: string;
  effect: 'unlocks' | 'stays_locked' | 'no_lock';
  /**
   * The wallet signed a spend of this coin for the site's offers (an exact-offer authorization, or
   * a collection offer's funding). Cancelling does not undo that signature: it works until the coin
   * is spent. Judged from the lock: a collection offer always signed one, and an offer slot did
   * once it names an offer (fund_offers alone names none).
   */
  presigned: boolean;
}

type CancelledCoin = CancelOffersIntent['coins'][number];

const coinKey = (coin: CancelledCoin): string => `${coin.outpoint.txid}:${coin.outpoint.vout}`;

/** Whether `origin` holds a claim on `lock`: it made the lock, or later committed the coin too. */
const claims = (lock: CoinLock, origin: string): boolean =>
  lock.origin === origin || (lock.sharedOrigins?.includes(origin) ?? false);

/**
 * `lock` once `origin` cancels the offers `cancelled` on its coin, or `lock` itself when nothing
 * changes. Only that site's claim ends: another site that committed the coin keeps it locked, and
 * a hand lock is never touched. A coin no longer committed is released with its record kept,
 * marked cancelled, because what the wallet signed against it works until the coin is spent.
 * Offer ids only label the lock: the marketplace names an offer differently from the authorization
 * id the signature recorded, so they cannot decide whether the coin is still committed.
 */
function withCancelledClaim(lock: CoinLock, origin: string, coin: CancelledCoin, cancelled: ReadonlySet<string>): CoinLock {
  if (lock.kind === 'manual' || lock.manual || lock.cancelled || !claims(lock, origin)) return lock;
  const refs = lock.refs.filter(ref => !cancelled.has(ref));
  if (coin.stillCommitted) return refs.length === lock.refs.length ? lock : { ...lock, refs };
  const { sharedOrigins: _shared, ...rest } = lock;
  const others = (lock.sharedOrigins ?? []).filter(site => site !== origin);
  if (lock.origin === origin && others.length === 0) return { ...rest, refs, unlocked: true, cancelled: true };
  // The coin stays as it was for the sites still relying on it; the first of them now holds it.
  const [owner = null, ...shared] = lock.origin === origin ? others : [lock.origin, ...others];
  return { ...rest, refs, origin: owner, ...(shared.length > 0 ? { sharedOrigins: shared as string[] } : {}) };
}

export function cancellationCoinReview(locks: readonly CoinLock[], origin: string, intent: CancelOffersIntent): CancelOfferCoinReview[] {
  const cancelled = new Set(intent.offerIds);
  return intent.coins.map(coin => {
    const outpoint = coinKey(coin);
    const offerLock = locks.find(item => item.outpoint === outpoint && item.kind !== 'manual' && claims(item, origin));
    const presigned = offerLock !== undefined && (offerLock.kind === 'collection_offer' || offerLock.refs.length > 0);
    const lock = locks.find(item => item.outpoint === outpoint && !item.unlocked);
    // The rule the signature then applies, so the screen never says a coin unlocks that stays locked.
    const effect = !lock ? 'no_lock'
      : withCancelledClaim(lock, origin, coin, cancelled).unlocked ? 'unlocks' : 'stays_locked';
    return { outpoint, effect, presigned };
  });
}

/** Apply against the latest vault state, so a hand lock added during signing is never removed. */
export function withCancelledOfferCoinLocks(
  entries: readonly CoinLock[], address: string, origin: string, intent: CancelOffersIntent,
): CoinLock[] | null {
  const owner = normalizeAddressForComparison(address);
  const coins = new Map(intent.coins.map(coin => [coinKey(coin), coin]));
  const cancelled = new Set(intent.offerIds);
  let changed = false;
  const next = entries.map(lock => {
    const coin = coins.get(lock.outpoint);
    if (!coin || lock.address !== owner) return lock;
    const updated = withCancelledClaim(lock, origin, coin, cancelled);
    if (updated !== lock) changed = true;
    return updated;
  });
  return changed ? next : null;
}
