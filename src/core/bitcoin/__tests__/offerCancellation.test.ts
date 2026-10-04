import { describe, expect, it } from 'vitest';
import { withOfferCoinLocks } from '@/core/bitcoin/coinLocks';
import { cancellationCoinReview, MAX_CANCEL_OFFER_COINS, parseCancelOffersIntent, withCancelledOfferCoinLocks } from '@/core/bitcoin/offerCancellation';
import type { CoinLock } from '@/types/coinLocks';

const address = 'bc1qowner';
const origin = 'https://market.example';
const txid = 'a'.repeat(64);
const coin = { outpoint: { txid, vout: 1 }, stillCommitted: false };
const claim = { standard: 'counterparty-marketplace', action: 'cancel_offers', offerIds: ['cancelled'], coins: [coin] };
const intent = parseCancelOffersIntent(claim)!;
const lock = (extra: Partial<CoinLock> = {}): CoinLock => ({
  address, outpoint: `${txid}:1`, origin, kind: 'offer_slot', manual: false, refs: ['cancelled', 'remaining'],
  valueSats: 1000, expiresAt: null, createdAt: 1, seenAt: 1, unlocked: false, ...extra,
});

describe('optional cancellation metadata', () => {
  it('ignores malformed metadata and drops malformed entries without changing the message', () => {
    for (const value of [null, 'text', {}, { ...claim, standard: 'other' }, { ...claim, coins: 1 }]) {
      expect(parseCancelOffersIntent(value)).toBeUndefined();
    }
    expect(parseCancelOffersIntent({ ...claim, offerIds: [1, '', 'cancelled', 'cancelled', 'x'.repeat(129)], coins: [
      null, {}, { ...coin, stillCommitted: 'false' }, { ...coin, outpoint: { txid, vout: -1 } },
      { ...coin, outpoint: { txid, vout: 2 ** 32 } }, { ...coin, outpoint: { txid: 'bad', vout: 1 } }, coin,
    ] })).toEqual(intent);
  });

  it('caps input and merges contradictory duplicates conservatively', () => {
    const many = Array.from({ length: 110 }, (_, vout) => ({ ...coin, outpoint: { txid, vout } }));
    expect(parseCancelOffersIntent({ ...claim, coins: many })?.coins).toHaveLength(MAX_CANCEL_OFFER_COINS);
    expect(parseCancelOffersIntent({ ...claim, coins: [coin, { ...coin, stillCommitted: true }, coin] })?.coins)
      .toEqual([{ ...coin, stillCommitted: true }]);
  });
});

describe('cancellation affects only the signing site\'s offer locks', () => {
  it('releases by outpoint and origin even when offer ids were never recorded', () => {
    expect(withCancelledOfferCoinLocks([lock({ refs: [] })], address, origin, intent))
      .toEqual([lock({ refs: [], unlocked: true, cancelled: true })]);
    expect(cancellationCoinReview([lock()], origin, intent)).toEqual([{ outpoint: `${txid}:1`, effect: 'unlocks', presigned: true }]);
  });

  it('keeps the released record, marked cancelled, because what was signed against the coin still works', () => {
    // The marketplace names offers by offer id; the slot also carries the authorization's own id,
    // which no cancellation names. The site's word that the coin is no longer committed decides.
    const released = withCancelledOfferCoinLocks([lock({ refs: ['auth-uuid', 'cancelled'] })], address, origin, intent);
    expect(released).toEqual([lock({ refs: ['auth-uuid'], unlocked: true, cancelled: true })]);
    // A coin the user had already unlocked is marked too, and cancelling it again changes nothing.
    expect(withCancelledOfferCoinLocks([lock({ unlocked: true })], address, origin, intent))
      .toEqual([lock({ refs: ['remaining'], unlocked: true, cancelled: true })]);
    expect(withCancelledOfferCoinLocks(released!, address, origin, intent)).toBeNull();
  });

  it('says a signed spend of the coin outlives the cancellation only where the wallet signed one', () => {
    const review = (locks: CoinLock[]) => cancellationCoinReview(locks, origin, intent)[0]?.presigned;
    expect(review([lock({ refs: ['auth-uuid'] })])).toBe(true);
    expect(review([lock({ kind: 'collection_offer', refs: [] })])).toBe(true);
    expect(review([lock({ refs: ['auth-uuid'], unlocked: true })])).toBe(true);
    expect(review([lock({ refs: ['auth-uuid'], sharedOrigins: [origin], origin: 'https://first.example' })])).toBe(true);
    // Funding alone signs no spend of the slot; nor does a hand lock, another site's offer, or no lock.
    expect(review([lock({ refs: [] })])).toBe(false);
    expect(review([lock({ kind: 'manual', manual: true, refs: [], origin: null })])).toBe(false);
    expect(review([lock({ origin: 'https://elsewhere.example' })])).toBe(false);
    expect(review([])).toBe(false);
  });

  it.each([
    { origin: 'https://another.example' }, { kind: 'manual' as const, manual: true },
    { manual: true }, { address: 'bc1qother' }, { outpoint: `${txid}:2` },
  ])('preserves unrelated or hand locks (%j)', extra => {
    expect(withCancelledOfferCoinLocks([lock(extra)], address, origin, intent)).toBeNull();
  });

  it('keeps a committed coin locked even after all named references are removed', () => {
    const still = parseCancelOffersIntent({ ...claim, coins: [{ ...coin, stillCommitted: true }] })!;
    expect(withCancelledOfferCoinLocks([lock({ refs: ['cancelled'] })], address, origin, still))
      .toEqual([lock({ refs: [] })]);
    expect(withCancelledOfferCoinLocks([lock()], address, origin, still)).toEqual([lock({ refs: ['remaining'] })]);
    expect(cancellationCoinReview([lock()], origin, still)[0]?.effect).toBe('stays_locked');
  });

  describe('a coin two sites committed', () => {
    const second = 'https://second.example';
    const both = () => {
      const first = withOfferCoinLocks([], address, [{ outpoint: `${txid}:1`, kind: 'offer_slot', refs: ['cancelled'],
        valueSats: 1000, origin, expiresAt: 2_000_000_000 }], 1_900_000_000)!;
      return withOfferCoinLocks(first, address, [{ outpoint: `${txid}:1`, kind: 'offer_slot', refs: ['theirs'],
        valueSats: 1000, origin: second, expiresAt: 2_000_000_000 }], 1_900_000_000)!;
    };

    it('stays locked for the other site when the first cancels, and the screen does not say Unlocks', () => {
      const locks = both();
      expect(cancellationCoinReview(locks, origin, intent)[0]?.effect).toBe('stays_locked');
      const after = withCancelledOfferCoinLocks(locks, address, origin, intent)!;
      expect(after).toEqual([expect.objectContaining({ origin: second, refs: ['theirs'], unlocked: false })]);
      expect(after[0]).not.toHaveProperty('sharedOrigins');
      expect(after[0]).not.toHaveProperty('cancelled');
      // Now the other site's own cancellation releases it.
      expect(cancellationCoinReview(after, second, intent)[0]?.effect).toBe('unlocks');
      expect(withCancelledOfferCoinLocks(after, address, second, intent))
        .toEqual([expect.objectContaining({ origin: second, unlocked: true, cancelled: true })]);
    });

    it('stays locked for the first site when the second cancels', () => {
      const locks = both();
      expect(cancellationCoinReview(locks, second, intent)[0]?.effect).toBe('stays_locked');
      const after = withCancelledOfferCoinLocks(locks, address, second, intent)!;
      expect(after).toEqual([expect.objectContaining({ origin, refs: ['theirs'], unlocked: false })]);
      expect(after[0]).not.toHaveProperty('sharedOrigins');
    });
  });

  it('shows hand locks and foreign locks as staying locked, and missing coins as having no lock', () => {
    expect(cancellationCoinReview([lock({ manual: true })], origin, intent)[0]?.effect).toBe('stays_locked');
    expect(cancellationCoinReview([lock({ origin: 'https://elsewhere.example' })], origin, intent)[0]?.effect).toBe('stays_locked');
    expect(cancellationCoinReview([], origin, intent)[0]?.effect).toBe('no_lock');
  });
});
