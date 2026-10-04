import { describe, expect, it } from 'vitest';
import {
  findLockedCoinSpends,
  lockedCoinSpendAllowed,
  lockedCoinsToUnlock,
  lockedCoinWarning,
  releasedOnSpend,
} from '@/core/bitcoin/lockedCoinSpends';
import type { MarketplaceIntentClaimV1 } from '@/core/counterparty/marketplace/intentTypes';
import type { CoinLock, CoinLockKind } from '@/types/coinLocks';

const ADDRESS = 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt';
const SITE = 'https://market.example';
const OTHER_SITE = 'https://elsewhere.example';
const SLOT = { txid: 'a'.repeat(64), vout: 2 };
const OUTPOINT = `${SLOT.txid}:${SLOT.vout}`;

const lock = (kind: CoinLockKind, extra: Partial<CoinLock> = {}): CoinLock => ({
  outpoint: OUTPOINT, address: ADDRESS, kind, manual: kind === 'manual', refs: kind === 'manual' ? [] : ['offer-1'],
  valueSats: 25_000, origin: kind === 'manual' ? null : SITE, expiresAt: null, createdAt: 1, seenAt: 1, unlocked: false,
  ...extra,
});

/** The intents a signing request can carry, with input 0 spending the locked slot where they spend one. */
const intents = {
  authorize_exact_offer: { action: 'authorize_exact_offer', bitcoinInvalidation: { type: 'spend_funding_outpoint', outpoint: SLOT } },
  authorize_other_slot: { action: 'authorize_exact_offer', bitcoinInvalidation: { type: 'spend_funding_outpoint', outpoint: { ...SLOT, vout: 9 } } },
  fund_offers: { action: 'fund_offers' },
  fund_policy_offer: { action: 'fund_policy_offer' },
  buy_listings: { action: 'buy_listings' },
  accept_exact_offer: { action: 'accept_exact_offer', bitcoinInvalidation: { type: 'spend_funding_outpoint', outpoint: SLOT } },
  invalidate_offers: { action: 'invalidate_offers', fundingInputs: [{ ...SLOT, valueSats: 25_000 }] },
  none: undefined,
} as unknown as Record<string, MarketplaceIntentClaimV1 | undefined>;
const proved = { status: 'proved' } as const;

describe('which spends of a locked coin sign without asking', () => {
  // One row per cell: lock kind × intent × origin × input index, each with a proved review. Only the
  // offer slot's own site, authorizing that slot as input 0, and an offer lock's own site retiring
  // its coins pass; every other cell asks.
  const cases: Array<[CoinLockKind, keyof typeof intents, 'same' | 'other', number, boolean]> = [];
  for (const kind of ['offer_slot', 'collection_offer', 'manual'] as const) {
    for (const intent of Object.keys(intents)) {
      for (const site of ['same', 'other'] as const) {
        for (const index of [0, 1]) {
          const allowed = site === 'same' && (
            (kind === 'offer_slot' && intent === 'authorize_exact_offer' && index === 0)
            || (kind !== 'manual' && intent === 'invalidate_offers'));
          cases.push([kind, intent, site, index, allowed]);
        }
      }
    }
  }

  it.each(cases)('%s lock, %s intent, %s origin, input %i → allowed: %s', (kind, intent, site, index, allowed) => {
    expect(lockedCoinSpendAllowed(lock(kind), {
      origin: site === 'same' ? SITE : OTHER_SITE, intent: intents[intent], review: proved, inputIndex: index,
    })).toBe(allowed);
  });

  it.each([
    ['blocked', false], ['retry', false], [undefined, false], ['caution', false], ['proved', true],
  ] as const)('passes the slot\'s own authorization only once its review proved it (review %s → %s)', (status, allowed) => {
    expect(lockedCoinSpendAllowed(lock('offer_slot'), {
      origin: SITE, intent: intents.authorize_exact_offer, review: status ? { status } : undefined, inputIndex: 0,
    })).toBe(allowed);
  });

  it('never passes an offer slot the user also locked by hand', () => {
    expect(lockedCoinSpendAllowed(lock('offer_slot', { manual: true }), {
      origin: SITE, intent: intents.authorize_exact_offer, review: proved, inputIndex: 0,
    })).toBe(false);
  });

  it.each([
    ['blocked', false], ['retry', false], [undefined, false], ['caution', false], ['proved', true],
  ] as const)('retires the site\'s own offer coins without asking only once the invalidation proved (review %s → %s)', (status, allowed) => {
    for (const kind of ['offer_slot', 'collection_offer'] as const) {
      expect(lockedCoinSpendAllowed(lock(kind), {
        origin: SITE, intent: intents.invalidate_offers, review: status ? { status } : undefined, inputIndex: 1,
      })).toBe(allowed);
    }
  });

  it('asks before an invalidation retires a coin another site\'s offer also relies on, or one locked by hand', () => {
    const spend = { origin: SITE, intent: intents.invalidate_offers, review: proved, inputIndex: 0 };
    expect(lockedCoinSpendAllowed(lock('offer_slot', { sharedOrigins: [OTHER_SITE] }), spend)).toBe(false);
    expect(lockedCoinSpendAllowed(lock('offer_slot', { origin: OTHER_SITE, sharedOrigins: [SITE] }), spend)).toBe(false);
    expect(lockedCoinSpendAllowed(lock('collection_offer', { manual: true }), spend)).toBe(false);
  });

  it('passes anything for a lock the user already unlocked', () => {
    expect(lockedCoinSpendAllowed(lock('manual', { unlocked: true }), { origin: OTHER_SITE, inputIndex: 3 })).toBe(true);
  });
});

describe('finding the locked coins a request would sign', () => {
  const inputs = [{ txid: SLOT.txid, vout: SLOT.vout, address: ADDRESS }, { txid: 'b'.repeat(64), vout: 0, address: ADDRESS }];

  it('names each locked coin the wallet would sign, once, with what it backs', () => {
    const spends = findLockedCoinSpends(
      [{ inputs, signInputs: { [ADDRESS]: [0, 1] } }, { inputs, signInputs: { [ADDRESS]: [0] } }],
      [lock('offer_slot', { refs: ['a', 'b'] })], OTHER_SITE,
    );
    expect(spends).toEqual([{ outpoint: OUTPOINT, address: ADDRESS, kind: 'offer_slot', manual: false, offers: 2, valueSats: 25_000 }]);
  });

  it('warns of an exact offer from the lock\'s own site when its review did not prove it', () => {
    const authorization = { inputs, signInputs: { [ADDRESS]: [0] }, intent: intents.authorize_exact_offer };
    expect(findLockedCoinSpends([{ ...authorization, review: proved }], [lock('offer_slot')], SITE)).toEqual([]);
    const spends = findLockedCoinSpends([{ ...authorization, review: { status: 'retry' } }], [lock('offer_slot')], SITE);
    expect(spends).toEqual([expect.objectContaining({ outpoint: OUTPOINT, kind: 'offer_slot' })]);
    expect(lockedCoinWarning(spends)).toMatchObject({ code: 'locked_coin_spend', title: 'Spends a locked coin' });
  });

  it('ignores inputs the wallet does not sign, and locks that are unlocked', () => {
    expect(findLockedCoinSpends([{ inputs, signInputs: { [ADDRESS]: [1] } }], [lock('manual')], SITE)).toEqual([]);
    expect(findLockedCoinSpends([{ inputs, signInputs: { [ADDRESS]: [0] } }], [lock('manual', { unlocked: true })], SITE)).toEqual([]);
  });

  it('turns the spends into one acknowledgeable warning that unlocks them on confirmation', () => {
    const spends = findLockedCoinSpends([{ inputs, signInputs: { [ADDRESS]: [0] } }], [lock('manual')], SITE);
    const warning = lockedCoinWarning(spends);
    expect(warning).toMatchObject({ severity: 'warning', code: 'locked_coin_spend', message: 'This spends a coin you locked.' });
    expect(lockedCoinsToUnlock(warning ? [warning] : [])).toEqual(new Map([[ADDRESS, [OUTPOINT]]]));
    expect(lockedCoinWarning([])).toBeNull();
  });

  it('leaves an invalidation\'s coins locked on confirmation: its confirmed spend releases them', () => {
    const invalidation = { inputs, signInputs: { [ADDRESS]: [0] }, intent: intents.invalidate_offers, review: proved };
    expect(releasedOnSpend([invalidation])).toBe(true);
    expect(releasedOnSpend([{ inputs, signInputs: {}, intent: intents.fund_offers }])).toBe(false);
    expect(releasedOnSpend([])).toBe(false);
    const spends = findLockedCoinSpends([invalidation], [lock('manual')], SITE);
    const warning = lockedCoinWarning(spends, { releasedOnSpend: true });
    expect(warning).toMatchObject({ code: 'locked_coin_spend', data: { coins: spends, releasedOnSpend: true } });
    expect(lockedCoinsToUnlock([warning!])).toEqual(new Map());
  });
});
