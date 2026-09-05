import { describe, expect, it } from 'vitest';
import {
  analyzeAcceptanceCpfpBundle,
  parseAcceptanceCpfpBundleIntents,
} from '@/core/counterparty/marketplaceBundle';

const SELLER = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const BUYER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const ASSET_TXID = 'ab'.repeat(32);
const PARENT_TXID = 'cd'.repeat(32);
const CHILD_TXID = 'ef'.repeat(32);

const parentIntent = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'accept_exact_offer',
  operationId: 'authorization-1',
  protocolVersion: 'exact_offer_v1',
  assets: [{
    asset: 'RAREPEPE',
    quantityRaw: '1',
    sourceOutpoint: { txid: ASSET_TXID, vout: 4 },
  }],
  authorizationId: 'authorization-1',
  bidder: BUYER,
  seller: SELLER,
  priceSats: 250_000,
  carrierValueSats: 546,
  sellerProceedsSats: 250_046,
  networkFeeSats: 500,
  expectedTxid: PARENT_TXID,
  delivery: { mode: 'detached', address: BUYER },
  marketplaceExpiresAt: 2_000_003_600,
  bitcoinExpiresAt: null,
  bitcoinInvalidation: {
    type: 'spend_funding_outpoint',
    outpoint: { txid: '12'.repeat(32), vout: 1 },
  },
} as const;

const childIntent = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'bump_acceptance_fee',
  operationId: 'authorization-1',
  protocolVersion: 'exact_offer_v1',
  assets: [{
    asset: 'RAREPEPE',
    quantityRaw: '1',
    sourceOutpoint: { txid: ASSET_TXID, vout: 4 },
  }],
  authorizationId: 'authorization-1',
  seller: SELLER,
  parentExpectedTxid: PARENT_TXID,
  childExpectedTxid: CHILD_TXID,
  parentSellerProceedsVout: 1,
  parentSellerProceedsSats: 250_046,
  parentNetworkFeeSats: 500,
  childNetworkFeeSats: 1_000,
  packageFeeSats: 1_500,
  packageFeeRate: 5,
  finalSellerProceedsSats: 249_046,
} as const;

const intents = () => parseAcceptanceCpfpBundleIntents(parentIntent, childIntent);

const base = () => {
  const parsed = intents();
  return {
    parentIntent: parsed.parent,
    parentReview: {
      status: 'proved' as const,
      family: 'accept_exact_offer' as const,
      title: 'Accept exact offer',
      facts: [],
      notices: [],
      blockers: [],
    },
    childIntent: parsed.child,
    childInputs: [{
      index: 0,
      txid: PARENT_TXID,
      vout: 1,
      address: SELLER,
      value: 250_046,
      hasSignatures: false,
    }],
    childOutputs: [{ index: 0, type: 'p2wpkh', address: SELLER, value: 249_046 }],
    childSignedInputs: [{ index: 0, sighashType: 0x01 }],
    childSignerAddresses: [SELLER],
    childTransactionId: CHILD_TXID,
    childHasCounterpartyPayload: false,
  };
};

describe('exact acceptance plus CPFP bundle intent parser', () => {
  it('accepts only the linked exact parent and fee-bump child shape', () => {
    expect(intents()).toEqual({ parent: parentIntent, child: childIntent });
  });

  it.each([
    ['wrong parent action', { ...parentIntent, action: 'authorize_exact_offer' }, childIntent],
    ['wrong child action', parentIntent, { ...childIntent, action: 'buy_listings' }],
    ['wrong child protocol', parentIntent, { ...childIntent, protocolVersion: 'direct_v1' }],
    ['wrong parent vout', parentIntent, { ...childIntent, parentSellerProceedsVout: 0 }],
    ['bad package rate', parentIntent, { ...childIntent, packageFeeRate: 0 }],
  ])('refuses %s', (_label, parent, child) => {
    expect(() => parseAcceptanceCpfpBundleIntents(parent, child)).toThrow();
  });
});

describe('exact acceptance plus CPFP atomic proof', () => {
  it('proves the child spends only seller proceeds back to the seller', () => {
    const review = analyzeAcceptanceCpfpBundle(base());

    expect(review).toMatchObject({
      status: 'proved',
      family: 'accept_exact_offer_with_cpfp',
      blockers: [],
    });
    expect(review.facts).toContainEqual({ kind: 'amount', label: 'Added child fee', value: '1,000 sats' });
    expect(review.facts).toContainEqual({ kind: 'amount', label: 'Your proceeds after fee bump', value: '249,046 sats', emphasis: 'primary' });
    expect(review.notices[0]?.message).toMatch(/before either signature/i);
  });

  it.each([
    ['unproved parent', {
      parentReview: { ...base().parentReview, status: 'blocked' as const },
    }],
    ['authorization id', {
      childIntent: { ...base().childIntent, authorizationId: 'other' },
    }],
    ['asset', {
      childIntent: {
        ...base().childIntent,
        assets: [{
          ...base().childIntent.assets[0],
          asset: 'SPELLS',
        }] as ReturnType<typeof intents>['child']['assets'],
      },
    }],
    ['parent txid', {
      childInputs: [{ ...base().childInputs[0]!, txid: '13'.repeat(32) }],
    }],
    ['parent value', {
      childInputs: [{ ...base().childInputs[0]!, value: 250_045 }],
    }],
    ['external output', {
      childOutputs: [{ ...base().childOutputs[0]!, address: BUYER }],
    }],
    ['final proceeds', {
      childOutputs: [{ ...base().childOutputs[0]!, value: 249_045 }],
    }],
    ['signature scope', { childSignedInputs: [{ index: 0, sighashType: 0x81 }] }],
    ['signer', { childSignerAddresses: [BUYER] }],
    ['existing signature', {
      childInputs: [{ ...base().childInputs[0]!, hasSignatures: true }],
    }],
    ['Counterparty payload', { childHasCounterpartyPayload: true }],
    ['child txid', { childTransactionId: '14'.repeat(32) }],
    ['package arithmetic', {
      childIntent: { ...base().childIntent, packageFeeSats: 1_499 },
    }],
  ])('blocks a mutation of %s', (_label, override) => {
    const review = analyzeAcceptanceCpfpBundle({ ...base(), ...override });
    expect(review.status).toBe('blocked');
    expect(review.blockers.length).toBeGreaterThan(0);
  });

  it('requires retry when the parent proof is waiting on independent asset truth', () => {
    const request = base();
    const review = analyzeAcceptanceCpfpBundle({
      ...request,
      parentReview: {
        ...request.parentReview,
        status: 'retry',
        blockers: ['asset lookup failed'],
      },
    });

    expect(review.status).toBe('retry');
    expect(review.blockers.join(' ')).toMatch(/parent.*lookup/i);
  });
});
