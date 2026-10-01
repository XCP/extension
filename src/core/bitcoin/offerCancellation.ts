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
}

export function cancellationCoinReview(locks: readonly CoinLock[], origin: string, intent: CancelOffersIntent): CancelOfferCoinReview[] {
  return intent.coins.map(coin => {
    const outpoint = `${coin.outpoint.txid}:${coin.outpoint.vout}`;
    const lock = locks.find(item => item.outpoint === outpoint && !item.unlocked);
    return { outpoint, effect: !lock ? 'no_lock'
      : lock.manual || lock.kind === 'manual' || lock.origin !== origin || coin.stillCommitted ? 'stays_locked' : 'unlocks' };
  });
}

/** Apply against the latest vault state, so a hand lock added during signing is never removed. */
export function withCancelledOfferCoinLocks(
  entries: readonly CoinLock[], address: string, origin: string, intent: CancelOffersIntent,
): CoinLock[] | null {
  const owner = normalizeAddressForComparison(address);
  const coins = new Map(intent.coins.map(coin => [`${coin.outpoint.txid}:${coin.outpoint.vout}`, coin]));
  const cancelled = new Set(intent.offerIds);
  let changed = false;
  const next = entries.flatMap(lock => {
    const coin = coins.get(lock.outpoint);
    if (!coin || lock.address !== owner || lock.origin !== origin || lock.kind === 'manual' || lock.manual) return [lock];
    if (!coin.stillCommitted) { changed = true; return []; }
    const refs = lock.refs.filter(ref => !cancelled.has(ref));
    if (refs.length === lock.refs.length) return [lock];
    changed = true;
    return [{ ...lock, refs }];
  });
  return changed ? next : null;
}
