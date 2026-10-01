import { describe, expect, it } from 'vitest';
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
    expect(withCancelledOfferCoinLocks([lock({ refs: [] })], address, origin, intent)).toEqual([]);
    expect(cancellationCoinReview([lock()], origin, intent)).toEqual([{ outpoint: `${txid}:1`, effect: 'unlocks' }]);
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

  it('shows hand locks and foreign locks as staying locked, and missing coins as having no lock', () => {
    expect(cancellationCoinReview([lock({ manual: true })], origin, intent)[0]?.effect).toBe('stays_locked');
    expect(cancellationCoinReview([lock({ origin: 'https://elsewhere.example' })], origin, intent)[0]?.effect).toBe('stays_locked');
    expect(cancellationCoinReview([], origin, intent)[0]?.effect).toBe('no_lock');
  });
});
