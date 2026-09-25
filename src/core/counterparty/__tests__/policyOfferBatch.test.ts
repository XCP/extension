import { describe, expect, it } from 'vitest';
import { analyzeMarketplaceBatch, parseMarketplaceBatchIntents } from '@/core/counterparty/marketplaceBatch';
import type { FundPolicyOfferIntentClaim, MarketplaceApprovalReview } from '@/core/counterparty/marketplaceIntent';
import { POLICY_OFFER_VECTORS } from './policyOfferVectors';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const vector = POLICY_OFFER_VECTORS.fund.wpkh;
const claim = vector.claim;
const count = claim.alternatives.length;

/** The reference wire form: every request repeats the complete claim. */
const referenceIntents = (): unknown[] => vector.requests.map(() => clone(claim));
/** The compact form: every request carries the shared claim with only its own alternative. */
const compactIntents = (): unknown[] =>
  claim.alternatives.map(alternative => ({ ...clone(claim), alternatives: [clone(alternative)] }));

/** `count` distinct alternatives, synthetic past the vector's own three; the parser checks only shape. */
const manyAlternatives = (total: number) => Array.from({ length: total }, (_, index) => ({
  ...clone(claim.alternatives[0]!),
  expectedParentTxid: index.toString(16).padStart(64, '0'),
}));

describe('fund-policy-offer batch parser', () => {
  it.each([['reference (complete claim per request)', referenceIntents], ['compact (own alternative per request)', compactIntents]])(
    'admits the %s form, one alternative per item in request order',
    (_label, intents) => {
      const parsed = parseMarketplaceBatchIntents(intents());
      expect(parsed.kind).toBe('fund-policy-offer');
      expect(parsed.intents).toHaveLength(count);
      parsed.intents.forEach((intent, index) => {
        const item = intent as FundPolicyOfferIntentClaim;
        expect(item.alternatives).toHaveLength(1);
        expect(item.alternatives[0]!.expectedParentTxid).toBe(claim.alternatives[index]!.expectedParentTxid);
      });
    },
  );

  it('admits 100 alternatives and refuses 101', () => {
    const hundred = manyAlternatives(100).map(alternative => ({ ...clone(claim), alternatives: [alternative] }));
    expect(parseMarketplaceBatchIntents(hundred).intents).toHaveLength(100);
    const tooMany = manyAlternatives(101).map(alternative => ({ ...clone(claim), alternatives: [alternative] }));
    expect(() => parseMarketplaceBatchIntents(tooMany)).toThrow('1..100');
  });

  it('keeps every other marketplace phase at eight requests', () => {
    const exact = { action: 'authorize_exact_offer' };
    expect(() => parseMarketplaceBatchIntents(Array.from({ length: 9 }, () => exact))).toThrow('1..8');
  });

  it.each<[string, (intents: Array<Record<string, unknown>>) => unknown[]]>([
    ['another bidder', intents => { intents[1]!.bidder = POLICY_OFFER_VECTORS.fund.tr.claim.bidder; return intents; }],
    ['another funding set', intents => {
      (intents[1]!.fundingInputs as Array<{ vout: number }>)[0]!.vout = 9;
      return intents;
    }],
    ['another anchor', intents => { (intents[1]!.anchor as { vout: number }).vout = 9; return intents; }],
    ['another market key', intents => { intents[1]!.marketKey = vector.otherMarketKey; return intents; }],
    ['another delivery', intents => {
      intents[1]!.delivery = { mode: 'detached', address: POLICY_OFFER_VECTORS.keys.deliveryLegacy };
      return intents;
    }],
  ])('refuses alternatives with %s', (_label, mutate) => {
    const intents = compactIntents() as Array<Record<string, unknown>>;
    expect(() => parseMarketplaceBatchIntents(mutate(intents))).toThrow(/must share one bidder/);
  });

  it('refuses complete-form requests that list different alternatives', () => {
    const intents = referenceIntents() as Array<{ alternatives: Array<{ priceSats: number }> }>;
    intents[2]!.alternatives[0]!.priceSats += 1;
    expect(() => parseMarketplaceBatchIntents(intents)).toThrow(/different alternative lists/);
  });

  it('refuses a request carrying a partial list', () => {
    const intents = compactIntents() as Array<{ alternatives: unknown[] }>;
    intents[0]!.alternatives = clone(claim.alternatives.slice(0, 2));
    expect(() => parseMarketplaceBatchIntents(intents)).toThrow(/its own alternative or the complete list/);
  });

  it('refuses a repeated parent and a mixed action', () => {
    const repeated = compactIntents() as Array<{ alternatives: unknown[] }>;
    repeated[1]!.alternatives = clone(repeated[0]!.alternatives);
    expect(() => parseMarketplaceBatchIntents(repeated)).toThrow(/duplicate parent/);
    const mixed = compactIntents();
    mixed[1] = { ...clone(POLICY_OFFER_VECTORS.accept.trSeller.claim) };
    expect(() => parseMarketplaceBatchIntents(mixed)).toThrow(/one semantic action/);
  });
});

describe('fund-policy-offer batch review', () => {
  const parsed = parseMarketplaceBatchIntents(compactIntents());
  const caution = (): MarketplaceApprovalReview => ({
    status: 'caution', family: 'fund_policy_offer', title: 'item', facts: [], notices: [], blockers: [],
  });
  const pinned = { pinnedMarketKeys: [{ xOnlyKey: claim.marketKey, operator: 'Digirare' }] };

  it('summarizes the alternatives once, with the key holder’s authority up to the largest offer', () => {
    const review = analyzeMarketplaceBatch(parsed.kind, parsed.intents, parsed.intents.map(caution), pinned);
    expect(review.status).toBe('caution');
    expect(review.title).toBe(`Make ${count} alternative offers`);
    const largest = Math.max(...claim.alternatives.map(alternative => alternative.offerValueSats));
    expect(review.notices).toEqual([{
      severity: 'warning',
      message: `Digirare’s signing key can complete this offer for up to ${largest.toLocaleString('en-US')} sats until a funding UTXO is spent. Nothing is broadcast now.`,
    }]);
    const labels = review.facts.map(fact => fact.label);
    expect(labels.slice(0, count)).toEqual(claim.alternatives.map((_alternative, index) => `Offer ${index + 1}`));
    expect(review.facts[0]).toMatchObject({
      value: `${claim.alternatives[0]!.priceSats.toLocaleString('en-US')} sats`, description: '“rare-pepe” · Series 3',
    });
    expect(labels).toEqual(expect.arrayContaining(['Network fee', 'Settlement', 'Delivery', 'Funding UTXO', 'Cancellation']));
  });

  it('names a single offer by its price and policy', () => {
    const one = parseMarketplaceBatchIntents([compactIntents()[0]]);
    const review = analyzeMarketplaceBatch(one.kind, one.intents, [caution()], pinned);
    expect(review.title).toBe(`Offer ${claim.alternatives[0]!.priceSats.toLocaleString('en-US')} sats for “rare-pepe” · Series 3`);
    expect(review.facts.map(fact => fact.label)).not.toContain('Settlement');
  });

  it('blocks the whole set when any alternative is blocked, and names no key holder for an unpinned key', () => {
    const reviews = parsed.intents.map(caution);
    reviews[1] = { ...caution(), status: 'blocked', blockers: ['the market key is not pinned in this wallet for funded_policy_offer_v1'] };
    const review = analyzeMarketplaceBatch(parsed.kind, parsed.intents, reviews);
    expect(review.status).toBe('blocked');
    expect(review.blockers).toEqual(['item 2: the market key is not pinned in this wallet for funded_policy_offer_v1']);
    expect(review.notices).toEqual([]);
  });
});
