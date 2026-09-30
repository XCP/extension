import { describe, expect, it } from 'vitest';
import {
  activeCoinLocks,
  COIN_LOCK_EXPIRY_GRACE_SECONDS,
  COIN_LOCK_ORPHAN_SECONDS,
  type CoinLock,
  coinLocksOf,
  liveCoinLocks,
  MAX_COIN_LOCK_ENTRIES,
  MAX_COIN_LOCKS_PER_ADDRESS,
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
    const observed = (entries: CoinLock[], present: string[], now: number) =>
      withCoinLockUpdate(entries, ADDRESS, { observed: { present } }, now);

    it('drops a coin seen unspent once and gone now: it was spent', () => {
      const locked = after(withOfferCoinLocks([], ADDRESS, [slot(A), slot(B)], NOW));
      const seen = after(observed(locked, [A, B], NOW + 10));
      expect(coinLocksOf(seen, ADDRESS).map(lock => lock.seenAt)).toEqual([NOW + 10, NOW + 10]);
      expect(coinLocksOf(after(observed(seen, [B], NOW + 20)), ADDRESS).map(lock => lock.outpoint)).toEqual([B]);
    });

    it('drops a hand lock only when its coin is spent', () => {
      const manual = after(withCoinLockUpdate([], ADDRESS, { lock: [{ outpoint: A, valueSats: 1 }] }, NOW));
      const years = NOW + 10 * 365 * 86_400;
      expect(liveCoinLocks(manual, ADDRESS, years)).toHaveLength(1);
      expect(observed(manual, [A], years)).not.toBeNull();
      expect(coinLocksOf(after(observed(manual, [A], years)), ADDRESS)).toHaveLength(1);
      expect(coinLocksOf(after(observed(manual, [], years)), ADDRESS)).toEqual([]);
    });

    it('keeps a never-seen offer coin for a day, then drops it as an orphan', () => {
      const locked = after(withOfferCoinLocks([], ADDRESS, [slot(A, { expiresAt: null })], NOW));
      expect(observed(locked, [], NOW + COIN_LOCK_ORPHAN_SECONDS)).toBeNull();
      expect(coinLocksOf(after(observed(locked, [], NOW + COIN_LOCK_ORPHAN_SECONDS + 1)), ADDRESS)).toEqual([]);
    });

    it('drops an offer lock an hour past its expiry, on read and on write', () => {
      const expiresAt = NOW + 100;
      const locked = after(withOfferCoinLocks([], ADDRESS, [slot(A, { expiresAt })], NOW));
      expect(liveCoinLocks(locked, ADDRESS, expiresAt + COIN_LOCK_EXPIRY_GRACE_SECONDS)).toHaveLength(1);
      expect(liveCoinLocks(locked, ADDRESS, expiresAt + COIN_LOCK_EXPIRY_GRACE_SECONDS + 1)).toEqual([]);
      expect(coinLocksOf(after(observed(locked, [A], expiresAt + COIN_LOCK_EXPIRY_GRACE_SECONDS + 1)), ADDRESS)).toEqual([]);
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
      const both = [...never, ...after(observed(seen, [B], NOW + 1))];
      expect(withCoinLockUpdate(both, ADDRESS, {}, NOW + 2 * COIN_LOCK_ORPHAN_SECONDS)).toBeNull();
    });
  });

  describe('bounds and validation', () => {
    it('keeps at most the most recent locks per address and overall', () => {
      const many = Array.from({ length: MAX_COIN_LOCKS_PER_ADDRESS + 5 }, (_, index) =>
        slot(`${index.toString(16).padStart(64, '0')}:0`));
      expect(coinLocksOf(after(withOfferCoinLocks([], ADDRESS, many, NOW)), ADDRESS)).toHaveLength(MAX_COIN_LOCKS_PER_ADDRESS);
      const stored = Array.from({ length: MAX_COIN_LOCK_ENTRIES + 3 }, (_, index) => ({
        outpoint: `${index.toString(16).padStart(64, '0')}:0`, address: `bc1q${index}`, kind: 'manual', manual: true,
        refs: [], valueSats: 1, origin: null, expiresAt: null, createdAt: NOW, seenAt: NOW, unlocked: false,
      }));
      expect(sanitizeCoinLocks(stored)).toHaveLength(MAX_COIN_LOCK_ENTRIES);
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
      expect(sanitizeCoinLocks('not a list')).toEqual([]);
    });

    it('refuses a malformed page update or offer commitment outright', () => {
      expect(() => parseCoinLockUpdate({ lock: [{ outpoint: A, valueSats: 1.5 }] })).toThrow();
      expect(() => parseCoinLockUpdate({ unlock: ['xyz'] })).toThrow();
      expect(() => parseCoinLockUpdate({ observed: { present: 'A' } })).toThrow();
      expect(() => parseCoinLockUpdate(null)).toThrow();
      expect(parseCoinLockUpdate({ unlock: [A.toUpperCase()] })).toEqual({ unlock: [A] });
      expect(() => parseOfferCoinCommitments([{ ...slot(A), kind: 'manual' }])).toThrow();
      expect(() => parseOfferCoinCommitments([{ ...slot(A), origin: '' }])).toThrow();
      expect(parseOfferCoinCommitments([slot(A, { refs: ['x', 'x'] })])).toEqual([slot(A, { refs: ['x'] })]);
    });
  });
});
