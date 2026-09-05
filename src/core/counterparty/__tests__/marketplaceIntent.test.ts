import { describe, expect, it } from 'vitest';
import {
  type AcceptExactOfferIntentClaim,
  type AttachForListingIntentClaim,
  type AuthorizeExactOfferIntentClaim,
  analyzeMarketplaceIntent,
  type BuyListingsIntentClaim,
  type CreateListingIntentClaim,
  marketplaceTransactionHeaderProblem,
  type PrepareAssetIntentClaim,
  type PrepareBulkFanoutIntentClaim,
  parseMarketplaceIntent,
} from '@/core/counterparty/marketplaceIntent';

const SELLER = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const SELLER_TWO = 'bc1qglv8hh3l23y0qu5uw4zu7e8q4td0gcjsa8f3tq';
const BUYER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const PLATFORM = 'bc1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9e75rs';
const TXID = 'ab'.repeat(32);
const TXID_TWO = 'cd'.repeat(32);
const BUY_TXID = 'ef'.repeat(32);
const ATTACH_TXID = '14'.repeat(32);
const EXACT_TXID = '18'.repeat(32);
const BID_TXID = '19'.repeat(32);
const FANOUT_TXID = '20'.repeat(32);
const FANOUT_FUNDING_TXID = '21'.repeat(32);

const intent: CreateListingIntentClaim = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'create_listing',
  operationId: 'listing-preflight-1',
  protocolVersion: 'counterparty_attach_listing_v1',
  assets: [{
    asset: 'RAREPEPE',
    quantityRaw: '100000000',
    sourceOutpoint: { txid: TXID, vout: 7 },
  }],
  seller: SELLER,
  priceSats: 250_000,
  carrierValueSats: 546,
  guaranteedSellerPaymentSats: 250_546,
  delivery: { mode: 'buyer_selected_detach' },
  signingRequestExpiresAt: 2_000_000_000,
  marketplaceExpiresAt: 2_000_003_600,
  bitcoinExpiresAt: null,
};

const base = () => ({
  intent,
  inputs: [
    { index: 0, txid: '0'.repeat(64), vout: 0, value: 0, hasSignatures: false },
    { index: 1, txid: TXID, vout: 7, address: SELLER, value: 546, hasSignatures: false },
  ],
  outputs: [
    { index: 0, type: 'p2wpkh', address: SELLER, value: 546 },
    { index: 1, type: 'p2wpkh', address: SELLER, value: 250_546 },
  ],
  signedInputs: [{ index: 1, sighashType: 0x83 }],
  signerAddresses: [SELLER],
  attachedAssets: [{
    inputIndex: 1,
    utxo: `${TXID}:7`,
    assets: [{ asset: 'RAREPEPE', quantity: '100000000', quantity_normalized: '1' }],
  }],
  attachedAssetDestination: {
    sourceInputs: [1],
    destinationVout: 0,
    destinationAddress: SELLER,
    detaches: false,
    mode: 'flexible' as const,
    destinationCommitted: false,
    leavesWallet: true,
  },
  hasCounterpartyPayload: false,
});

const buyIntent: BuyListingsIntentClaim = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'buy_listings',
  operationId: 'checkout-1',
  protocolVersion: 'direct_v1',
  assets: [
    { asset: 'RAREPEPE', quantityRaw: '1', sourceOutpoint: { txid: TXID, vout: 7 } },
    { asset: 'SPELLS', quantityRaw: '100000000', sourceOutpoint: { txid: TXID_TWO, vout: 3 } },
  ],
  buyer: BUYER,
  items: [
    {
      asset: 'RAREPEPE',
      quantityRaw: '1',
      sourceOutpoint: { txid: TXID, vout: 7 },
      listingId: 'listing-1',
      seller: SELLER,
      carrierValueSats: 546,
      priceSats: 100_000,
      sellerPaymentSats: 100_546,
    },
    {
      asset: 'SPELLS',
      quantityRaw: '100000000',
      sourceOutpoint: { txid: TXID_TWO, vout: 3 },
      listingId: 'listing-2',
      seller: SELLER_TWO,
      carrierValueSats: 330,
      priceSats: 200_000,
      sellerPaymentSats: 200_330,
    },
  ],
  subtotalSats: 300_000,
  networkFeeSats: 1_000,
  platformFeeSats: 5_000,
  totalSats: 306_000,
  expectedTxid: BUY_TXID,
  delivery: { mode: 'detached', address: BUYER },
  marketplaceExpiresAt: 2_000_003_600,
};

const buyBase = () => ({
  intent: buyIntent,
  inputs: [
    { index: 0, txid: '11'.repeat(32), vout: 0, address: BUYER, value: 400_000, hasSignatures: false },
    { index: 1, txid: TXID, vout: 7, address: SELLER, value: 546, hasSignatures: false },
    { index: 2, txid: TXID_TWO, vout: 3, address: SELLER_TWO, value: 330, hasSignatures: false },
  ],
  outputs: [
    { index: 0, type: 'op_return', value: 0 },
    { index: 1, type: 'p2wpkh', address: SELLER, value: 100_546 },
    { index: 2, type: 'p2wpkh', address: SELLER_TWO, value: 200_330 },
    { index: 3, type: 'p2wpkh', address: PLATFORM, value: 5_000 },
    { index: 4, type: 'p2wpkh', address: BUYER, value: 94_000 },
  ],
  signedInputs: [{ index: 0, sighashType: 0x01 }],
  signerAddresses: [BUYER],
  attachedAssets: [
    {
      inputIndex: 1,
      utxo: `${TXID}:7`,
      assets: [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1' }],
    },
    {
      inputIndex: 2,
      utxo: `${TXID_TWO}:3`,
      assets: [{ asset: 'SPELLS', quantity: '100000000', quantity_normalized: '1' }],
    },
  ],
  attachedAssetDestination: null,
  hasCounterpartyPayload: true,
  transactionId: BUY_TXID,
  localCounterpartyMessage: { messageType: 'detach', data: { destination: BUYER } },
});

const attachedBuyBase = () => ({
  intent: {
    ...buyIntent,
    assets: [buyIntent.assets[0]!],
    items: [buyIntent.items[0]!],
    subtotalSats: 100_000,
    networkFeeSats: 1_000,
    platformFeeSats: 5_000,
    totalSats: 106_000,
    delivery: { mode: 'attached' as const, address: BUYER, carrierValueSats: 330 },
  },
  inputs: [
    { index: 0, txid: '11'.repeat(32), vout: 0, address: BUYER, value: 400_000, hasSignatures: false },
    { index: 1, txid: TXID, vout: 7, address: SELLER, value: 546, hasSignatures: false },
  ],
  outputs: [
    { index: 0, type: 'p2wpkh', address: BUYER, value: 330 },
    { index: 1, type: 'p2wpkh', address: SELLER, value: 100_546 },
    { index: 2, type: 'p2wpkh', address: PLATFORM, value: 5_000 },
    { index: 3, type: 'p2wpkh', address: BUYER, value: 293_670 },
  ],
  signedInputs: [{ index: 0, sighashType: 0x01 }],
  signerAddresses: [BUYER],
  attachedAssets: [{
    inputIndex: 1,
    utxo: `${TXID}:7`,
    assets: [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1' }],
  }],
  attachedAssetDestination: null,
  hasCounterpartyPayload: false,
  transactionId: BUY_TXID,
});

const attachIntent: AttachForListingIntentClaim = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'attach_for_listing',
  operationId: 'attach-1',
  protocolVersion: 'counterparty_attach_listing_v1',
  assets: [{ asset: 'RAREPEPE', quantityRaw: '1' }],
  seller: SELLER,
  assetSource: SELLER,
  expectedAttachedOutpoint: { txid: ATTACH_TXID, vout: 0 },
  carrierAddress: SELLER,
  carrierValueSats: 546,
  networkFeeSats: 1_000,
  protocolFee: {
    asset: 'XCP',
    quotedAmountRaw: '25000000',
    actualAmountRaw: null,
    observedBlock: 900_000,
    variableUntilConfirmed: true,
  },
  operationExpiresAt: 2_000_000_000,
};

const prepareIntent: PrepareAssetIntentClaim = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'prepare_asset',
  operationId: 'prepare-1',
  protocolVersion: 'counterparty_prepare_assets_v1',
  assets: [{ asset: 'RAREPEPE', quantityRaw: '1' }],
  carrierOwner: SELLER,
  assetSource: SELLER,
  expectedAttachedOutpoint: { txid: ATTACH_TXID, vout: 0 },
  carrierValueSats: 546,
  networkFeeSats: 1_000,
  protocolFee: {
    asset: 'XCP',
    quotedAmountRaw: '25000000',
    actualAmountRaw: null,
    observedBlock: 900_000,
    variableUntilConfirmed: true,
  },
  operationExpiresAt: 2_000_000_000,
};

const attachBase = () => ({
  intent: attachIntent,
  inputs: [
    { index: 0, txid: '15'.repeat(32), vout: 0, address: SELLER, value: 100_000, hasSignatures: false },
    { index: 1, txid: '16'.repeat(32), vout: 1, address: SELLER_TWO, value: 100_000, hasSignatures: false },
  ],
  outputs: [
    { index: 0, type: 'p2wpkh', address: SELLER, value: 546 },
    { index: 1, type: 'op_return', value: 0 },
    { index: 2, type: 'p2wpkh', address: SELLER_TWO, value: 198_454 },
  ],
  signedInputs: [
    { index: 0, sighashType: 0x01 },
    { index: 1, sighashType: 0x01 },
  ],
  signerAddresses: [SELLER, SELLER_TWO],
  attachedAssets: [],
  attachedAssetDestination: null,
  hasCounterpartyPayload: true,
  transactionId: ATTACH_TXID,
  localCounterpartyMessage: {
    messageType: 'attach',
    data: { asset: 'RAREPEPE', quantity: 1n, destinationVout: 0 },
  },
});

const authorizeExactIntent: AuthorizeExactOfferIntentClaim = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'authorize_exact_offer',
  operationId: 'authorization-1',
  protocolVersion: 'exact_offer_v1',
  assets: [{
    asset: 'RAREPEPE',
    quantityRaw: '1',
    sourceOutpoint: { txid: TXID, vout: 7 },
  }],
  authorizationId: 'authorization-1',
  bidder: BUYER,
  seller: SELLER,
  priceSats: 250_000,
  carrierValueSats: 546,
  sellerProceedsSats: 250_046,
  networkFeeSats: 500,
  platformFeeSats: 0,
  expectedTxid: EXACT_TXID,
  delivery: { mode: 'detached', address: BUYER },
  marketplaceExpiresAt: 2_000_003_600,
  bitcoinExpiresAt: null,
  bitcoinInvalidation: {
    type: 'spend_funding_outpoint',
    outpoint: { txid: BID_TXID, vout: 4 },
  },
};

const acceptExactIntent: AcceptExactOfferIntentClaim = {
  ...authorizeExactIntent,
  action: 'accept_exact_offer',
};

const exactBase = (accepting = false) => ({
  intent: accepting ? acceptExactIntent : authorizeExactIntent,
  inputs: [
    {
      index: 0,
      txid: BID_TXID,
      vout: 4,
      address: BUYER,
      value: 250_000,
      hasSignatures: accepting,
    },
    {
      index: 1,
      txid: TXID,
      vout: 7,
      address: SELLER,
      value: 546,
      hasSignatures: false,
    },
  ],
  outputs: [
    { index: 0, type: 'op_return', value: 0 },
    { index: 1, type: 'p2wpkh', address: SELLER, value: 250_046 },
  ],
  signedInputs: [{ index: accepting ? 1 : 0, sighashType: 0x01 }],
  signerAddresses: [accepting ? SELLER : BUYER],
  attachedAssets: [{
    inputIndex: 1,
    utxo: `${TXID}:7`,
    assets: [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1' }],
  }],
  attachedAssetDestination: null,
  hasCounterpartyPayload: true,
  transactionId: EXACT_TXID,
  localCounterpartyMessage: { messageType: 'detach', data: { destination: BUYER } },
});

const attachedExactBase = (accepting = false) => ({
  ...exactBase(accepting),
  intent: {
    ...(accepting ? acceptExactIntent : authorizeExactIntent),
    delivery: { mode: 'attached' as const, address: BUYER, carrierValueSats: 330 },
  },
  inputs: exactBase(accepting).inputs.map(transactionInput =>
    transactionInput.index === 0 ? { ...transactionInput, value: 250_330 } : transactionInput),
  outputs: [
    { index: 0, type: 'p2wpkh', address: BUYER, value: 330 },
    { index: 1, type: 'p2wpkh', address: SELLER, value: 250_046 },
  ],
  hasCounterpartyPayload: false,
  localCounterpartyMessage: undefined,
});

const feeExactBase = (accepting = false, attached = false, feeSats = 6_250) => {
  const request = attached ? attachedExactBase(accepting) : exactBase(accepting);
  return {
    ...request,
    intent: { ...request.intent, platformFeeSats: feeSats },
    inputs: request.inputs.map(entry => entry.index === 0
      ? { ...entry, value: entry.value + feeSats } : entry),
    outputs: [...request.outputs, { index: 2, type: 'p2tr', address: PLATFORM, value: feeSats }],
  };
};

const fanoutIntent: PrepareBulkFanoutIntentClaim = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'prepare_bulk_fanout',
  operationId: 'bulk-1',
  protocolVersion: 'counterparty_bulk_attach_v1',
  assets: [],
  batchIndex: 0,
  seller: SELLER,
  fundingOutpoint: { txid: FANOUT_FUNDING_TXID, vout: 2 },
  fundingValueSats: 100_000,
  slotCount: 2,
  slotValueSats: 10_000,
  networkFeeSats: 1_000,
  changeSats: 79_000,
  expectedTxid: FANOUT_TXID,
  operationExpiresAt: 2_000_000_000,
};

const fanoutBase = () => ({
  intent: fanoutIntent,
  inputs: [{
    index: 0,
    txid: FANOUT_FUNDING_TXID,
    vout: 2,
    address: SELLER,
    value: 100_000,
    hasSignatures: false,
  }],
  outputs: [
    { index: 0, type: 'p2wpkh', address: SELLER, value: 10_000 },
    { index: 1, type: 'p2wpkh', address: SELLER, value: 10_000 },
    { index: 2, type: 'p2wpkh', address: SELLER, value: 79_000 },
  ],
  signedInputs: [{ index: 0, sighashType: 0x01 }],
  signerAddresses: [SELLER],
  attachedAssets: [{ inputIndex: 0, utxo: `${FANOUT_FUNDING_TXID}:2`, assets: [] }],
  attachedAssetDestination: null,
  hasCounterpartyPayload: false,
  transactionId: FANOUT_TXID,
});

describe('marketplace intent wire parser', () => {
  it('copies a bounded create-listing claim', () => {
    expect(parseMarketplaceIntent(intent)).toEqual(intent);
  });

  it('copies bounded reprice display context without changing the signing action', () => {
    const repriceIntent: CreateListingIntentClaim = {
      ...intent,
      listingContext: {
        mode: 'reprice',
      },
    };

    expect(parseMarketplaceIntent(repriceIntent)).toEqual(repriceIntent);
  });

  it('copies a bounded multi-item buy claim', () => {
    expect(parseMarketplaceIntent(buyIntent)).toEqual(buyIntent);
  });

  it('copies attached one-item purchase and exact-offer claims', () => {
    expect(parseMarketplaceIntent(attachedBuyBase().intent)).toEqual(attachedBuyBase().intent);
    expect(parseMarketplaceIntent(attachedExactBase().intent)).toEqual(attachedExactBase().intent);
  });

  it('refuses attached delivery for a multi-item checkout', () => {
    expect(() => parseMarketplaceIntent({
      ...buyIntent,
      delivery: { mode: 'attached', address: BUYER, carrierValueSats: 330 },
    })).toThrow(/exactly one item/);
  });

  it('copies a bounded attach-for-listing claim with a variable XCP fee', () => {
    expect(parseMarketplaceIntent(attachIntent)).toEqual(attachIntent);
  });

  it('copies a bounded price-free prepare-asset claim', () => {
    expect(parseMarketplaceIntent(prepareIntent)).toEqual(prepareIntent);
  });

  it('defaults an older same-address v1 attach claim to seller as its asset source', () => {
    const { assetSource: _assetSource, ...olderClaim } = attachIntent;
    expect(parseMarketplaceIntent(olderClaim)).toEqual(attachIntent);
  });

  it('copies bounded exact-offer authorization and acceptance claims', () => {
    expect(parseMarketplaceIntent(authorizeExactIntent)).toEqual(authorizeExactIntent);
    expect(parseMarketplaceIntent(acceptExactIntent)).toEqual(acceptExactIntent);
  });

  it('pins exact-offer transactions to version 2 with locktime 0', () => {
    expect(marketplaceTransactionHeaderProblem(authorizeExactIntent, 2, 0)).toBeNull();
    expect(marketplaceTransactionHeaderProblem(acceptExactIntent, 3, 0)).toMatch(/version 2/);
    expect(marketplaceTransactionHeaderProblem(acceptExactIntent, 2, 1)).toMatch(/locktime 0/);
  });

  it('copies a bounded plain-Bitcoin bulk fan-out claim', () => {
    expect(parseMarketplaceIntent(fanoutIntent)).toEqual(fanoutIntent);
  });

  it.each([
    { ...intent, version: 2 },
    { ...intent, action: 'buy_listings' },
    { ...intent, bitcoinExpiresAt: 2_000_000_000 },
    { ...intent, assets: [] },
    { ...intent, listingContext: { mode: 'replace' } },
  ])('refuses an unsupported or malformed claim', (candidate) => {
    expect(() => parseMarketplaceIntent(candidate)).toThrow();
  });
});

describe('attach-for-listing proof', () => {
  it('proves the attach transaction while labeling the block-dependent XCP fee', () => {
    const review = analyzeMarketplaceIntent(attachBase());

    expect(review.status).toBe('caution');
    expect(review.family).toBe('attach_for_listing');
    expect(review.blockers).toEqual([]);
    expect(review.facts).toContainEqual({
      kind: 'amount', label: 'Quoted XCP fee',
      value: '0.25 XCP', description: 'Finalized at confirmation',
    });
    // The block-dependence lives in the fact row itself; the attach carries no extra notice.
    expect(review.notices).toEqual([]);
  });

  it('analyzes an older persisted same-address v1 attach claim', () => {
    const request = attachBase();
    const { assetSource: _assetSource, ...olderIntent } = attachIntent;
    const review = analyzeMarketplaceIntent({
      ...request,
      intent: olderIntent as AttachForListingIntentClaim,
    });

    expect(review.status).toBe('caution');
    expect(review.blockers).toEqual([]);
  });

  it('distinguishes the Counterparty source from a paired carrier address', () => {
    const request = attachBase();
    const review = analyzeMarketplaceIntent({
      ...request,
      intent: {
        ...attachIntent,
        seller: SELLER_TWO,
        assetSource: SELLER,
        carrierAddress: SELLER_TWO,
      },
      inputs: [request.inputs[0]!],
      outputs: [
        { ...request.outputs[0]!, address: SELLER_TWO },
        request.outputs[1]!,
        { ...request.outputs[2]!, address: SELLER, value: 98_454 },
      ],
      signedInputs: [{ index: 0, sighashType: 0x01 }],
      signerAddresses: [SELLER],
    });

    expect(review.status).toBe('caution');
    expect(review.blockers).toEqual([]);
    expect(review.facts).toContainEqual({ kind: 'address', label: 'Asset source', value: SELLER });
    expect(review.facts).toContainEqual({ kind: 'address', label: 'New UTXO owner', value: SELLER_TWO });
  });

  it.each([
    ['message asset', {
      localCounterpartyMessage: {
        messageType: 'attach',
        data: { asset: 'SPELLS', quantity: 1n, destinationVout: 0 },
      },
    }],
    ['message quantity', {
      localCounterpartyMessage: {
        messageType: 'attach',
        data: { asset: 'RAREPEPE', quantity: 2n, destinationVout: 0 },
      },
    }],
    ['destination vout', {
      localCounterpartyMessage: {
        messageType: 'attach',
        data: { asset: 'RAREPEPE', quantity: 1n, destinationVout: 2 },
      },
    }],
    ['source', {
      inputs: [{ ...attachBase().inputs[0]!, address: BUYER }, attachBase().inputs[1]!],
    }],
    ['carrier value', {
      outputs: attachBase().outputs.map(output => output.index === 0
        ? { ...output, value: 545 }
        : output),
    }],
    ['carrier owner', {
      intent: { ...attachIntent, carrierAddress: SELLER_TWO },
    }],
    ['signature scope', {
      signedInputs: [{ index: 0, sighashType: 0x01 }, { index: 1, sighashType: 0x81 }],
    }],
    ['external output', {
      outputs: attachBase().outputs.map(output => output.index === 2
        ? { ...output, address: BUYER }
        : output),
    }],
    ['attached funding asset', {
      attachedAssets: [{
        inputIndex: 1,
        utxo: `${'16'.repeat(32)}:1`,
        assets: [{ asset: 'BONUS', quantity: '1', quantity_normalized: '1' }],
      }],
    }],
    ['fixed-fee label', {
      intent: {
        ...attachIntent,
        protocolFee: { ...attachIntent.protocolFee, variableUntilConfirmed: false },
      },
    }],
    ['premature actual XCP fee', {
      intent: {
        ...attachIntent,
        protocolFee: { ...attachIntent.protocolFee, actualAmountRaw: '25000000' },
      },
    }],
    ['transaction id', { transactionId: '17'.repeat(32) }],
  ])('blocks a mutation of %s', (_label, override) => {
    const review = analyzeMarketplaceIntent({ ...attachBase(), ...override });
    expect(review.status).toBe('blocked');
    expect(review.blockers.length).toBeGreaterThan(0);
  });

  it('requires a retry when a signed funding input asset lookup fails', () => {
    const review = analyzeMarketplaceIntent({
      ...attachBase(),
      attachedAssets: [{
        inputIndex: 0,
        utxo: `${'15'.repeat(32)}:0`,
        assets: [],
        lookupFailed: true,
      }],
    });

    expect(review.status).toBe('retry');
    expect(review.blockers.join(' ')).toMatch(/lookup/i);
  });
});

describe('prepare-asset proof', () => {
  it('proves the same exact attach without implying a listing', () => {
    const review = analyzeMarketplaceIntent({
      ...attachBase(),
      intent: prepareIntent,
    });

    expect(review).toMatchObject({
      status: 'caution',
      family: 'prepare_asset',
      title: 'Prepare RAREPEPE',
      blockers: [],
    });
    expect(review.facts).toContainEqual({
      kind: 'amount', label: 'Quoted XCP fee',
      value: '0.25 XCP', description: 'Finalized at confirmation',
    });
    expect(review.title).not.toMatch(/list/i);
  });

  it('proves a Legacy source preparing a carrier for its paired modern owner', () => {
    const request = attachBase();
    const review = analyzeMarketplaceIntent({
      ...request,
      intent: {
        ...prepareIntent,
        carrierOwner: SELLER_TWO,
        assetSource: SELLER,
      },
      inputs: [request.inputs[0]!],
      outputs: [
        { ...request.outputs[0]!, address: SELLER_TWO },
        request.outputs[1]!,
        { ...request.outputs[2]!, address: SELLER, value: 98_454 },
      ],
      signedInputs: [{ index: 0, sighashType: 0x01 }],
      signerAddresses: [SELLER],
    });

    expect(review.status).toBe('caution');
    expect(review.blockers).toEqual([]);
    expect(review.facts).toEqual(expect.arrayContaining([
      { kind: 'address', label: 'Asset source', value: SELLER },
      { kind: 'address', label: 'New UTXO owner', value: SELLER_TWO },
    ]));
  });

  it('refuses a prepare-asset claim with another protocol version', () => {
    expect(() => parseMarketplaceIntent({
      ...prepareIntent,
      protocolVersion: 'counterparty_attach_listing_v1',
    })).toThrow();
  });

  it.each([
    ['asset', {
      localCounterpartyMessage: {
        messageType: 'attach',
        data: { asset: 'SPELLS', quantity: 1n, destinationVout: 0 },
      },
    }],
    ['carrier', { intent: { ...prepareIntent, carrierOwner: SELLER_TWO } }],
    ['signature scope', { signedInputs: [{ index: 0, sighashType: 0x81 }] }],
  ])('blocks a malicious %s mutation', (_label, override) => {
    const review = analyzeMarketplaceIntent({ ...attachBase(), intent: prepareIntent, ...override });
    expect(review.status).toBe('blocked');
    expect(review.blockers.length).toBeGreaterThan(0);
  });
});

describe('create-listing proof', () => {
  it.each([330, 546])('separates the sale price from the actual %i-sat carrier return', carrier => {
    const input = base();
    input.inputs[1]!.value = carrier;
    input.outputs[1]!.value = 250_000 + carrier;
    input.intent = { ...input.intent, carrierValueSats: carrier, guaranteedSellerPaymentSats: 250_000 + carrier };
    const review = analyzeMarketplaceIntent(input);
    expect(review.status).toBe('proved');
    expect(review.facts).toEqual(expect.arrayContaining([
      { kind: 'amount', label: 'Sale price', value: '250,000 sats' },
      {
        kind: 'amount', label: 'Your UTXO sats returned', value: `${carrier} sats`, layout: 'stacked',
      },
      { kind: 'amount', label: 'Your payout if sold', value: (250_000 + carrier).toLocaleString() + ' sats', emphasis: 'primary' },
    ]));
    // A display redesign must not replace the actual prevout with a configured carrier default.
    expect(analyzeMarketplaceIntent({ ...input, intent: { ...input.intent, carrierValueSats: carrier + 1 } }).status).toBe('blocked');
  });

  it('proves exact seller payment and explains the bounded listing authorization', () => {
    const review = analyzeMarketplaceIntent(base());

    expect(review.status).toBe('proved');
    expect(review.blockers).toEqual([]);
    expect(review.title).toContain('RAREPEPE');
    expect(review.summary).toEqual({ label: 'List for sale', description: '1 RAREPEPE' });
    expect(review.facts).toContainEqual({ kind: 'amount', label: 'Sale price', value: '250,000 sats' });
    expect(review.facts).toContainEqual({
      kind: 'amount', label: 'Your payout if sold',
      value: '250,546 sats',
      emphasis: 'primary',
    });
    expect(review.facts).toContainEqual({ kind: 'text', label: 'Broadcast', value: 'Not broadcast now.' });
    expect(review.facts).toContainEqual({
      kind: 'paragraph', label: 'Marketplace cancellation',
      value: 'Delist without a transaction',
    });
    expect(review.facts).toContainEqual({
      kind: 'paragraph', label: 'Signature invalidation',
      value: 'Spend the asset UTXO',
    });
    expect(review.notices).toEqual([]);
  });

  it('labels a proved replacement authorization as a reprice', () => {
    const review = analyzeMarketplaceIntent({
      ...base(),
      intent: {
        ...intent,
        listingContext: {
          mode: 'reprice',
        },
      },
    });

    expect(review.status).toBe('proved');
    expect(review.title).toBe('Reprice 1 RAREPEPE to 0.00250000 BTC');
    expect(review.summary).toEqual({ label: 'Reprice listing', description: '1 RAREPEPE' });
  });

  it.each([
    ['seller payment', { outputs: [base().outputs[0]!, { ...base().outputs[1]!, value: 250_545 }] }],
    ['source outpoint', { inputs: [base().inputs[0]!, { ...base().inputs[1]!, txid: 'cd'.repeat(32) }] }],
    ['signature scope', { signedInputs: [{ index: 1, sighashType: 0x01 }] }],
    ['unproven placeholder signature state', {
      inputs: [{ ...base().inputs[0]!, hasSignatures: undefined }, base().inputs[1]!],
    }],
    ['payload', { hasCounterpartyPayload: true }],
    ['extra asset', {
      attachedAssets: [{
        ...base().attachedAssets[0]!,
        assets: [
          ...base().attachedAssets[0]!.assets,
          { asset: 'BONUS', quantity: '1', quantity_normalized: '1' },
        ],
      }],
    }],
  ])('blocks a mutation of %s', (_label, override) => {
    const review = analyzeMarketplaceIntent({ ...base(), ...override });
    expect(review.status).toBe('blocked');
    expect(review.blockers.length).toBeGreaterThan(0);
  });

  it('requires a retry when exact raw quantity is unavailable', () => {
    const request = base();
    const review = analyzeMarketplaceIntent({
      ...request,
      attachedAssets: [{
        ...request.attachedAssets[0]!,
        assets: [{ asset: 'RAREPEPE', quantity_normalized: '1' }],
      }],
    });

    expect(review.status).toBe('retry');
    expect(review.blockers.join(' ')).toMatch(/raw attached quantity/i);
  });
});

describe('buy-listings proof', () => {
  it.each([
    { mode: 'attached' as const, sellerCarrier: 330 },
    { mode: 'attached' as const, sellerCarrier: 546 },
    { mode: 'detached' as const, sellerCarrier: 330 },
    { mode: 'detached' as const, sellerCarrier: 546 },
  ])('preserves the seller $sellerCarrier-sat return with $mode buyer delivery', ({ mode, sellerCarrier }) => {
    const request = attachedBuyBase();
    const deliveryCarrier = mode === 'attached' ? 330 : 0;
    const sellerPayout = 100_000 + sellerCarrier;
    const delivery: BuyListingsIntentClaim['delivery'] = mode === 'attached'
      ? { mode, address: BUYER, carrierValueSats: deliveryCarrier }
      : { mode, address: BUYER };
    const checkout = {
      ...request,
      intent: {
        ...request.intent,
        delivery,
        items: request.intent.items.map(item => ({
          ...item, carrierValueSats: sellerCarrier, sellerPaymentSats: sellerPayout,
        })),
      },
      inputs: request.inputs.map(input => input.index === 1 ? { ...input, value: sellerCarrier } : input),
      outputs: [
        { index: 0, type: mode === 'attached' ? 'p2wpkh' : 'op_return', address: mode === 'attached' ? BUYER : undefined, value: deliveryCarrier },
        { ...request.outputs[1]!, value: sellerPayout },
        request.outputs[2]!,
        { ...request.outputs[3]!, value: 294_000 - deliveryCarrier },
      ],
      hasCounterpartyPayload: mode === 'detached',
      localCounterpartyMessage: mode === 'detached'
        ? { messageType: 'detach', data: { destination: BUYER } } : undefined,
    };
    const originalListing = base();
    const [listedAsset] = checkout.intent.assets;
    if (!listedAsset || checkout.intent.assets.length !== 1) {
      throw new Error('This linked listing fixture must contain exactly one asset');
    }
    const listing = analyzeMarketplaceIntent({
      ...originalListing,
      intent: {
        ...originalListing.intent, assets: [listedAsset],
        priceSats: 100_000, carrierValueSats: sellerCarrier, guaranteedSellerPaymentSats: sellerPayout,
      },
      inputs: originalListing.inputs.map(input => input.index === 1 ? { ...input, value: sellerCarrier } : input),
      outputs: originalListing.outputs.map(output => output.index === 1 ? { ...output, value: sellerPayout } : output),
      attachedAssets: checkout.attachedAssets,
    });

    expect(listing.status).toBe('proved');
    expect(listing.facts).toEqual(expect.arrayContaining([
      { kind: 'amount', label: 'Sale price', value: '100,000 sats' },
      { kind: 'amount', label: 'Your UTXO sats returned', value: `${sellerCarrier} sats`, layout: 'stacked' },
      { kind: 'amount', label: 'Your payout if sold', value: `${sellerPayout.toLocaleString()} sats`, emphasis: 'primary' },
    ]));
    expect(analyzeMarketplaceIntent(checkout)).toMatchObject({ status: 'proved', blockers: [] });
    expect(checkout.outputs[1]).toMatchObject({ address: SELLER, value: sellerPayout });
    // The buyer funds its separate attached output; it does not reduce the seller's payout.
    expect(checkout.inputs[0]!.value - checkout.outputs[3]!.value - checkout.intent.totalSats).toBe(deliveryCarrier);
    if (mode === 'attached') {
      expect(analyzeMarketplaceIntent({
        ...checkout,
        outputs: checkout.outputs.map(output => output.index === 1
          ? { ...output, value: output.value - deliveryCarrier } : output),
      }).status).toBe('blocked');
    }
  });

  it('proves the complete atomic checkout and detached delivery', () => {
    const review = analyzeMarketplaceIntent(buyBase());

    expect(review.status).toBe('proved');
    expect(review.family).toBe('buy_listings');
    expect(review.blockers).toEqual([]);
    expect(review.title).toContain('2 collectibles');
    expect(review.summary).toEqual({ label: 'Buy collectibles', description: '2 collectibles' });
    expect(review.facts[0]).toEqual({ kind: 'amount', label: 'You pay', value: '306,000 sats', emphasis: 'primary' });
    expect(review.facts).toContainEqual({ kind: 'address', label: 'Delivery', value: BUYER, description: 'Assets detach to this address' });
  });

  it('proves one attached purchase and its buyer-owned carrier', () => {
    const review = analyzeMarketplaceIntent(attachedBuyBase());

    expect(review).toMatchObject({ status: 'proved', family: 'buy_listings', blockers: [] });
    expect(review.facts).toContainEqual({ kind: 'amount', label: 'You receive', value: '1 RAREPEPE' });
    expect(review.facts).toContainEqual({
      kind: 'address', label: 'Delivery', value: BUYER,
      description: 'Asset stays attached to a 330-sat UTXO at this address',
    });
  });

  it('names the ledger-normalized divisible amount in the attached purchase summary', () => {
    const request = attachedBuyBase();
    const asset = { asset: 'PEPECASH', quantityRaw: '100000000' };
    request.intent.assets[0] = { ...request.intent.assets[0]!, ...asset };
    request.intent.items[0] = { ...request.intent.items[0]!, ...asset };
    request.attachedAssets[0]!.assets[0] = {
      asset: 'PEPECASH', quantity: '100000000', quantity_normalized: '1',
    };

    const review = analyzeMarketplaceIntent(request);

    expect(review.status).toBe('proved');
    expect(review.facts).toContainEqual({ kind: 'amount', label: 'You receive', value: '1 PEPECASH' });

    request.intent.items[0]!.quantityRaw = '200000000';
    const mismatchedReview = analyzeMarketplaceIntent(request);
    expect(mismatchedReview.status).toBe('blocked');
    expect(mismatchedReview.facts.some(fact => fact.label === 'You receive')).toBe(false);
  });

  it('blocks an attached purchase whose carrier is redirected or resized', () => {
    const request = attachedBuyBase();
    expect(analyzeMarketplaceIntent({
      ...request,
      outputs: [{ ...request.outputs[0]!, address: SELLER }, ...request.outputs.slice(1)],
    }).status).toBe('blocked');
    expect(analyzeMarketplaceIntent({
      ...request,
      outputs: [{ ...request.outputs[0]!, value: 329 }, ...request.outputs.slice(1)],
    }).status).toBe('blocked');
  });

  it.each([
    ['detach destination', {
      localCounterpartyMessage: { messageType: 'detach', data: { destination: SELLER } },
    }],
    ['seller payment', {
      outputs: buyBase().outputs.map(output => output.index === 1 ? { ...output, value: 100_545 } : output),
    }],
    ['seller outpoint', {
      inputs: buyBase().inputs.map(transactionInput => transactionInput.index === 2
        ? { ...transactionInput, txid: '12'.repeat(32) }
        : transactionInput),
    }],
    ['signature scope', { signedInputs: [{ index: 0, sighashType: 0x83 }] }],
    ['signer', { signerAddresses: [SELLER] }],
    ['transaction id', { transactionId: '13'.repeat(32) }],
    ['duplicate input', {
      inputs: buyBase().inputs.map(transactionInput => transactionInput.index === 2
        ? { ...transactionInput, txid: TXID, vout: 7 }
        : transactionInput),
    }],
    ['platform fee', {
      outputs: buyBase().outputs.map(output => output.index === 3 ? { ...output, value: 4_999 } : output),
    }],
    ['unexpected output', {
      outputs: [...buyBase().outputs, { index: 5, type: 'p2wpkh', address: BUYER, value: 1 }],
    }],
    ['attached buyer asset', {
      attachedAssets: [
        ...buyBase().attachedAssets,
        {
          inputIndex: 0,
          utxo: `${'11'.repeat(32)}:0`,
          assets: [{ asset: 'XCP', quantity: '1', quantity_normalized: '0.00000001' }],
        },
      ],
    }],
  ])('blocks a mutation of %s', (_label, override) => {
    const review = analyzeMarketplaceIntent({ ...buyBase(), ...override });
    expect(review.status).toBe('blocked');
    expect(review.summary).toBeUndefined();
    expect(review.blockers.length).toBeGreaterThan(0);
  });

  it.each([
    ['seller balance', {
      attachedAssets: buyBase().attachedAssets.map(entry => entry.inputIndex === 1
        ? { ...entry, assets: [], lookupFailed: true }
        : entry),
    }],
    ['raw quantity', {
      attachedAssets: buyBase().attachedAssets.map(entry => entry.inputIndex === 2
        ? { ...entry, assets: [{ asset: 'SPELLS', quantity_normalized: '1' }] }
        : entry),
    }],
    ['transaction id', { transactionId: undefined }],
  ])('requires a retry when %s cannot be proved', (_label, override) => {
    const review = analyzeMarketplaceIntent({ ...buyBase(), ...override });
    expect(review.status).toBe('retry');
    expect(review.summary).toBeUndefined();
    expect(review.blockers.length).toBeGreaterThan(0);
  });
});

describe('exact-offer authorization and unilateral acceptance proof', () => {
  it('defaults only omitted pre-fee claims to zero, without allowing an undeclared fee output', () => {
    const { platformFeeSats: _fee, ...legacy } = authorizeExactIntent;
    expect(parseMarketplaceIntent(legacy)).toEqual(authorizeExactIntent);
    const request = feeExactBase();
    expect(analyzeMarketplaceIntent({
      ...request, intent: parseMarketplaceIntent(legacy),
    }).status).toBe('blocked');
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '6250', null])(
    'rejects an invalid platform fee %s at the request boundary', platformFeeSats => {
      expect(() => parseMarketplaceIntent({ ...authorizeExactIntent, platformFeeSats })).toThrow(/platformFeeSats/);
    },
  );

  for (const accepting of [false, true]) {
    for (const attached of [false, true]) {
      describe(`${accepting ? 'seller acceptance' : 'buyer authorization'}, ${attached ? 'attached' : 'detached'}`, () => {
        it.each([1_000, 6_250, 6_251])('proves and displays a buyer-funded %i-sat fee separately from miner fees', feeSats => {
          const request = feeExactBase(accepting, attached, feeSats);
          const parsed = parseMarketplaceIntent(request.intent);
          expect(parsed).toEqual(request.intent);
          const review = analyzeMarketplaceIntent({ ...request, intent: parsed });
          expect(review).toMatchObject({ status: accepting ? 'proved' : 'caution', blockers: [] });
          expect(review.facts).toContainEqual({
            kind: 'amount', label: 'Platform fee', value: `${feeSats.toLocaleString()} sats`, description: 'Paid by the buyer',
          });
          expect(review.facts).toContainEqual({ kind: 'address', label: 'Fee recipient', value: PLATFORM });
          expect(review.facts).toContainEqual({ kind: 'amount', label: 'Seller receives', value: '250,046 sats' });
          expect(review.facts).toContainEqual({
            kind: 'amount', label: 'Network fee', value: '500 sats', description: 'Deducted from seller proceeds',
          });
          if (!accepting) {
            expect(review.facts).toContainEqual(expect.objectContaining({
              label: 'Buyer funding', value: `${(250_000 + feeSats + (attached ? 330 : 0)).toLocaleString()} sats`,
            }));
          }
        });

        const mutations: Array<[string, (request: ReturnType<typeof feeExactBase>) => void]> = [
          ['wrong fee amount', request => { request.outputs[2]!.value -= 1; }],
          ['missing fee output', request => { request.outputs.pop(); }],
          ['extra output', request => { request.outputs.push({ ...request.outputs[2]!, index: 3 }); }],
          ['reordered payments', request => {
            [request.outputs[1], request.outputs[2]] = [request.outputs[2]!, request.outputs[1]!];
          }],
          ['burned fee', request => { request.outputs[2]!.type = 'op_return'; }],
          ['unknown fee recipient', request => { request.outputs[2]!.address = undefined; }],
          ['fee returned to bidder', request => { request.outputs[2]!.address = BUYER; }],
          ['fee sent to seller', request => { request.outputs[2]!.address = SELLER; }],
          ['unfunded fee', request => { request.inputs[0]!.value -= request.intent.platformFeeSats; }],
          ['understated fee claim', request => { request.intent.platformFeeSats -= 1; }],
          ['fee charged twice to seller', request => {
            request.outputs[1]!.value -= request.intent.platformFeeSats;
            request.intent.sellerProceedsSats -= request.intent.platformFeeSats;
          }],
          ['weakened sighash', request => { request.signedInputs[0]!.sighashType = 0x81; }],
          ['different transaction', request => { request.transactionId = TXID_TWO; }],
          ['unsafe funding sum', request => { request.intent.platformFeeSats = Number.MAX_SAFE_INTEGER; }],
        ];
        it.each(mutations)('blocks %s', (_name, mutate) => {
          const request = feeExactBase(accepting, attached);
          mutate(request);
          const review = analyzeMarketplaceIntent(request);
          expect(review.status).toBe('blocked');
          expect(review.blockers.length).toBeGreaterThan(0);
        });
      });
    }
  }

  it('proves the buyer authorization while clearly labeling shared-slot authority', () => {
    const review = analyzeMarketplaceIntent(exactBase());

    expect(review).toMatchObject({
      status: 'caution',
      family: 'authorize_exact_offer',
      blockers: [],
    });
    expect(review.facts).toContainEqual({ kind: 'amount', label: 'Offer price', value: '250,000 sats' });
    expect(review.notices[0]?.message).toMatch(/without another approval/i);
    expect(review.notices[0]?.message).toMatch(/first confirmed spend wins/i);
  });

  it('proves attached delivery for both buyer authorization and seller acceptance', () => {
    const authorization = analyzeMarketplaceIntent(attachedExactBase());
    const acceptance = analyzeMarketplaceIntent(attachedExactBase(true));

    expect(authorization).toMatchObject({ status: 'caution', blockers: [] });
    expect(acceptance).toMatchObject({ status: 'proved', blockers: [] });
    expect(authorization.facts).toContainEqual({
      kind: 'address', label: 'Delivery', value: BUYER,
      description: 'Asset stays attached to a 330-sat UTXO at this address',
    });
  });

  it('blocks an attached offer that omits the carrier funding or redirects output 0', () => {
    const request = attachedExactBase();
    expect(analyzeMarketplaceIntent({
      ...request,
      inputs: [{ ...request.inputs[0]!, value: 250_000 }, request.inputs[1]!],
    }).status).toBe('blocked');
    expect(analyzeMarketplaceIntent({
      ...request,
      outputs: [{ ...request.outputs[0]!, address: SELLER }, request.outputs[1]!],
    }).status).toBe('blocked');
  });

  it('proves that the seller signature completes the exact sale without a buyer callback', () => {
    const review = analyzeMarketplaceIntent(exactBase(true));

    expect(review).toMatchObject({
      status: 'proved',
      family: 'accept_exact_offer',
      blockers: [],
    });
    expect(review.notices[0]?.message).toMatch(/without a buyer callback/i);
    expect(review.notices[0]?.message).toMatch(/asset remains yours/i);
  });

  it.each([
    ['detach destination', {
      localCounterpartyMessage: { messageType: 'detach', data: { destination: SELLER } },
    }],
    ['funding outpoint', {
      inputs: exactBase().inputs.map(transactionInput => transactionInput.index === 0
        ? { ...transactionInput, vout: 5 }
        : transactionInput),
    }],
    ['asset outpoint', {
      inputs: exactBase().inputs.map(transactionInput => transactionInput.index === 1
        ? { ...transactionInput, txid: TXID_TWO }
        : transactionInput),
    }],
    ['buyer value', {
      inputs: exactBase().inputs.map(transactionInput => transactionInput.index === 0
        ? { ...transactionInput, value: 249_999 }
        : transactionInput),
    }],
    ['carrier value', {
      inputs: exactBase().inputs.map(transactionInput => transactionInput.index === 1
        ? { ...transactionInput, value: 545 }
        : transactionInput),
    }],
    ['seller proceeds', {
      outputs: [exactBase().outputs[0]!, { ...exactBase().outputs[1]!, value: 250_045 }],
    }],
    ['signature scope', { signedInputs: [{ index: 0, sighashType: 0x81 }] }],
    ['signer', { signerAddresses: [SELLER] }],
    ['transaction id', { transactionId: TXID_TWO }],
    ['attached buyer asset', {
      attachedAssets: [
        ...exactBase().attachedAssets,
        {
          inputIndex: 0,
          utxo: `${BID_TXID}:4`,
          assets: [{ asset: 'XCP', quantity: '1', quantity_normalized: '0.00000001' }],
        },
      ],
    }],
    ['asset quantity', {
      attachedAssets: [{
        ...exactBase().attachedAssets[0]!,
        assets: [{ asset: 'RAREPEPE', quantity: '2', quantity_normalized: '2' }],
      }],
    }],
  ])('blocks an authorization mutation of %s', (_label, override) => {
    const review = analyzeMarketplaceIntent({ ...exactBase(), ...override });
    expect(review.status).toBe('blocked');
    expect(review.blockers.length).toBeGreaterThan(0);
  });

  it.each([
    ['missing buyer authorization', {
      inputs: exactBase(true).inputs.map(transactionInput => transactionInput.index === 0
        ? { ...transactionInput, hasSignatures: false }
        : transactionInput),
    }],
    ['already-signed seller input', {
      inputs: exactBase(true).inputs.map(transactionInput => transactionInput.index === 1
        ? { ...transactionInput, hasSignatures: true }
        : transactionInput),
    }],
    ['buyer input requested again', { signedInputs: [{ index: 0, sighashType: 0x01 }] }],
    ['wrong seller signer', { signerAddresses: [BUYER] }],
  ])('blocks a seller-acceptance mutation of %s', (_label, override) => {
    const review = analyzeMarketplaceIntent({ ...exactBase(true), ...override });
    expect(review.status).toBe('blocked');
    expect(review.blockers.length).toBeGreaterThan(0);
  });

  it('requires retry rather than trusting the label when the target asset lookup fails', () => {
    const review = analyzeMarketplaceIntent({
      ...exactBase(),
      attachedAssets: [{
        inputIndex: 1,
        utxo: `${TXID}:7`,
        assets: [],
        lookupFailed: true,
      }],
    });

    expect(review.status).toBe('retry');
    expect(review.blockers.join(' ')).toMatch(/lookup/i);
  });
});

describe('bulk fan-out funding proof', () => {
  it('proves that every plain-Bitcoin output remains controlled by the seller', () => {
    const review = analyzeMarketplaceIntent(fanoutBase());

    expect(review).toMatchObject({
      status: 'proved',
      family: 'prepare_bulk_fanout',
      blockers: [],
    });
    expect(review.facts).toContainEqual({ kind: 'amount', label: 'New UTXOs', value: '2 × 10,000 sats' });
    expect(review.notices[0]?.message).toMatch(/no asset moves/i);
  });

  it.each([
    ['funding outpoint', {
      inputs: [{ ...fanoutBase().inputs[0]!, vout: 3 }],
    }],
    ['funding value', {
      inputs: [{ ...fanoutBase().inputs[0]!, value: 99_999 }],
    }],
    ['external output', {
      outputs: fanoutBase().outputs.map(output => output.index === 1
        ? { ...output, address: BUYER }
        : output),
    }],
    ['slot value', {
      outputs: fanoutBase().outputs.map(output => output.index === 0
        ? { ...output, value: 9_999 }
        : output),
    }],
    ['signature scope', { signedInputs: [{ index: 0, sighashType: 0x81 }] }],
    ['signer', { signerAddresses: [BUYER] }],
    ['payload', { hasCounterpartyPayload: true }],
    ['existing signature', {
      inputs: [{ ...fanoutBase().inputs[0]!, hasSignatures: true }],
    }],
    ['attached asset', {
      attachedAssets: [{
        inputIndex: 0,
        utxo: `${FANOUT_FUNDING_TXID}:2`,
        assets: [{ asset: 'XCP', quantity: '1', quantity_normalized: '0.00000001' }],
      }],
    }],
  ])('blocks a mutation of %s', (_label, override) => {
    const review = analyzeMarketplaceIntent({ ...fanoutBase(), ...override });
    expect(review.status).toBe('blocked');
    expect(review.blockers.length).toBeGreaterThan(0);
  });

  it('requires retry when clean-funding status cannot be proved', () => {
    const review = analyzeMarketplaceIntent({
      ...fanoutBase(),
      attachedAssets: [{
        inputIndex: 0,
        utxo: `${FANOUT_FUNDING_TXID}:2`,
        assets: [],
        lookupFailed: true,
      }],
    });
    expect(review.status).toBe('retry');
  });
});
