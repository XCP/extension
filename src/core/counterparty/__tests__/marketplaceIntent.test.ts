import { describe, expect, it } from 'vitest';
import {
  type AcceptExactOfferIntentClaim,
  type AttachForListingIntentClaim,
  type AuthorizeExactOfferIntentClaim,
  analyzeMarketplaceIntent,
  type BuyListingsIntentClaim,
  type CreateListingIntentClaim,
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

const attachIntent: AttachForListingIntentClaim = {
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'attach_for_listing',
  operationId: 'attach-1',
  protocolVersion: 'counterparty_attach_listing_v1',
  assets: [{ asset: 'RAREPEPE', quantityRaw: '1' }],
  seller: SELLER,
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

describe('marketplace intent wire parser', () => {
  it('copies a bounded create-listing claim', () => {
    expect(parseMarketplaceIntent(intent)).toEqual(intent);
  });

  it('copies a bounded multi-item buy claim', () => {
    expect(parseMarketplaceIntent(buyIntent)).toEqual(buyIntent);
  });

  it('copies a bounded attach-for-listing claim with a variable XCP fee', () => {
    expect(parseMarketplaceIntent(attachIntent)).toEqual(attachIntent);
  });

  it('copies bounded exact-offer authorization and acceptance claims', () => {
    expect(parseMarketplaceIntent(authorizeExactIntent)).toEqual(authorizeExactIntent);
    expect(parseMarketplaceIntent(acceptExactIntent)).toEqual(acceptExactIntent);
  });

  it.each([
    { ...intent, version: 2 },
    { ...intent, action: 'buy_listings' },
    { ...intent, bitcoinExpiresAt: 2_000_000_000 },
    { ...intent, assets: [] },
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
    expect(review.facts).toContainEqual({ label: 'Quoted XCP fee', value: '0.25 XCP' });
    expect(review.notices[0]?.message).toMatch(/recomputes it at the block/i);
  });

  it('distinguishes the Counterparty source from a paired carrier address', () => {
    const request = attachBase();
    const review = analyzeMarketplaceIntent({
      ...request,
      intent: { ...attachIntent, carrierAddress: SELLER_TWO },
      outputs: request.outputs.map(output => output.index === 0
        ? { ...output, address: SELLER_TWO }
        : output),
    });

    expect(review.status).toBe('caution');
    expect(review.blockers).toEqual([]);
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

describe('create-listing proof', () => {
  it('proves exact seller payment while stating buyer-selected detach flexibility', () => {
    const review = analyzeMarketplaceIntent(base());

    expect(review.status).toBe('caution');
    expect(review.blockers).toEqual([]);
    expect(review.title).toContain('RAREPEPE');
    expect(review.facts).toContainEqual({ label: 'Seller receives', value: '250,546 sats' });
    expect(review.notices[0]?.message).toContain('choose the detach destination');
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
  it('proves the complete atomic checkout and detached delivery', () => {
    const review = analyzeMarketplaceIntent(buyBase());

    expect(review.status).toBe('proved');
    expect(review.family).toBe('buy_listings');
    expect(review.blockers).toEqual([]);
    expect(review.title).toContain('2 collectibles');
    expect(review.facts).toContainEqual({ label: 'You pay', value: '306,000 sats' });
    expect(review.facts).toContainEqual({ label: 'Delivery', value: `Detached to ${BUYER}` });
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
    expect(review.blockers.length).toBeGreaterThan(0);
  });
});

describe('exact-offer authorization and unilateral acceptance proof', () => {
  it('proves the buyer authorization while clearly labeling shared-slot authority', () => {
    const review = analyzeMarketplaceIntent(exactBase());

    expect(review).toMatchObject({
      status: 'caution',
      family: 'authorize_exact_offer',
      blockers: [],
    });
    expect(review.facts).toContainEqual({ label: 'Offer price', value: '250,000 sats' });
    expect(review.notices[0]?.message).toMatch(/without another approval/i);
    expect(review.notices[0]?.message).toMatch(/first confirmed spend wins/i);
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
