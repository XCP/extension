import { describe, expect, it } from 'vitest';
import type { DecodedInput, DecodedOutput } from '@/core/bitcoin/psbt';
import type { MarketplaceIntentClaimV1 } from '@/core/counterparty/marketplace/intentTypes';
import { offerCoinCommitments, type SignedOfferItem } from '@/core/counterparty/marketplace/offerCoinLocks';

const BIDDER = 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt';
const STRANGER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const SITE = 'https://market.example';
const FUND_TXID = 'f'.repeat(64);
const PREV = 'c'.repeat(64);

const input = (txid: string, vout: number, extra: Partial<DecodedInput> = {}): DecodedInput => ({
  index: 0, txid, vout, address: BIDDER, value: 50_000, scriptType: 'p2wpkh', ...extra,
});
const output = (index: number, value: number, address = BIDDER): DecodedOutput => ({
  index, value, address, type: 'p2wpkh', script: '0014',
});
const fundOffers = (extra: Record<string, unknown> = {}) => ({
  action: 'fund_offers', slotCount: 2, marketplaceExpiresAt: 2_000_000_000, operationId: 'op-fund', ...extra,
}) as unknown as MarketplaceIntentClaimV1;
const authorize = (vout: number, authorizationId: string, extra: Record<string, unknown> = {}) => ({
  action: 'authorize_exact_offer', authorizationId, marketplaceExpiresAt: 2_100_000_000,
  bitcoinInvalidation: { type: 'spend_funding_outpoint', outpoint: { txid: FUND_TXID, vout } }, ...extra,
}) as unknown as MarketplaceIntentClaimV1;

const fundingItem = (extra: Partial<SignedOfferItem> = {}): SignedOfferItem => ({
  intent: fundOffers(),
  transactionId: FUND_TXID.toUpperCase(),
  inputs: [input(PREV, 0)],
  outputs: [output(0, 20_000), output(1, 20_000), output(2, 9_000)],
  signInputs: { [BIDDER]: [0] },
  review: { status: 'proved' },
  ...extra,
});
const context = { origin: SITE, ownedAddresses: [BIDDER] };

describe('the coins an offer signature commits', () => {
  it('locks fund_offers slots by the unsigned txid, and nothing past the slots (the change)', () => {
    expect(offerCoinCommitments([fundingItem()], context)).toEqual([0, 1].map(vout => ({
      address: BIDDER,
      commitment: { outpoint: `${FUND_TXID}:${vout}`, kind: 'offer_slot', refs: [], valueSats: 20_000, origin: SITE, expiresAt: 2_000_000_000 },
    })));
  });

  it('locks only slots paying this wallet', () => {
    const commitments = offerCoinCommitments([fundingItem({ outputs: [output(0, 20_000, STRANGER), output(1, 20_000)] })], context);
    expect(commitments.map(entry => entry.commitment.outpoint)).toEqual([`${FUND_TXID}:1`]);
  });

  it('locks nothing when a funding input carries a scriptSig, whose signature would change the txid', () => {
    expect(offerCoinCommitments([fundingItem({ inputs: [input(PREV, 0, { scriptType: 'p2pkh' })] })], context)).toEqual([]);
  });

  it('locks nothing from an item whose review did not prove', () => {
    expect(offerCoinCommitments([fundingItem({ review: { status: 'blocked' } })], context)).toEqual([]);
    expect(offerCoinCommitments([fundingItem({ review: undefined })], context)).toEqual([]);
  });

  it('gives a slot the ids of the offers a bundle authorizes on it', () => {
    const authorizations = [0, 1].map(vout => ({
      intent: authorize(vout, `auth-${vout}`),
      transactionId: 'd'.repeat(64),
      inputs: [input(FUND_TXID, vout, { value: 20_000 }), input('e'.repeat(64), 0, { address: STRANGER })],
      outputs: [],
      signInputs: { [BIDDER]: [0] },
      review: { status: 'caution' as const },
    }));
    expect(offerCoinCommitments([fundingItem(), ...authorizations], context).map(entry => entry.commitment)).toEqual([0, 1].map(vout => ({
      outpoint: `${FUND_TXID}:${vout}`, kind: 'offer_slot', refs: [`auth-${vout}`], valueSats: 20_000, origin: SITE, expiresAt: 2_100_000_000,
    })));
  });

  it('adds an authorization to its slot only when input 0 is that slot, signed and owned', () => {
    const item = (extra: Partial<SignedOfferItem>): SignedOfferItem => ({
      intent: authorize(0, 'auth-0'), transactionId: 'd'.repeat(64), inputs: [input(FUND_TXID, 0)], outputs: [],
      signInputs: { [BIDDER]: [0] }, review: { status: 'caution' }, ...extra,
    });
    expect(offerCoinCommitments([item({})], context)).toHaveLength(1);
    expect(offerCoinCommitments([item({ inputs: [input(FUND_TXID, 1)] })], context)).toEqual([]);
    expect(offerCoinCommitments([item({ signInputs: { [BIDDER]: [] } })], context)).toEqual([]);
    expect(offerCoinCommitments([item({ inputs: [input(FUND_TXID, 0, { address: STRANGER })] })], context)).toEqual([]);
  });

  it('locks each funding coin of a policy offer that the wallet signed, once across alternatives', () => {
    const policy = (expiresAt: number): SignedOfferItem => ({
      intent: {
        action: 'fund_policy_offer', operationId: 'policy-1',
        fundingInputs: [{ txid: PREV, vout: 0, valueSats: 50_000 }, { txid: PREV, vout: 1, valueSats: 50_000 }],
        alternatives: [{ expiresAt }],
      } as unknown as MarketplaceIntentClaimV1,
      transactionId: 'a'.repeat(64),
      inputs: [input(PREV, 0), input(PREV, 1, { address: STRANGER }), input('b'.repeat(64), 0)],
      outputs: [],
      signInputs: { [BIDDER]: [0] },
      review: { status: 'proved' },
    });
    expect(offerCoinCommitments([policy(1_900_000_000), policy(1_950_000_000)], context)).toEqual([{
      address: BIDDER,
      commitment: { outpoint: `${PREV}:0`, kind: 'collection_offer', refs: ['policy-1'], valueSats: 50_000, origin: SITE, expiresAt: 1_950_000_000 },
    }]);
  });

  it('takes offer ids and expiry from the commitments hint only for a coin it proved', () => {
    const hinted = fundingItem({ intent: fundOffers({ commitments: [
      { outpoint: { txid: FUND_TXID, vout: 0 }, offerIds: ['offer-a'], expiresAt: 2_200_000_000 },
      { outpoint: { txid: FUND_TXID, vout: 2 }, offerIds: ['change-is-not-a-slot'], expiresAt: null },
      { outpoint: { txid: PREV, vout: 5 }, offerIds: ['not-in-this-psbt'], expiresAt: null },
    ] }) });
    expect(offerCoinCommitments([hinted], context).map(entry => [entry.commitment.outpoint, entry.commitment.refs, entry.commitment.expiresAt]))
      .toEqual([[`${FUND_TXID}:0`, ['offer-a'], 2_200_000_000], [`${FUND_TXID}:1`, [], 2_000_000_000]]);
  });

  it('locks nothing for intents that commit no coin', () => {
    for (const action of ['buy_listings', 'accept_exact_offer', 'accept_policy_offer', 'attach_for_listing', 'prepare_asset']) {
      expect(offerCoinCommitments([fundingItem({ intent: { action } as unknown as MarketplaceIntentClaimV1 })], context)).toEqual([]);
    }
  });
});
