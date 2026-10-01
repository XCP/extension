import { describe, expect, it } from 'vitest';
import {
  activeCoinLocks,
  COIN_LOCK_EXPIRY_GRACE_SECONDS,
  COIN_LOCK_ORPHAN_SECONDS,
  type CoinLock,
  coinLocksOf,
  liveCoinLocks,
  MAX_COIN_LOCK_EXPIRY_SECONDS,
  type OfferCoinCommitment,
  parseCoinLockUpdate,
  parseOfferCoinCommitments,
  sanitizeCoinLocks,
  withCoinLockUpdate,
  withOfferCoinLocks,
} from '@/core/bitcoin/coinLocks';

const ADDRESS = 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt';
const OTHER = '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX';
const A = `${'a'.repeat(64)}:0`;
const B = `${'b'.repeat(64)}:1`;
const NOW = 1_800_000_000;
const SITE = 'https://market.example';

const slot = (outpoint: string, extra: Partial<OfferCoinCommitment> = {}): OfferCoinCommitment => ({
  outpoint, kind: 'offer_slot', refs: [], valueSats: 10_000, origin: SITE, expiresAt: NOW + 86_400, ...extra,
});

/** The locks recorded for an address after `apply`, which must have changed something. */
const after = (entries: CoinLock[] | null): CoinLock[] => {
  expect(entries).not.toBeNull();
  return entries!;
};

describe('locked coins in the keychain', () => {
  it('locks a coin by hand, keyed by address, and unlocking removes the hand lock', () => {
    const locked = after(withCoinLockUpdate([], ADDRESS.toUpperCase(), { lock: [{ outpoint: A, valueSats: 5_000 }] }, NOW));
    expect(coinLocksOf(locked, ADDRESS)).toEqual([{
      outpoint: A, address: ADDRESS, kind: 'manual', manual: true, refs: [], valueSats: 5_000,
      origin: null, expiresAt: null, createdAt: NOW, seenAt: NOW, unlocked: false,
    }]);
    expect(coinLocksOf(locked, OTHER)).toEqual([]);
    expect(coinLocksOf(after(withCoinLockUpdate(locked, ADDRESS, { unlock: [A] }, NOW)), ADDRESS)).toEqual([]);
  });

  it('writes nothing when an update changes nothing', () => {
    const locked = after(withCoinLockUpdate([], ADDRESS, { lock: [{ outpoint: A, valueSats: 1 }] }, NOW));
    expect(withCoinLockUpdate(locked, ADDRESS, { observed: { present: [A] } }, NOW + 60)).toBeNull();
    expect(withCoinLockUpdate(locked, ADDRESS, { relock: [A] }, NOW)).toBeNull();
    expect(withOfferCoinLocks(after(withOfferCoinLocks([], ADDRESS, [slot(A)], NOW)), ADDRESS, [slot(A)], NOW)).toBeNull();
  });

  it('keeps one lock per coin: a further offer adds its id and the later expiry', () => {
    const funded = after(withOfferCoinLocks([], ADDRESS, [slot(A)], NOW));
    const authorized = after(withOfferCoinLocks(funded, ADDRESS, [slot(A, { refs: ['auth-1'], expiresAt: NOW + 10 })], NOW));
    const again = after(withOfferCoinLocks(authorized, ADDRESS, [slot(A, { refs: ['auth-2'], expiresAt: NOW + 200_000 })], NOW));
    expect(coinLocksOf(again, ADDRESS)).toEqual([expect.objectContaining({
      outpoint: A, kind: 'offer_slot', manual: false, refs: ['auth-1', 'auth-2'], origin: SITE, expiresAt: NOW + 200_000,
    })]);
  });

  it('keeps a hand lock when an offer locks the same coin, and unlocking removes both reasons', () => {
    const manual = after(withCoinLockUpdate([], ADDRESS, { lock: [{ outpoint: A, valueSats: 10_000 }] }, NOW));
    const both = coinLocksOf(after(withOfferCoinLocks(manual, ADDRESS, [slot(A, { refs: ['auth-1'] })], NOW)), ADDRESS);
    expect(both).toEqual([expect.objectContaining({ kind: 'offer_slot', manual: true, refs: ['auth-1'], origin: SITE })]);
    const unlocked = coinLocksOf(after(withCoinLockUpdate(both, ADDRESS, { unlock: [A] }, NOW)), ADDRESS);
    expect(unlocked).toEqual([expect.objectContaining({ kind: 'offer_slot', manual: false, unlocked: true })]);
    expect(activeCoinLocks(unlocked)).toEqual([]);
  });

  it('keeps an unlocked offer lock while the offer lives, so it can be locked again', () => {
    const locked = after(withOfferCoinLocks([], ADDRESS, [slot(A)], NOW));
    const unlocked = after(withCoinLockUpdate(locked, ADDRESS, { unlock: [A] }, NOW));
    expect(coinLocksOf(unlocked, ADDRESS)[0]).toMatchObject({ unlocked: true });
    expect(coinLocksOf(after(withCoinLockUpdate(unlocked, ADDRESS, { relock: [A] }, NOW)), ADDRESS)[0]).toMatchObject({ unlocked: false });
  });

  it('locks a coin again when a new offer commits it after the user unlocked it', () => {
    const unlocked = after(withCoinLockUpdate(after(withOfferCoinLocks([], ADDRESS, [slot(A)], NOW)), ADDRESS, { unlock: [A] }, NOW));
    expect(coinLocksOf(after(withOfferCoinLocks(unlocked, ADDRESS, [slot(A, { refs: ['auth-9'] })], NOW)), ADDRESS)[0])
      .toMatchObject({ unlocked: false, refs: ['auth-9'] });
  });

  describe('coming off by themselves', () => {
    /** A UTXO read of the address that found `present` of the locks named and missed `absent`. */
    const read = (entries: CoinLock[], present: string[], absent: string[], now: number) =>
      withCoinLockUpdate(entries, ADDRESS, { observed: { present, absent } }, now);
    const chain = (entries: CoinLock[], verdicts: { spent?: string[]; unknown?: string[] }, now: number) =>
      withCoinLockUpdate(entries, ADDRESS, { observed: verdicts }, now);

    it('keeps a coin a read missed as a candidate: a stale or failed-over read proves nothing', () => {
      const locked = after(withOfferCoinLocks([], ADDRESS, [slot(A), slot(B)], NOW));
      const seen = after(read(locked, [A, B], [], NOW + 10));
      expect(coinLocksOf(seen, ADDRESS).map(lock => lock.seenAt)).toEqual([NOW + 10, NOW + 10]);
      // A cached read, the other indexer's mempool, or a spend only in the mempool: all look like this.
      const missed = after(read(seen, [B], [A], NOW + 20));
      expect(coinLocksOf(missed, ADDRESS)).toEqual([
        expect.objectContaining({ outpoint: A, candidateSince: NOW + 20 }),
        expect.objectContaining({ outpoint: B }),
      ]);
      expect(activeCoinLocks(coinLocksOf(missed, ADDRESS))).toHaveLength(2);
      // Missed again: nothing new to write. Found again: no longer a candidate.
      expect(read(missed, [B], [A], NOW + 30)).toBeNull();
      expect(coinLocksOf(after(read(missed, [A, B], [], NOW + 40)), ADDRESS)[0]).not.toHaveProperty('candidateSince');
    });

    it('drops a lock when the chain shows its coin spent by a confirmed transaction', () => {
      const locked = after(withOfferCoinLocks([], ADDRESS, [slot(A), slot(B)], NOW));
      expect(coinLocksOf(after(chain(locked, { spent: [A] }, NOW + 5)), ADDRESS).map(lock => lock.outpoint)).toEqual([B]);
    });

    it('drops a hand lock only on a confirmed spend', () => {
      const manual = after(withCoinLockUpdate([], ADDRESS, { lock: [{ outpoint: A, valueSats: 1 }] }, NOW));
      const years = NOW + 10 * 365 * 86_400;
      expect(liveCoinLocks(manual, ADDRESS, years)).toHaveLength(1);
      const missed = after(read(manual, [], [A], NOW + 1));
      expect(coinLocksOf(missed, ADDRESS)).toHaveLength(1);
      expect(chain(missed, { unknown: [A] }, years)).toBeNull();
      expect(coinLocksOf(after(chain(missed, { spent: [A] }, years)), ADDRESS)).toEqual([]);
    });

    it('drops a coin whose funding neither indexer knows only after a day as a candidate', () => {
      const seen = after(read(after(withOfferCoinLocks([], ADDRESS, [slot(A, { expiresAt: null })], NOW)), [A], [], NOW));
      // Unknown before any read missed it: no candidacy to age.
      expect(chain(seen, { unknown: [A] }, NOW + 2 * COIN_LOCK_ORPHAN_SECONDS)).toBeNull();
      const missed = after(read(seen, [], [A], NOW + 100));
      expect(chain(missed, { unknown: [A] }, NOW + 100 + COIN_LOCK_ORPHAN_SECONDS - 1)).toBeNull();
      expect(coinLocksOf(after(chain(missed, { unknown: [A] }, NOW + 100 + COIN_LOCK_ORPHAN_SECONDS)), ADDRESS)).toEqual([]);
    });

    it('keeps a never-seen offer coin beyond a day until both indexers prove it unknown', () => {
      const locked = after(withOfferCoinLocks([], ADDRESS, [slot(A, { expiresAt: null })], NOW));
      const missed = after(read(locked, [], [A], NOW + 1));
      expect(read(missed, [], [A], NOW + 2 * COIN_LOCK_ORPHAN_SECONDS)).toBeNull();
      expect(coinLocksOf(after(chain(missed, { unknown: [A] }, NOW + 2 * COIN_LOCK_ORPHAN_SECONDS)), ADDRESS)).toEqual([]);
    });

    it('judges only the locks a read named, never one made while it was in flight', () => {
      const offer = after(withOfferCoinLocks([], ADDRESS, [slot(A)], NOW));
      // The user locks B by hand after the read loaded [A] and before it reported.
      const both = after(withCoinLockUpdate(offer, ADDRESS, { lock: [{ outpoint: B, valueSats: 1 }] }, NOW + 1));
      const reported = coinLocksOf(after(read(both, [A], [], NOW + 2)), ADDRESS);
      expect(reported.find(lock => lock.outpoint === B)).toEqual(coinLocksOf(both, ADDRESS).find(lock => lock.outpoint === B));
    });

    it('drops an offer lock an hour past its expiry, on read and on write', () => {
      const expiresAt = NOW + 100;
      const locked = after(withOfferCoinLocks([], ADDRESS, [slot(A, { expiresAt })], NOW));
      expect(liveCoinLocks(locked, ADDRESS, expiresAt + COIN_LOCK_EXPIRY_GRACE_SECONDS)).toHaveLength(1);
      expect(liveCoinLocks(locked, ADDRESS, expiresAt + COIN_LOCK_EXPIRY_GRACE_SECONDS + 1)).toEqual([]);
      expect(coinLocksOf(after(read(locked, [A], [], expiresAt + COIN_LOCK_EXPIRY_GRACE_SECONDS + 1)), ADDRESS)).toEqual([]);
    });

    it('caps an offer lock\'s expiry at the longest offer, however far off or absent the claimed one', () => {
      const cap = NOW + MAX_COIN_LOCK_EXPIRY_SECONDS;
      expect(MAX_COIN_LOCK_EXPIRY_SECONDS).toBe(90 * 86_400 + 3_600);
      const far = after(withOfferCoinLocks([], ADDRESS, [
        slot(A, { expiresAt: NOW + 10 * 365 * 86_400 }), slot(B, { expiresAt: null }),
      ], NOW));
      expect(coinLocksOf(far, ADDRESS).map(lock => lock.expiresAt)).toEqual([cap, cap]);
      // A later signature extends it, from its own time and no further.
      const later = after(withOfferCoinLocks(far, ADDRESS, [slot(A, { refs: ['auth-2'], expiresAt: NOW + 20 * 365 * 86_400 })], NOW + 50));
      expect(coinLocksOf(later, ADDRESS)[0]!.expiresAt).toBe(cap + 50);
      expect(after(withOfferCoinLocks([], ADDRESS, [slot(A, { expiresAt: NOW + 60 })], NOW))[0]!.expiresAt).toBe(NOW + 60);
      expect(liveCoinLocks(far, ADDRESS, cap + COIN_LOCK_EXPIRY_GRACE_SECONDS + 1)).toEqual([]);
    });

    it('turns an ended offer on a coin also locked by hand back into the hand lock', () => {
      const manual = after(withCoinLockUpdate([], ADDRESS, { lock: [{ outpoint: A, valueSats: 1 }] }, NOW));
      const both = after(withOfferCoinLocks(manual, ADDRESS, [slot(A, { refs: ['auth-1'], expiresAt: NOW + 5 })], NOW));
      expect(liveCoinLocks(both, ADDRESS, NOW + 5 + COIN_LOCK_EXPIRY_GRACE_SECONDS + 1)).toEqual([expect.objectContaining({
        kind: 'manual', manual: true, refs: [], origin: null, expiresAt: null, unlocked: false,
      })]);
    });

    it('removes nothing when there is no observation (the lookup failed)', () => {
      const never = after(withOfferCoinLocks([], ADDRESS, [slot(A, { expiresAt: null })], NOW));
      const seen = after(withOfferCoinLocks([], ADDRESS, [slot(B, { expiresAt: null })], NOW));
      const both = [...never, ...after(read(seen, [B], [], NOW + 1))];
      expect(withCoinLockUpdate(both, ADDRESS, {}, NOW + 2 * COIN_LOCK_ORPHAN_SECONDS)).toBeNull();
    });
  });

  describe('bounds and validation', () => {
    it('never evicts accepted protection when more offers or manual locks are added', () => {
      const many = Array.from({ length: 205 }, (_, index) =>
        slot(`${index.toString(16).padStart(64, '0')}:0`));
      const offers = after(withOfferCoinLocks([], ADDRESS, many, NOW));
      expect(activeCoinLocks(coinLocksOf(offers, ADDRESS)).map(lock => lock.outpoint)).toEqual(many.map(lock => lock.outpoint));
      const stored: CoinLock[] = Array.from({ length: 2_003 }, (_, index) => ({
        outpoint: `${index.toString(16).padStart(64, '0')}:0`, address: `bc1q${index}`, kind: 'manual', manual: true,
        refs: [], valueSats: 1, origin: null, expiresAt: null, createdAt: NOW, seenAt: NOW, unlocked: false,
      }));
      const added = after(withCoinLockUpdate([...stored, ...offers], ADDRESS, { lock: [{ outpoint: A, valueSats: 1 }] }, NOW));
      const loaded = sanitizeCoinLocks(added);
      expect(loaded).toEqual(added);
      expect(loaded).toHaveLength(stored.length + offers.length + 1);
      expect(loaded).toContainEqual(stored[0]);
      expect(activeCoinLocks(coinLocksOf(loaded, ADDRESS))).toHaveLength(206);
    });

    it('drops malformed stored locks on load rather than failing the unlock', () => {
      const good = coinLocksOf(after(withOfferCoinLocks([], ADDRESS, [slot(A)], NOW)), ADDRESS)[0]!;
      expect(sanitizeCoinLocks([
        good,
        { ...good, outpoint: 'not-an-outpoint' },
        { ...good, kind: 'listing' },
        { ...good, kind: 'manual', manual: false },
        { ...good, valueSats: -1 },
        { ...good, refs: [7] },
        'garbage',
        null,
      ])).toEqual([good]);
      expect(sanitizeCoinLocks([{ ...good, candidateSince: NOW }, { ...good, outpoint: B, candidateSince: -1 }]))
        .toEqual([{ ...good, candidateSince: NOW }]);
      expect(sanitizeCoinLocks('not a list')).toEqual([]);
    });

    it('refuses a malformed page update or offer commitment outright', () => {
      expect(() => parseCoinLockUpdate({ lock: [{ outpoint: A, valueSats: 1.5 }] })).toThrow();
      expect(() => parseCoinLockUpdate({ unlock: ['xyz'] })).toThrow();
      expect(() => parseCoinLockUpdate({ observed: { present: 'A' } })).toThrow();
      expect(() => parseCoinLockUpdate({ observed: { absent: ['xyz'] } })).toThrow();
      expect(parseCoinLockUpdate({ observed: { present: [A], absent: [B], spent: [], unknown: [A], other: [1] } }))
        .toEqual({ observed: { present: [A], absent: [B], spent: [], unknown: [A] } });
      expect(() => parseCoinLockUpdate(null)).toThrow();
      expect(parseCoinLockUpdate({ unlock: [A.toUpperCase()] })).toEqual({ unlock: [A] });
      expect(() => parseOfferCoinCommitments([{ ...slot(A), kind: 'manual' }])).toThrow();
      expect(() => parseOfferCoinCommitments([{ ...slot(A), origin: '' }])).toThrow();
      expect(parseOfferCoinCommitments([slot(A, { refs: ['x', 'x'] })])).toEqual([slot(A, { refs: ['x'] })]);
    });
  });
});
