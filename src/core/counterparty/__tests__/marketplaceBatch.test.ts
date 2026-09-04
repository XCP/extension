import { describe, expect, it } from 'vitest';
import {
  analyzeMarketplaceBatch,
  parseMarketplaceBatchIntents,
} from '@/core/counterparty/marketplaceBatch';
import type {
  AttachForListingIntentClaim,
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
  carrierValueSats: 546,
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
  carrierAddress: SELLER,
  carrierValueSats: 546,
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
  carrierOwner: SELLER,
  assetSource: '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7',
  expectedAttachedOutpoint: { txid: (index === 0 ? '41' : '42').repeat(32), vout: 0 },
  carrierValueSats: 330,
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
  ((offset + batchIndex) % 256).toString(16).padStart(2, '0').repeat(32);

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
    ['carrier value', { ...listing(0), carrierValueSats: 547 }],
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

  it('accepts an ordered remaining fan-out subset after an earlier parent was submitted', () => {
    expect(parseMarketplaceBatchIntents([fanout(1), fanout(2)])).toEqual({
      kind: 'bulk-fanout',
      intents: [fanout(1), fanout(2)],
    });
  });

  it.each([
    ['empty', []],
    ['mixed actions', [fanout(0), { ...fanout(1), action: 'attach_for_listing' }]],
    ['different operation', [fanout(0), { ...fanout(1), operationId: 'bulk-2' }]],
    ['wrong order', [fanout(1), fanout(0)]],
    ['duplicate index', [fanout(1), { ...fanout(2), batchIndex: 1 }]],
    ['duplicate funding', [fanout(0), { ...fanout(1), fundingOutpoint: fanout(0).fundingOutpoint }]],
  ])('refuses a %s batch', (_label, intents) => {
    expect(() => parseMarketplaceBatchIntents(intents)).toThrow();
  });
});

describe('marketplace batch aggregate proof', () => {
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
    expect(review.facts).toContainEqual({ label: 'Asset source', value: attach().assetSource });
    expect(review.facts).toContainEqual({ label: 'Listing price', value: '100,000 sats' });
    expect(review.facts).toContainEqual({ label: 'Broadcast now', value: 'Attach transaction only' });
    expect(review.facts).toContainEqual({
      label: 'Listing activation',
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
    expect(review.facts).toContainEqual({ label: 'New UTXOs', value: '4' });
    expect(review.facts).toContainEqual({ label: 'Total network fees', value: '2,000 sats' });
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
    expect(review.facts).toContainEqual({ label: 'Total network fees', value: '908 sats' });
    expect(review.facts).toContainEqual({ label: 'Total quoted XCP fees', value: '0.5 XCP' });
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
    expect(review.facts).toContainEqual({ label: 'Combined asking prices', value: '200,000 sats' });
    expect(review.facts).toContainEqual({
      label: 'Buyer controls',
      value: 'Funding, fees, and detach destination',
    });
    expect(review.facts).toContainEqual({ label: 'Broadcast now', value: 'None' });
    expect(review.facts).toContainEqual({
      label: 'Signature invalidation',
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
