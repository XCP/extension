import { describe, expect, it } from 'vitest';
import {
  analyzeMarketplaceBatch,
  parseMarketplaceBatchIntents,
} from '@/core/counterparty/marketplaceBatch';
import type {
  AttachForListingIntentClaim,
  AuthorizeExactOfferIntentClaim,
  CreateListingIntentClaim,
  MarketplaceApprovalReview,
  PrepareAssetIntentClaim,
  PrepareBulkFanoutIntentClaim,
} from '@/core/counterparty/marketplaceIntent';

const SELLER = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

const listing = (index: number, reprice = false): CreateListingIntentClaim => ({
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'create_listing',
  operationId: 'bulk-listing-1',
  protocolVersion: 'counterparty_attach_listing_v1',
  assets: [{
    asset: 'RAREPEPE',
    quantityRaw: '1',
    sourceOutpoint: { txid: (index === 0 ? '31' : '32').repeat(32), vout: index },
  }],
  seller: SELLER,
  priceSats: 100_000,
  utxoValueSats: 546,
  guaranteedSellerPaymentSats: 100_546,
  delivery: { mode: 'buyer_selected_detach' },
  signingRequestExpiresAt: 2_000_000_000,
  marketplaceExpiresAt: 2_000_003_600,
  bitcoinExpiresAt: null,
  ...(reprice ? { listingContext: { mode: 'reprice' as const } } : {}),
});

const attach = (): AttachForListingIntentClaim => ({
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'attach_for_listing',
  operationId: 'bulk-listing-1',
  protocolVersion: 'counterparty_attach_listing_v1',
  assets: [{ asset: 'RAREPEPE', quantityRaw: '1' }],
  seller: SELLER,
  assetSource: '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7',
  expectedAttachedOutpoint: listing(0).assets[0].sourceOutpoint,
  utxoAddress: SELLER,
  utxoValueSats: 546,
  networkFeeSats: 454,
  protocolFee: {
    asset: 'XCP',
    quotedAmountRaw: '25000000',
    actualAmountRaw: null,
    observedBlock: 900_000,
    variableUntilConfirmed: true,
  },
  operationExpiresAt: 2_000_000_000,
});

const prepare = (index: number): PrepareAssetIntentClaim => ({
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'prepare_asset',
  operationId: 'prepare-1',
  protocolVersion: 'counterparty_prepare_assets_v1',
  assets: [{ asset: index === 0 ? 'RAREPEPE' : 'SPELLSOFGENESIS', quantityRaw: '1' }],
  utxoOwner: SELLER,
  assetSource: '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7',
  expectedAttachedOutpoint: { txid: (index === 0 ? '41' : '42').repeat(32), vout: 0 },
  utxoValueSats: 330,
  networkFeeSats: 454,
  protocolFee: {
    asset: 'XCP',
    quotedAmountRaw: '25000000',
    actualAmountRaw: null,
    observedBlock: 900_000,
    variableUntilConfirmed: true,
  },
  operationExpiresAt: 2_000_000_000,
});

const indexedHex = (offset: number, batchIndex: number): string =>
  (offset + batchIndex).toString(16).padStart(2, '0').repeat(32);

const fanout = (batchIndex: number): PrepareBulkFanoutIntentClaim => ({
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'prepare_bulk_fanout',
  operationId: 'bulk-1',
  protocolVersion: 'counterparty_bulk_attach_v1',
  assets: [],
  batchIndex,
  seller: SELLER,
  fundingOutpoint: { txid: indexedHex(0x11, batchIndex), vout: batchIndex },
  fundingValueSats: 100_000,
  slotCount: 2,
  slotValueSats: 10_000,
  networkFeeSats: 1_000,
  changeSats: 79_000,
  expectedTxid: indexedHex(0x21, batchIndex),
  operationExpiresAt: 2_000_000_000,
});

const BIDDER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const FUNDING = { txid: '51'.repeat(32), vout: 3 };

const exactOffer = (index: number): AuthorizeExactOfferIntentClaim => ({
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'authorize_exact_offer',
  operationId: `auth-${index}`,
  protocolVersion: 'exact_offer_v1',
  assets: [{
    asset: index % 2 === 0 ? 'RAREPEPE' : 'PEPECASH',
    quantityRaw: '1',
    sourceOutpoint: { txid: indexedHex(0x60, index), vout: 0 },
  }],
  authorizationId: `auth-${index}`,
  bidder: BIDDER,
  seller: SELLER,
  priceSats: 250_000,
  utxoValueSats: 546,
  sellerProceedsSats: 250_046,
  networkFeeSats: 500,
  platformFeeSats: 1_000,
  expectedTxid: indexedHex(0x80, index),
  delivery: { mode: 'detached', address: BIDDER },
  marketplaceExpiresAt: 2_000_003_600 + index,
  bitcoinExpiresAt: null,
  bitcoinInvalidation: { type: 'spend_funding_outpoint', outpoint: FUNDING },
});

const proved = (overrides: Partial<MarketplaceApprovalReview> = {}): MarketplaceApprovalReview => ({
  status: 'proved',
  family: 'prepare_bulk_fanout',
  title: 'Prepare funding slots',
  facts: [],
  notices: [],
  blockers: [],
  ...overrides,
});

describe('homogeneous marketplace batch parser', () => {
  it('accepts one attach followed by its exact dependent listing', () => {
    expect(parseMarketplaceBatchIntents([attach(), listing(0)])).toEqual({
      kind: 'attach-and-list',
      intents: [attach(), listing(0)],
    });
  });

  it.each([
    ['operation', { ...listing(0), operationId: 'other' }],
    ['asset', { ...listing(0), assets: [{ ...listing(0).assets[0], asset: 'OTHER' }] }],
    ['outpoint', {
      ...listing(0),
      assets: [{ ...listing(0).assets[0], sourceOutpoint: { txid: 'ff'.repeat(32), vout: 0 } }],
    }],
    ['asset UTXO value', { ...listing(0), utxoValueSats: 547 }],
    ['reprice context', listing(0, true)],
  ])('refuses an attach-and-list pair with a different %s', (_label, changedListing) => {
    expect(() => parseMarketplaceBatchIntents([attach(), changedListing])).toThrow(
      /one dependent listing/,
    );
  });

  it('accepts ordered independent fan-out parents for one operation', () => {
    expect(parseMarketplaceBatchIntents([fanout(0), fanout(1)])).toEqual({
      kind: 'bulk-fanout',
      intents: [fanout(0), fanout(1)],
    });
  });

  it('accepts the remaining ordered fan-out parents after earlier batches completed', () => {
    expect(parseMarketplaceBatchIntents([fanout(1), fanout(2)])).toEqual({
      kind: 'bulk-fanout',
      intents: [fanout(1), fanout(2)],
    });
  });

  it('accepts a resumed ordered subset with an already-completed parent between entries', () => {
    expect(parseMarketplaceBatchIntents([fanout(0), fanout(2)])).toEqual({
      kind: 'bulk-fanout',
      intents: [fanout(0), fanout(2)],
    });
  });

  it.each([
    ['empty', []],
    ['mixed actions', [fanout(0), { ...fanout(1), action: 'attach_for_listing' }]],
    ['different operation', [fanout(0), { ...fanout(1), operationId: 'bulk-2' }]],
    ['wrong order', [fanout(1), fanout(0)]],
    ['duplicate batch index', [fanout(0), { ...fanout(1), batchIndex: 0 }]],
    ['duplicate funding', [fanout(0), { ...fanout(1), fundingOutpoint: fanout(0).fundingOutpoint }]],
  ])('refuses a %s batch', (_label, intents) => {
    expect(() => parseMarketplaceBatchIntents(intents)).toThrow();
  });
});

describe('exact-offer authorization batch parser', () => {
  it.each([1, 2, 8])('accepts %i exact targets sharing one bidder funding outpoint', count => {
    const offers = Array.from({ length: count }, (_, index) => exactOffer(index));
    expect(parseMarketplaceBatchIntents(offers)).toEqual({ kind: 'authorize-offers', intents: offers });
  });

  it('refuses more than eight authorizations', () => {
    expect(() => parseMarketplaceBatchIntents(Array.from({ length: 9 }, (_, index) => exactOffer(index))))
      .toThrow(/1\.\.8/);
  });

  it.each([
    ['bidder', { bidder: SELLER, delivery: { mode: 'detached' as const, address: SELLER } }, /one bidder/],
    ['funding outpoint', {
      bitcoinInvalidation: { type: 'spend_funding_outpoint' as const, outpoint: { ...FUNDING, vout: 4 } },
    }, /one funding outpoint/],
    ['delivery mode', {
      delivery: { mode: 'attached' as const, address: BIDDER, utxoValueSats: 546 },
    }, /one delivery/],
    ['delivery address', {
      delivery: { mode: 'detached' as const, address: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT' },
    }, /one delivery/],
    ['price', { priceSats: 250_001 }, /one price/],
    ['platform fee', { platformFeeSats: 999 }, /one price/],
    ['authorization id', { authorizationId: 'auth-0' }, /duplicate authorization/],
    ['operation id', { operationId: 'auth-0' }, /duplicate operation/],
    ['target outpoint', { assets: exactOffer(0).assets }, /duplicate target/],
    ['transaction', { expectedTxid: exactOffer(0).expectedTxid }, /duplicate transaction/],
    ['self-funded target', {
      assets: [{ ...exactOffer(1).assets[0], sourceOutpoint: FUNDING }],
    }, /own funding outpoint/],
  ])('refuses a batch whose second item has a different or duplicate %s', (_label, change, message) => {
    expect(() => parseMarketplaceBatchIntents([exactOffer(0), { ...exactOffer(1), ...change }]))
      .toThrow(message);
  });

  it.each([
    ['acceptance', { ...exactOffer(1), action: 'accept_exact_offer' }],
    ['listing', listing(0)],
  ])('refuses an authorization batch mixed with an %s', (_label, other) => {
    expect(() => parseMarketplaceBatchIntents([exactOffer(0), other])).toThrow(/one semantic action/);
  });

  it('refuses an item that does not parse as an exact-offer authorization', () => {
    const { bitcoinInvalidation: _dropped, ...unbound } = exactOffer(1);
    expect(() => parseMarketplaceBatchIntents([exactOffer(0), unbound])).toThrow(/funding outpoint/);
  });
});

describe('marketplace batch aggregate proof', () => {
  it('summarizes exact-offer authorizations once, with mutual exclusivity and every target', () => {
    const offers = [exactOffer(0), exactOffer(1), exactOffer(2)];
    const review = analyzeMarketplaceBatch(
      'authorize-offers',
      offers,
      offers.map(() => proved({ status: 'caution', family: 'authorize_exact_offer' })),
    );
    expect(review).toMatchObject({
      status: 'caution', family: 'marketplace_batch', title: 'Authorize 3 exact offers',
      notices: [], blockers: [],
    });
    expect(review.facts[0]).toEqual({
      kind: 'amount', label: 'You pay if accepted', value: '251,000 sats', emphasis: 'primary',
    });
    expect(review.facts).toContainEqual({
      kind: 'paragraph', label: 'Settlement',
      value: 'At most one can be accepted. Every offer spends the same funding UTXO.',
    });
    expect(review.facts).toContainEqual({
      kind: 'outpoint', label: 'Funding UTXO', value: `${FUNDING.txid}:${FUNDING.vout}`,
    });
    for (const offer of offers) {
      expect(review.facts).toContainEqual({
        kind: 'outpoint', label: offer.assets[0].asset,
        value: `${offer.assets[0].sourceOutpoint.txid}:0`,
      });
    }
    expect(review.facts.map(fact => fact.label)).not.toContain('Seller wallet');
  });

  it('labels each target with its ledger-proved quantity when the item proof supplies it', () => {
    const offers = [exactOffer(0), exactOffer(1)];
    const review = analyzeMarketplaceBatch('authorize-offers', offers, [
      proved({ status: 'caution', family: 'authorize_exact_offer', summary: { label: 'Offer to buy', description: '1 RAREPEPE' } }),
      proved({ status: 'caution', family: 'authorize_exact_offer', summary: { label: 'Offer to buy', description: '3 PEPECASH' } }),
    ]);
    expect(review.facts).toContainEqual({
      kind: 'outpoint', label: '1 RAREPEPE', value: `${offers[0]!.assets[0].sourceOutpoint.txid}:0`,
    });
    expect(review.facts).toContainEqual({
      kind: 'outpoint', label: '3 PEPECASH', value: `${offers[1]!.assets[0].sourceOutpoint.txid}:0`,
    });
  });

  it('names the latest expiry as such only when the offers expire at different times', () => {
    const caution = () => proved({ status: 'caution', family: 'authorize_exact_offer' });
    const differing = analyzeMarketplaceBatch('authorize-offers', [exactOffer(0), exactOffer(1)], [caution(), caution()]);
    expect(differing.facts.map(fact => fact.label)).toContain('Latest expiry');
    const shared = analyzeMarketplaceBatch(
      'authorize-offers',
      [exactOffer(0), { ...exactOffer(1), marketplaceExpiresAt: exactOffer(0).marketplaceExpiresAt }],
      [caution(), caution()],
    );
    expect(shared.facts.map(fact => fact.label)).toContain('Expires');
    expect(shared.facts.map(fact => fact.label)).not.toContain('Latest expiry');
  });

  it('titles a single exact-offer authorization in the singular', () => {
    const review = analyzeMarketplaceBatch(
      'authorize-offers',
      [exactOffer(0)],
      [proved({ status: 'caution', family: 'authorize_exact_offer' })],
    );
    expect(review.title).toBe('Authorize 1 exact offer');
  });

  it('blocks the whole authorization batch when any item did not prove', () => {
    const review = analyzeMarketplaceBatch(
      'authorize-offers',
      [exactOffer(0), exactOffer(1)],
      [
        proved({ status: 'caution', family: 'authorize_exact_offer' }),
        proved({
          status: 'blocked', family: 'authorize_exact_offer',
          blockers: ['the wallet must sign only input 0 with ALL (0x01) for this action'],
        }),
      ],
    );
    expect(review.status).toBe('blocked');
    expect(review.blockers).toEqual(['item 2: the wallet must sign only input 0 with ALL (0x01) for this action']);
  });

  it('explains the attach now and automatic listing activation boundary', () => {
    const review = analyzeMarketplaceBatch(
      'attach-and-list',
      [attach(), listing(0)],
      [proved({ family: 'attach_for_listing' }), proved({ family: 'create_listing' })],
    );

    expect(review).toMatchObject({
      status: 'proved',
      title: 'Attach and list RAREPEPE',
      blockers: [],
    });
    expect(review.facts).toContainEqual({ kind: 'address', label: 'Asset source', value: attach().assetSource });
    expect(review.facts).toContainEqual({ kind: 'amount', label: 'Listing price', value: '100,000 sats' });
    expect(review.facts.slice(0, 3)).toEqual([
      { kind: 'amount', label: 'Your payout if sold', value: '100,546 sats', emphasis: 'primary' },
      { kind: 'amount', label: 'Listing price', value: '100,000 sats' },
      {
        kind: 'amount', label: 'UTXO returned', value: '546 sats',
      },
    ]);
    expect(review.facts.slice(3).map(field => field.label)).toEqual([
      'Attach fee', 'XCP fee', 'Transactions', 'Seller wallet', 'Asset source',
      'Sent now', 'Listing activation', 'Signature invalidation',
    ]);
    expect(review.facts).toContainEqual({ kind: 'text', label: 'Sent now', value: 'Attach only' });
    expect(review.facts).toContainEqual({
      kind: 'paragraph', label: 'Listing activation',
      value: 'After confirmation and Counterparty verification',
    });
  });

  it('accepts distinct prepare-assets children from one durable operation', () => {
    expect(parseMarketplaceBatchIntents([prepare(0), prepare(1)])).toEqual({
      kind: 'prepare-assets',
      intents: [prepare(0), prepare(1)],
    });
  });

  it.each([
    ['asset source', { ...prepare(1), assetSource: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT' }],
    ['operation', { ...prepare(1), operationId: 'prepare-2' }],
    ['target', { ...prepare(1), expectedAttachedOutpoint: prepare(0).expectedAttachedOutpoint }],
  ])('refuses a prepare-assets batch with a changed %s', (_label, changed) => {
    expect(() => parseMarketplaceBatchIntents([prepare(0), changed])).toThrow();
  });

  it('shows exact aggregate slot and fee totals', () => {
    const intents = [fanout(0), fanout(1)];
    const review = analyzeMarketplaceBatch('bulk-fanout', intents, [proved(), proved()]);

    expect(review).toMatchObject({
      status: 'proved',
      family: 'marketplace_batch',
      blockers: [],
    });
    expect(review.facts).toContainEqual({ kind: 'amount', label: 'New UTXOs', value: '4' });
    expect(review.facts).toContainEqual({ kind: 'amount', label: 'Network fees', value: '2,000 sats' });
  });

  it('summarizes a price-free preparation phase without calling it a listing', () => {
    const intents = [prepare(0), prepare(1)];
    const review = analyzeMarketplaceBatch(
      'prepare-assets',
      intents,
      [proved({ family: 'prepare_asset' }), proved({ family: 'prepare_asset' })],
    );
    expect(review).toMatchObject({
      status: 'proved',
      title: 'Prepare 2 collectibles',
      blockers: [],
    });
    expect(review.facts).toContainEqual({ kind: 'amount', label: 'Network fees', value: '908 sats' });
    expect(review.facts).toContainEqual({ kind: 'amount', label: 'XCP fees', value: '0.5 XCP', description: 'The XCP fee may change at confirmation.' });
    // The paired Legacy source that signs input 0, once, though both attaches spend from it.
    expect(review.facts.filter(fact => fact.label === 'Asset source')).toEqual([
      { kind: 'address', label: 'Asset source', value: '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7' },
    ]);
  });

  // The bulk-listing screen has no attention interstitial: these facts are the only place the
  // durable, buyer-completable nature of the signatures is disclosed, so they are pinned here.
  it('discloses the durable-signature boundary on a bulk listing batch', () => {
    const review = analyzeMarketplaceBatch(
      'bulk-listing',
      [listing(0), listing(1)],
      [proved({ family: 'create_listing' }), proved({ family: 'create_listing' })],
    );

    expect(review.status).toBe('proved');
    expect(review.title).toBe('Authorize 2 marketplace listings');
    expect(review.facts).toContainEqual({ kind: 'amount', label: 'Total asking', value: '200,000 sats' });
    expect(review.facts).toContainEqual({
      kind: 'paragraph', label: 'Buyer controls',
      value: 'Funding, fees, and delivery destination',
    });
    expect(review.facts).toContainEqual({ kind: 'text', label: 'Broadcast', value: 'Not now' });
    expect(review.facts).toContainEqual({
      kind: 'paragraph', label: 'Signature invalidation',
      value: 'Spend each attached asset UTXO',
    });
  });

  it('titles an all-reprice batch as reprices, not new listings', () => {
    const review = analyzeMarketplaceBatch(
      'bulk-listing',
      [listing(0, true), listing(1, true)],
      [proved({ family: 'create_listing' }), proved({ family: 'create_listing' })],
    );

    expect(review.title).toBe('Authorize 2 listing reprices');
  });

  it('keeps the generic listings title when only some items are reprices', () => {
    const review = analyzeMarketplaceBatch(
      'bulk-listing',
      [listing(0, true), listing(1)],
      [proved({ family: 'create_listing' }), proved({ family: 'create_listing' })],
    );

    expect(review.title).toBe('Authorize 2 marketplace listings');
  });

  it.each([
    ['caution', proved({ status: 'caution' })],
    ['retry', proved({ status: 'retry', blockers: ['lookup failed'] })],
    ['blocked', proved({ status: 'blocked', blockers: ['output changed'] })],
  ] as const)('never weakens an item-level %s result', (status, secondReview) => {
    const review = analyzeMarketplaceBatch(
      'bulk-fanout',
      [fanout(0), fanout(1)],
      [proved(), secondReview],
    );
    expect(review.status).toBe(status);
    if (status === 'retry' || status === 'blocked') {
      expect(review.blockers[0]).toMatch(/item 2/i);
    }
  });
});
