import { describe, expect, it } from 'vitest';
import {
  analyzeMarketplaceIntent,
  type CreateListingIntentClaim,
  parseMarketplaceIntent,
} from '@/core/counterparty/marketplaceIntent';

const SELLER = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const TXID = 'ab'.repeat(32);

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

describe('marketplace intent wire parser', () => {
  it('copies a bounded create-listing claim', () => {
    expect(parseMarketplaceIntent(intent)).toEqual(intent);
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
