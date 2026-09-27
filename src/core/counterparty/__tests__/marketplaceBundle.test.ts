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
  utxoValueSats: 546,
  sellerProceedsSats: 250_046,
  networkFeeSats: 500,
  platformFeeSats: 6_250,
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
      summary: { label: 'Accept offer', description: '1 RAREPEPE' },
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
    parentTransactionId: PARENT_TXID as string | undefined,
    parentOutputs: [
      { index: 0, type: 'op_return', value: 0 },
      { index: 1, type: 'p2wpkh', address: SELLER, value: 250_046 },
      { index: 2, type: 'p2wpkh', address: BUYER, value: 6_250 },
    ],
    parentInputScriptTypes: ['p2wpkh', 'p2wpkh'] as Array<string | undefined>,
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
    expect(review.bundleSummary?.outcome).toEqual({ kind: 'amount', label: 'You receive', value: '249,046 sats', emphasis: 'primary' });
    expect(review.bundleSummary?.action).toBe('Accept offer for 1 RAREPEPE');
    expect(review.notices[0]?.message).toMatch(/before either signature/i);
    // The seller does not pay the platform fee, so neither the summary nor the facts list it.
    expect(review.facts.some(field => field.label === 'Platform fee')).toBe(false);
    expect(review.bundleSummary?.amounts.some(field => field.label === 'Platform fee')).toBe(false);
    expect(review.bundleSummary?.amounts).toContainEqual({
      kind: 'amount', label: 'Network fees', value: '1,500 sats',
    });
  });

  it('does not describe attached delivery as a detach in the bundle', () => {
    const request = base();
    request.parentIntent.delivery = { mode: 'attached', address: BUYER, utxoValueSats: 330 };
    const review = analyzeAcceptanceCpfpBundle(request);
    expect(review.status).toBe('proved');
    expect(review.facts).toContainEqual({
      kind: 'address', label: 'Delivery', value: BUYER,
      description: 'Asset stays attached to a 330-sat UTXO at this address',
    });
  });

  it('does not invent a platform fee for a fee-free parent', () => {
    const request = base();
    request.parentIntent.platformFeeSats = 0;
    const review = analyzeAcceptanceCpfpBundle(request);
    expect(review.status).toBe('proved');
    expect(review.bundleSummary?.amounts.some(field => field.label === 'Platform fee')).toBe(false);
    expect(review.facts.some(field => field.label === 'Platform fee')).toBe(false);
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
    ['spending the platform output instead of seller proceeds', {
      childInputs: [{ ...base().childInputs[0]!, vout: 2 }],
    }],
    ['charging the buyer platform fee again as a package fee', {
      childIntent: { ...base().childIntent, packageFeeSats: 7_750 },
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
    // The parent's own bytes, not the child's claim, decide what the child input spends.
    ['a parent whose computed txid is not the one the child spends', {
      parentTransactionId: '15'.repeat(32),
    }],
    ['a parent output 1 of another value', {
      parentOutputs: [base().parentOutputs[0]!, { ...base().parentOutputs[1]!, value: 250_047 }],
    }],
    ['a parent output 1 paying someone else', {
      parentOutputs: [base().parentOutputs[0]!, { ...base().parentOutputs[1]!, address: BUYER }],
    }],
    ['a parent with no output 1', { parentOutputs: [base().parentOutputs[0]!] }],
    // A scriptSig is part of the txid, so the child would spend an outpoint that never exists.
    ['a parent with a Legacy input', { parentInputScriptTypes: ['p2wpkh', 'p2pkh'] }],
    ['a parent with a nested SegWit input', { parentInputScriptTypes: ['p2sh', 'p2wpkh'] }],
    ['a parent input of unknown type', { parentInputScriptTypes: [undefined, 'p2tr'] }],
  ])('blocks a mutation of %s', (_label, override) => {
    const review = analyzeAcceptanceCpfpBundle({ ...base(), ...override });
    expect(review.status).toBe('blocked');
    expect(review.blockers.length).toBeGreaterThan(0);
  });

  it('asks for a retry, never a proof, when the parent txid is unknown', () => {
    const review = analyzeAcceptanceCpfpBundle({ ...base(), parentTransactionId: undefined });
    expect(review.status).toBe('retry');
    expect(review.blockers).toContain('the wallet could not establish the parent transaction id');
  });

  it('states the offer as the bidder made it and the fee the accepting seller pays (taker-pays)', () => {
    const request = base();
    // A 5,000-sat offer: the claim is net of the 1,000-sat fee the seller pays out of proceeds.
    request.parentIntent.priceSats = 4_000;
    request.parentIntent.platformFeeSats = 1_000;
    request.parentIntent.sellerPaidFeeSats = 1_000;
    const review = analyzeAcceptanceCpfpBundle(request);
    expect(review.title).toBe('Accept 5,000 sats for RAREPEPE with fee bump');
    expect(review.bundleSummary?.amounts).toContainEqual({ kind: 'amount', label: 'Offer price', value: '5,000 sats' });
    expect(review.bundleSummary?.amounts).toContainEqual({
      kind: 'amount', label: 'Platform fee', value: '1,000 sats', description: 'Deducted from seller proceeds',
    });
    expect(review.facts).toContainEqual({ kind: 'amount', label: 'Offer price', value: '5,000 sats' });
    expect(review.facts).toContainEqual({
      kind: 'amount', label: 'Platform fee', value: '1,000 sats', description: 'Deducted from seller proceeds',
    });
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
