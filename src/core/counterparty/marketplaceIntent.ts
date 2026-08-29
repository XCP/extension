/**
 * Wallet-side proof for versioned Counterparty marketplace intent claims.
 *
 * An intent is display context from a website, never authority. The parser only bounds its wire
 * shape; the analyzer independently matches every security-relevant term to PSBT bytes, requested
 * signatures, prevouts, and Counterparty UTXO balances.
 */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import type { AttachedAssetDestination } from '@/core/counterparty/attachedAssetMovement';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';

export const MARKETPLACE_INTENT_STANDARD = 'counterparty-marketplace' as const;
export const MARKETPLACE_INTENT_VERSION = 1 as const;

export interface MarketplaceOutpointClaim {
  txid: string;
  vout: number;
}

export interface MarketplaceAssetClaim {
  asset: string;
  quantityRaw: string;
  sourceOutpoint: MarketplaceOutpointClaim;
}

export interface AttachForListingIntentClaim {
  standard: typeof MARKETPLACE_INTENT_STANDARD;
  version: typeof MARKETPLACE_INTENT_VERSION;
  action: 'attach_for_listing';
  operationId: string;
  protocolVersion: 'counterparty_attach_listing_v1';
  assets: [{ asset: string; quantityRaw: string }];
  seller: string;
  /** Address whose Counterparty balance and first attach input are consumed.
   * It defaults to seller when parsing older same-address v1 requests. */
  assetSource: string;
  expectedAttachedOutpoint: MarketplaceOutpointClaim;
  carrierAddress: string;
  carrierValueSats: number;
  networkFeeSats: number;
  protocolFee: {
    asset: 'XCP';
    quotedAmountRaw: string;
    actualAmountRaw: string | null;
    observedBlock: number | null;
    variableUntilConfirmed: boolean;
  };
  operationExpiresAt: number;
}

export interface CreateListingIntentClaim {
  standard: typeof MARKETPLACE_INTENT_STANDARD;
  version: typeof MARKETPLACE_INTENT_VERSION;
  action: 'create_listing';
  operationId: string;
  protocolVersion: 'counterparty_attach_listing_v1';
  assets: [MarketplaceAssetClaim];
  seller: string;
  priceSats: number;
  carrierValueSats: number;
  guaranteedSellerPaymentSats: number;
  delivery: { mode: 'buyer_selected_detach' };
  signingRequestExpiresAt: number;
  marketplaceExpiresAt: number | null;
  bitcoinExpiresAt: null;
}

export interface BuyListingsIntentClaim {
  standard: typeof MARKETPLACE_INTENT_STANDARD;
  version: typeof MARKETPLACE_INTENT_VERSION;
  action: 'buy_listings';
  operationId: string;
  protocolVersion: 'direct_v1';
  assets: MarketplaceAssetClaim[];
  buyer: string;
  items: Array<MarketplaceAssetClaim & {
    listingId: string;
    seller: string;
    carrierValueSats: number;
    priceSats: number;
    sellerPaymentSats: number;
  }>;
  subtotalSats: number;
  networkFeeSats: number;
  platformFeeSats: number;
  totalSats: number;
  expectedTxid: string;
  delivery: { mode: 'detached'; address: string };
  marketplaceExpiresAt: number;
}

interface ExactOfferIntentBase<Action extends 'authorize_exact_offer' | 'accept_exact_offer'> {
  standard: typeof MARKETPLACE_INTENT_STANDARD;
  version: typeof MARKETPLACE_INTENT_VERSION;
  action: Action;
  operationId: string;
  protocolVersion: 'exact_offer_v1';
  assets: [MarketplaceAssetClaim];
  authorizationId: string;
  bidder: string;
  seller: string;
  priceSats: number;
  carrierValueSats: number;
  sellerProceedsSats: number;
  networkFeeSats: number;
  expectedTxid: string;
  delivery: { mode: 'detached'; address: string };
  marketplaceExpiresAt: number;
  bitcoinExpiresAt: null;
  bitcoinInvalidation: {
    type: 'spend_funding_outpoint';
    outpoint: MarketplaceOutpointClaim;
  };
}

export interface AuthorizeExactOfferIntentClaim
  extends ExactOfferIntentBase<'authorize_exact_offer'> {}

export interface AcceptExactOfferIntentClaim
  extends ExactOfferIntentBase<'accept_exact_offer'> {}

export interface PrepareBulkFanoutIntentClaim {
  standard: typeof MARKETPLACE_INTENT_STANDARD;
  version: typeof MARKETPLACE_INTENT_VERSION;
  action: 'prepare_bulk_fanout';
  operationId: string;
  protocolVersion: 'counterparty_bulk_attach_v1';
  assets: [];
  batchIndex: number;
  seller: string;
  fundingOutpoint: MarketplaceOutpointClaim;
  fundingValueSats: number;
  slotCount: number;
  slotValueSats: number;
  networkFeeSats: number;
  changeSats: number;
  expectedTxid: string;
  operationExpiresAt: number;
}

export type MarketplaceIntentClaimV1 =
  | AttachForListingIntentClaim
  | CreateListingIntentClaim
  | BuyListingsIntentClaim
  | AuthorizeExactOfferIntentClaim
  | AcceptExactOfferIntentClaim
  | PrepareBulkFanoutIntentClaim;

export interface MarketplaceApprovalReview {
  status: 'proved' | 'caution' | 'retry' | 'blocked';
  family:
    | 'attach_for_listing'
    | 'create_listing'
    | 'buy_listings'
    | 'authorize_exact_offer'
    | 'accept_exact_offer'
    | 'accept_exact_offer_with_cpfp'
    | 'prepare_bulk_fanout'
    | 'marketplace_batch';
  title: string;
  facts: Array<{ label: string; value: string }>;
  notices: Array<{ severity: 'info' | 'warning' | 'danger'; message: string }>;
  blockers: string[];
}

interface InputLike {
  index: number;
  txid: string;
  vout: number;
  address?: string;
  value?: number;
  hasSignatures?: boolean;
}

interface OutputLike {
  index: number;
  type: string;
  address?: string;
  value: number;
}

export interface MarketplaceAnalysisInput {
  intent: MarketplaceIntentClaimV1;
  inputs: InputLike[];
  outputs: OutputLike[];
  signedInputs: Array<{ index: number; sighashType: number }>;
  signerAddresses: string[];
  attachedAssets: InputAttachedAssets[];
  attachedAssetDestination: AttachedAssetDestination | null;
  hasCounterpartyPayload: boolean;
  transactionId?: string;
  localCounterpartyMessage?: { messageType: string; data: unknown };
}

/**
 * Enforce transaction-header invariants that belong to the marketplace protocol itself.
 * These values are decoded from the PSBT and are never trusted from the requesting site.
 * A future zero-fee TRUC offer protocol must declare and validate its v3 parent/child shape
 * separately; exact_offer_v1 deliberately remains version 2 with locktime 0.
 */
export function marketplaceTransactionHeaderProblem(
  intent: { action: string; protocolVersion?: string },
  transactionVersion: number,
  lockTime: number,
): string | null {
  if (
    intent.protocolVersion === 'exact_offer_v1'
    && (transactionVersion !== 2 || lockTime !== 0)
  ) {
    return 'exact_offer_v1 requires Bitcoin transaction version 2 with locktime 0';
  }
  return null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const boundedString = (value: unknown, label: string, max = 160): string => {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new Error(`${label} must be a non-empty string of at most ${max} characters`);
  }
  return value;
};

const safeInteger = (
  value: unknown,
  label: string,
  options: { positive?: boolean; nullable?: boolean } = {},
): number | null => {
  if (value === null && options.nullable) return null;
  if (!Number.isSafeInteger(value) || (options.positive && Number(value) <= 0)) {
    throw new Error(`${label} must be ${options.positive ? 'a positive ' : 'a '}safe integer`);
  }
  return Number(value);
};

const nonNegativeSafeInteger = (value: unknown, label: string): number => {
  const parsed = safeInteger(value, label);
  if (parsed === null || parsed < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return parsed;
};

const outpoint = (value: unknown, label: string): MarketplaceOutpointClaim => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const txid = boundedString(value.txid, `${label}.txid`, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txid)) throw new Error(`${label}.txid must be 32-byte hex`);
  const vout = safeInteger(value.vout, `${label}.vout`);
  if (vout === null || vout < 0) throw new Error(`${label}.vout must be a non-negative safe integer`);
  return { txid, vout };
};

const asset = (value: unknown, label: string): MarketplaceAssetClaim => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const quantityRaw = boundedString(value.quantityRaw, `${label}.quantityRaw`, 24);
  if (!/^[1-9][0-9]*$/.test(quantityRaw)) {
    throw new Error(`${label}.quantityRaw must be a positive base-unit integer string`);
  }
  return {
    asset: boundedString(value.asset, `${label}.asset`, 250),
    quantityRaw,
    sourceOutpoint: outpoint(value.sourceOutpoint, `${label}.sourceOutpoint`),
  };
};

const assetWithoutOutpoint = (
  value: unknown,
  label: string,
): { asset: string; quantityRaw: string } => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const quantityRaw = boundedString(value.quantityRaw, `${label}.quantityRaw`, 24);
  if (!/^[1-9][0-9]*$/.test(quantityRaw)) {
    throw new Error(`${label}.quantityRaw must be a positive base-unit integer string`);
  }
  return {
    asset: boundedString(value.asset, `${label}.asset`, 250),
    quantityRaw,
  };
};

const nonNegativeRawInteger = (value: unknown, label: string): string => {
  const raw = boundedString(value, label, 24);
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error(`${label} must be a non-negative base-unit integer string`);
  }
  return raw;
};

/** Bound and copy the v1 wire claim. The result remains untrusted until analyzed. */
export function parseMarketplaceIntent(value: unknown): MarketplaceIntentClaimV1 {
  if (!isRecord(value)) throw new Error('marketplace intent must be an object');
  if (value.standard !== MARKETPLACE_INTENT_STANDARD || value.version !== 1) {
    throw new Error(`marketplace intent must use ${MARKETPLACE_INTENT_STANDARD} version 1`);
  }
  if (value.action === 'attach_for_listing') return parseAttachForListingIntent(value);
  if (value.action === 'prepare_bulk_fanout') return parsePrepareBulkFanoutIntent(value);
  if (value.action === 'buy_listings') return parseBuyListingsIntent(value);
  if (value.action === 'authorize_exact_offer' || value.action === 'accept_exact_offer') {
    return parseExactOfferIntent(value, value.action);
  }
  if (value.action !== 'create_listing') {
    throw new Error('marketplace intent action is not supported by this wallet version');
  }
  if (value.protocolVersion !== 'counterparty_attach_listing_v1') {
    throw new Error('create_listing intent has the wrong protocolVersion');
  }
  if (!Array.isArray(value.assets) || value.assets.length !== 1) {
    throw new Error('create_listing intent must claim exactly one asset');
  }
  if (!isRecord(value.delivery) || value.delivery.mode !== 'buyer_selected_detach') {
    throw new Error('create_listing delivery must be buyer_selected_detach');
  }
  if (value.bitcoinExpiresAt !== null) {
    throw new Error('create_listing has no Bitcoin-level expiry');
  }

  return {
    standard: MARKETPLACE_INTENT_STANDARD,
    version: MARKETPLACE_INTENT_VERSION,
    action: 'create_listing',
    operationId: boundedString(value.operationId, 'operationId'),
    protocolVersion: 'counterparty_attach_listing_v1',
    assets: [asset(value.assets[0], 'assets[0]')],
    seller: boundedString(value.seller, 'seller', 128),
    priceSats: safeInteger(value.priceSats, 'priceSats', { positive: true })!,
    carrierValueSats: safeInteger(value.carrierValueSats, 'carrierValueSats', { positive: true })!,
    guaranteedSellerPaymentSats: safeInteger(
      value.guaranteedSellerPaymentSats,
      'guaranteedSellerPaymentSats',
      { positive: true },
    )!,
    delivery: { mode: 'buyer_selected_detach' },
    signingRequestExpiresAt: safeInteger(value.signingRequestExpiresAt, 'signingRequestExpiresAt')!,
    marketplaceExpiresAt: safeInteger(value.marketplaceExpiresAt, 'marketplaceExpiresAt', {
      nullable: true,
    }),
    bitcoinExpiresAt: null,
  };
}

const parsePrepareBulkFanoutIntent = (
  value: Record<string, unknown>,
): PrepareBulkFanoutIntentClaim => {
  if (value.protocolVersion !== 'counterparty_bulk_attach_v1') {
    throw new Error('prepare_bulk_fanout intent has the wrong protocolVersion');
  }
  if (!Array.isArray(value.assets) || value.assets.length !== 0) {
    throw new Error('prepare_bulk_fanout must not claim attached assets');
  }
  const expectedTxid = boundedString(value.expectedTxid, 'expectedTxid', 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedTxid)) {
    throw new Error('expectedTxid must be 32-byte hex');
  }
  const batchIndex = safeInteger(value.batchIndex, 'batchIndex');
  const slotCount = safeInteger(value.slotCount, 'slotCount', { positive: true });
  if (batchIndex === null || batchIndex < 0) {
    throw new Error('batchIndex must be a non-negative safe integer');
  }
  if (slotCount === null || slotCount > 24) {
    throw new Error('slotCount must be 1..24');
  }
  return {
    standard: MARKETPLACE_INTENT_STANDARD,
    version: MARKETPLACE_INTENT_VERSION,
    action: 'prepare_bulk_fanout',
    operationId: boundedString(value.operationId, 'operationId'),
    protocolVersion: 'counterparty_bulk_attach_v1',
    assets: [],
    batchIndex,
    seller: boundedString(value.seller, 'seller', 128),
    fundingOutpoint: outpoint(value.fundingOutpoint, 'fundingOutpoint'),
    fundingValueSats: safeInteger(value.fundingValueSats, 'fundingValueSats', {
      positive: true,
    })!,
    slotCount,
    slotValueSats: safeInteger(value.slotValueSats, 'slotValueSats', { positive: true })!,
    networkFeeSats: nonNegativeSafeInteger(value.networkFeeSats, 'networkFeeSats'),
    changeSats: nonNegativeSafeInteger(value.changeSats, 'changeSats'),
    expectedTxid,
    operationExpiresAt: safeInteger(value.operationExpiresAt, 'operationExpiresAt', {
      positive: true,
    })!,
  };
};

const parseAttachForListingIntent = (
  value: Record<string, unknown>,
): AttachForListingIntentClaim => {
  if (value.protocolVersion !== 'counterparty_attach_listing_v1') {
    throw new Error('attach_for_listing intent has the wrong protocolVersion');
  }
  if (!Array.isArray(value.assets) || value.assets.length !== 1) {
    throw new Error('attach_for_listing intent must claim exactly one asset');
  }
  if (!isRecord(value.protocolFee) || value.protocolFee.asset !== 'XCP') {
    throw new Error('attach_for_listing protocolFee must be denominated in XCP');
  }
  const actualAmountRaw = value.protocolFee.actualAmountRaw === null
    ? null
    : nonNegativeRawInteger(value.protocolFee.actualAmountRaw, 'protocolFee.actualAmountRaw');
  const observedBlock = safeInteger(value.protocolFee.observedBlock, 'protocolFee.observedBlock', {
    nullable: true,
  });
  if (observedBlock !== null && observedBlock < 0) {
    throw new Error('protocolFee.observedBlock must be a non-negative safe integer or null');
  }
  if (typeof value.protocolFee.variableUntilConfirmed !== 'boolean') {
    throw new Error('protocolFee.variableUntilConfirmed must be boolean');
  }
  const seller = boundedString(value.seller, 'seller', 128);

  return {
    standard: MARKETPLACE_INTENT_STANDARD,
    version: MARKETPLACE_INTENT_VERSION,
    action: 'attach_for_listing',
    operationId: boundedString(value.operationId, 'operationId'),
    protocolVersion: 'counterparty_attach_listing_v1',
    assets: [assetWithoutOutpoint(value.assets[0], 'assets[0]')],
    seller,
    assetSource: boundedString(value.assetSource ?? seller, 'assetSource', 128),
    expectedAttachedOutpoint: outpoint(
      value.expectedAttachedOutpoint,
      'expectedAttachedOutpoint',
    ),
    carrierAddress: boundedString(value.carrierAddress, 'carrierAddress', 128),
    carrierValueSats: safeInteger(value.carrierValueSats, 'carrierValueSats', {
      positive: true,
    })!,
    networkFeeSats: nonNegativeSafeInteger(value.networkFeeSats, 'networkFeeSats'),
    protocolFee: {
      asset: 'XCP',
      quotedAmountRaw: nonNegativeRawInteger(
        value.protocolFee.quotedAmountRaw,
        'protocolFee.quotedAmountRaw',
      ),
      actualAmountRaw,
      observedBlock,
      variableUntilConfirmed: value.protocolFee.variableUntilConfirmed,
    },
    operationExpiresAt: safeInteger(value.operationExpiresAt, 'operationExpiresAt', {
      positive: true,
    })!,
  };
};

const parseExactOfferIntent = <
  Action extends 'authorize_exact_offer' | 'accept_exact_offer',
>(
  value: Record<string, unknown>,
  action: Action,
): ExactOfferIntentBase<Action> => {
  if (value.protocolVersion !== 'exact_offer_v1') {
    throw new Error(`${action} intent has the wrong protocolVersion`);
  }
  if (!Array.isArray(value.assets) || value.assets.length !== 1) {
    throw new Error(`${action} intent must claim exactly one asset`);
  }
  if (!isRecord(value.delivery) || value.delivery.mode !== 'detached') {
    throw new Error(`${action} delivery must be detached`);
  }
  if (value.bitcoinExpiresAt !== null) {
    throw new Error(`${action} has no Bitcoin-level expiry`);
  }
  if (
    !isRecord(value.bitcoinInvalidation)
    || value.bitcoinInvalidation.type !== 'spend_funding_outpoint'
  ) {
    throw new Error(`${action} must be invalidated by spending its funding outpoint`);
  }
  const expectedTxid = boundedString(value.expectedTxid, 'expectedTxid', 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedTxid)) {
    throw new Error('expectedTxid must be 32-byte hex');
  }

  return {
    standard: MARKETPLACE_INTENT_STANDARD,
    version: MARKETPLACE_INTENT_VERSION,
    action,
    operationId: boundedString(value.operationId, 'operationId'),
    protocolVersion: 'exact_offer_v1',
    assets: [asset(value.assets[0], 'assets[0]')],
    authorizationId: boundedString(value.authorizationId, 'authorizationId'),
    bidder: boundedString(value.bidder, 'bidder', 128),
    seller: boundedString(value.seller, 'seller', 128),
    priceSats: safeInteger(value.priceSats, 'priceSats', { positive: true })!,
    carrierValueSats: safeInteger(value.carrierValueSats, 'carrierValueSats', {
      positive: true,
    })!,
    sellerProceedsSats: safeInteger(value.sellerProceedsSats, 'sellerProceedsSats', {
      positive: true,
    })!,
    networkFeeSats: nonNegativeSafeInteger(value.networkFeeSats, 'networkFeeSats'),
    expectedTxid,
    delivery: {
      mode: 'detached',
      address: boundedString(value.delivery.address, 'delivery.address', 128),
    },
    marketplaceExpiresAt: safeInteger(value.marketplaceExpiresAt, 'marketplaceExpiresAt', {
      positive: true,
    })!,
    bitcoinExpiresAt: null,
    bitcoinInvalidation: {
      type: 'spend_funding_outpoint',
      outpoint: outpoint(
        value.bitcoinInvalidation.outpoint,
        'bitcoinInvalidation.outpoint',
      ),
    },
  };
};

const parseBuyListingsIntent = (value: Record<string, unknown>): BuyListingsIntentClaim => {
  if (value.protocolVersion !== 'direct_v1') {
    throw new Error('buy_listings intent has the wrong protocolVersion');
  }
  if (
    !Array.isArray(value.assets)
    || !Array.isArray(value.items)
    || value.items.length < 1
    || value.items.length > 20
    || value.assets.length !== value.items.length
  ) {
    throw new Error('buy_listings intent must claim 1..20 aligned assets and items');
  }
  if (
    !isRecord(value.delivery)
    || value.delivery.mode !== 'detached'
  ) {
    throw new Error('buy_listings delivery must be detached');
  }

  const items = value.items.map((itemValue, index) => {
    if (!isRecord(itemValue)) throw new Error(`items[${index}] must be an object`);
    return {
      ...asset(itemValue, `items[${index}]`),
      listingId: boundedString(itemValue.listingId, `items[${index}].listingId`),
      seller: boundedString(itemValue.seller, `items[${index}].seller`, 128),
      carrierValueSats: safeInteger(
        itemValue.carrierValueSats,
        `items[${index}].carrierValueSats`,
        { positive: true },
      )!,
      priceSats: safeInteger(itemValue.priceSats, `items[${index}].priceSats`, {
        positive: true,
      })!,
      sellerPaymentSats: safeInteger(
        itemValue.sellerPaymentSats,
        `items[${index}].sellerPaymentSats`,
        { positive: true },
      )!,
    };
  });
  const expectedTxid = boundedString(value.expectedTxid, 'expectedTxid', 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedTxid)) {
    throw new Error('expectedTxid must be 32-byte hex');
  }

  return {
    standard: MARKETPLACE_INTENT_STANDARD,
    version: MARKETPLACE_INTENT_VERSION,
    action: 'buy_listings',
    operationId: boundedString(value.operationId, 'operationId'),
    protocolVersion: 'direct_v1',
    assets: value.assets.map((entry, index) => asset(entry, `assets[${index}]`)),
    buyer: boundedString(value.buyer, 'buyer', 128),
    items,
    subtotalSats: safeInteger(value.subtotalSats, 'subtotalSats', { positive: true })!,
    networkFeeSats: nonNegativeSafeInteger(value.networkFeeSats, 'networkFeeSats'),
    platformFeeSats: nonNegativeSafeInteger(value.platformFeeSats, 'platformFeeSats'),
    totalSats: safeInteger(value.totalSats, 'totalSats', { positive: true })!,
    expectedTxid,
    delivery: {
      mode: 'detached',
      address: boundedString(value.delivery.address, 'delivery.address', 128),
    },
    marketplaceExpiresAt: safeInteger(value.marketplaceExpiresAt, 'marketplaceExpiresAt', {
      positive: true,
    })!,
  };
};

const sameAddress = (left: string | undefined, right: string) =>
  left !== undefined
  && normalizeAddressForComparison(left) === normalizeAddressForComparison(right);

/** Prove the seller's flexible listing authorization from independent transaction facts. */
function analyzeCreateListingIntent({
  inputs,
  outputs,
  signedInputs,
  signerAddresses,
  attachedAssets,
  attachedAssetDestination,
  hasCounterpartyPayload,
}: MarketplaceAnalysisInput, intent: CreateListingIntentClaim): MarketplaceApprovalReview {
  const blockers: string[] = [];
  const retry: string[] = [];
  const claim = intent.assets[0];
  const sellerInput = inputs[1];
  const sellerOutput = outputs[1];

  if (inputs.length !== 2 || outputs.length !== 2) {
    blockers.push(`expected exactly 2 inputs and 2 outputs, got ${inputs.length}/${outputs.length}`);
  }
  if (inputs[0]?.txid !== '0'.repeat(64) || inputs[0]?.vout !== 0) {
    blockers.push('input 0 is not the null buyer-funding placeholder');
  }
  if (inputs[0]?.hasSignatures !== false) {
    blockers.push('buyer placeholder input 0 must be proven unsigned');
  }
  if (hasCounterpartyPayload) blockers.push('a listing authorization must not carry a Counterparty payload yet');

  if (
    signedInputs.length !== 1
    || signedInputs[0]?.index !== 1
    || signedInputs[0]?.sighashType !== 0x83
  ) {
    blockers.push('the wallet must sign only input 1 with SINGLE|ANYONECANPAY (0x83)');
  }
  if (signerAddresses.length !== 1 || !sameAddress(signerAddresses[0], intent.seller)) {
    blockers.push('the requested signer is not exactly the claimed seller');
  }

  if (!sellerInput) {
    blockers.push('seller input 1 is missing');
  } else {
    if (
      sellerInput.txid.toLowerCase() !== claim.sourceOutpoint.txid
      || sellerInput.vout !== claim.sourceOutpoint.vout
    ) {
      blockers.push('seller input 1 is not the claimed attached outpoint');
    }
    if (!sameAddress(sellerInput.address, intent.seller)) {
      blockers.push('seller input 1 is not controlled by the claimed seller');
    }
    if (sellerInput.value !== intent.carrierValueSats) {
      blockers.push('seller input carrier value differs from the claim');
    }
  }

  if (intent.guaranteedSellerPaymentSats !== intent.carrierValueSats + intent.priceSats) {
    blockers.push('claimed seller payment does not equal carrier plus price');
  }
  if (!sellerOutput) {
    blockers.push('guaranteed seller output 1 is missing');
  } else {
    if (!sameAddress(sellerOutput.address, intent.seller)) {
      blockers.push('output 1 does not pay the seller');
    }
    if (sellerOutput.value !== intent.guaranteedSellerPaymentSats) {
      blockers.push('output 1 amount differs from the guaranteed seller payment');
    }
  }

  const balance = attachedAssets.find(entry => entry.inputIndex === 1);
  // The ledger-normalized amount, for display: facts only render on proved/caution, where this
  // lookup has succeeded — so the screen never has to show raw base units.
  let provedQuantity: string | null = null;
  if (balance?.lookupFailed) {
    retry.push('the attached-asset lookup for seller input 1 failed');
  } else if (!balance || balance.assets.length !== 1) {
    blockers.push('seller input 1 does not independently resolve to exactly one attached asset');
  } else {
    const actual = balance.assets[0]!;
    if (actual.asset !== claim.asset) blockers.push('attached asset name differs from the claim');
    if (actual.quantity === undefined) {
      retry.push('the indexer did not return an exact raw attached quantity');
    } else if (actual.quantity !== claim.quantityRaw) {
      blockers.push('attached asset raw quantity differs from the claim');
    } else {
      provedQuantity = actual.quantity_normalized;
    }
  }

  // Unknowable is not disproven: with the balance lookup failed there is no attached-asset
  // destination to check, and blocking on its absence would present a ledger outage as a lying
  // site. The retry above already gates signing.
  if (
    !balance?.lookupFailed
    && (attachedAssetDestination?.destinationCommitted !== false
      || attachedAssetDestination?.mode !== 'flexible')
  ) {
    blockers.push('listing signature does not prove the expected buyer-selected delivery flexibility');
  }

  const allProblems = [...retry, ...blockers];
  const status = blockers.length > 0 ? 'blocked' : retry.length > 0 ? 'retry' : 'proved';
  return {
    status,
    family: 'create_listing',
    title: `List 1 ${claim.asset} for ${(intent.priceSats / 100_000_000).toFixed(8)} BTC`,
    facts: [
      { label: 'Price', value: `${intent.priceSats.toLocaleString()} sats` },
      {
        label: 'Seller receives',
        value:
          `${intent.guaranteedSellerPaymentSats.toLocaleString()} sats ` +
          `(price + ${intent.carrierValueSats.toLocaleString()}-sat asset output)`,
      },
      { label: 'Quantity', value: `${provedQuantity ?? claim.quantityRaw} ${claim.asset}` },
      { label: 'Delivery', value: 'Detached to the eventual buyer' },
      { label: 'Broadcast now', value: 'None' },
      {
        label: 'Marketplace expiry',
        value: intent.marketplaceExpiresAt === null
          ? 'None requested'
          : new Date(intent.marketplaceExpiresAt * 1000).toLocaleString(),
      },
      { label: 'Marketplace cancellation', value: 'Delist without a transaction' },
      { label: 'Signature invalidation', value: 'Spend the asset output' },
    ],
    notices: [],
    blockers: allProblems,
  };
}

const sameOutpoint = (
  input: InputLike | undefined,
  claim: MarketplaceOutpointClaim,
): boolean => input?.txid.toLowerCase() === claim.txid && input.vout === claim.vout;

const safeSum = (values: number[]): number | null => {
  const sum = values.reduce((total, value) => total + value, 0);
  return Number.isSafeInteger(sum) ? sum : null;
};

const formatXcpRaw = (raw: string): string => {
  const amount = BigInt(raw);
  const whole = amount / 100_000_000n;
  const fraction = (amount % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction} XCP` : `${whole} XCP`;
};

/** Prove the full-input ALL-signed attach that creates one listable carrier UTXO. */
function analyzeAttachForListingIntent(
  input: MarketplaceAnalysisInput,
  intent: AttachForListingIntentClaim,
): MarketplaceApprovalReview {
  const {
    inputs,
    outputs,
    signedInputs,
    signerAddresses,
    attachedAssets,
    hasCounterpartyPayload,
    transactionId,
    localCounterpartyMessage,
  } = input;
  const blockers: string[] = [];
  const retry: string[] = [];
  const claim = intent.assets[0];
  // A request can already be persisted when the extension updates. Those older
  // same-address v1 records bypass the wire parser, so retain its compatibility default here.
  const assetSource = intent.assetSource ?? intent.seller;

  if (!intent.protocolFee.variableUntilConfirmed) {
    blockers.push('the attach XCP fee must be labeled variable until confirmation');
  }
  if (intent.protocolFee.actualAmountRaw !== null) {
    blockers.push('an unsigned attach cannot claim an actual confirmed XCP fee');
  }

  if (!transactionId) {
    retry.push('the wallet could not establish the unsigned transaction id');
  } else if (transactionId.toLowerCase() !== intent.expectedAttachedOutpoint.txid) {
    blockers.push('the unsigned transaction id differs from the expected attached outpoint');
  }
  if (!hasCounterpartyPayload) {
    blockers.push('the attach request carries no Counterparty payload');
  }
  const attachData = isRecord(localCounterpartyMessage?.data)
    ? localCounterpartyMessage.data
    : undefined;
  if (localCounterpartyMessage?.messageType !== 'attach' || !attachData) {
    blockers.push('the Counterparty payload is not a locally decoded attach');
  } else {
    if (attachData.asset !== claim.asset) {
      blockers.push('the locally decoded attach asset differs from the claim');
    }
    if (
      typeof attachData.quantity !== 'bigint'
      || attachData.quantity.toString() !== claim.quantityRaw
    ) {
      blockers.push('the locally decoded attach raw quantity differs from the claim');
    }
    const destinationVout = typeof attachData.destinationVout === 'number'
      ? attachData.destinationVout
      : outputs.find(output => output.type !== 'op_return')?.index;
    if (destinationVout !== intent.expectedAttachedOutpoint.vout) {
      blockers.push('the locally decoded attach destination vout differs from the claim');
    }
  }

  if (inputs.length < 1) blockers.push('the attach request has no funding inputs');
  const inputOutpoints = inputs.map(transactionInput =>
    `${transactionInput.txid.toLowerCase()}:${transactionInput.vout}`);
  if (new Set(inputOutpoints).size !== inputOutpoints.length) {
    blockers.push('the attach request contains a duplicate input outpoint');
  }
  const expectedSignedIndices = inputs.map((_, index) => index);
  const sortedSignedInputs = [...signedInputs].sort((left, right) => left.index - right.index);
  if (
    sortedSignedInputs.length !== expectedSignedIndices.length
    || sortedSignedInputs.some(
      (signed, index) => signed.index !== expectedSignedIndices[index] || signed.sighashType !== 0x01,
    )
    || new Set(signedInputs.map(signed => signed.index)).size !== signedInputs.length
  ) {
    blockers.push('the wallet must sign every attach input exactly once with ALL (0x01)');
  }
  if (!sameAddress(inputs[0]?.address, assetSource)) {
    blockers.push('Counterparty source input 0 is not controlled by the claimed asset source');
  }

  const inputAddresses = inputs.map(transactionInput => transactionInput.address);
  if (inputAddresses.some(address => !address)) {
    blockers.push('the wallet could not resolve every attach input owner');
  } else {
    const expectedSigners = new Set(
      (inputAddresses as string[]).map(normalizeAddressForComparison),
    );
    const actualSigners = new Set(signerAddresses.map(normalizeAddressForComparison));
    if (
      expectedSigners.size !== actualSigners.size
      || [...expectedSigners].some(address => !actualSigners.has(address))
    ) {
      blockers.push('the requested signer set does not exactly match the attach input owners');
    }
  }

  const balances = new Map(attachedAssets.map(entry => [entry.inputIndex, entry]));
  for (const transactionInput of inputs) {
    if (transactionInput.hasSignatures !== false) {
      blockers.push(`input ${transactionInput.index} must be proven unsigned before attach approval`);
    }
    if (transactionInput.value === undefined) {
      retry.push(`attach input ${transactionInput.index} has no authenticated value`);
    }
    const balance = balances.get(transactionInput.index);
    if (balance?.lookupFailed) {
      retry.push(`the attached-asset lookup for attach input ${transactionInput.index} failed`);
    } else if (balance && balance.assets.length > 0) {
      blockers.push(`attach funding input ${transactionInput.index} already carries attached assets`);
    }
  }

  const target = outputs[intent.expectedAttachedOutpoint.vout];
  if (!sameAddress(intent.carrierAddress, intent.seller)) {
    blockers.push('the attached carrier address differs from the claimed seller');
  }
  if (!target) {
    blockers.push('the claimed attached carrier output is missing');
  } else {
    if (!sameAddress(target.address, intent.carrierAddress)) {
      blockers.push('the attached carrier output is not controlled by the claimed carrier address');
    }
    if (target.value !== intent.carrierValueSats) {
      blockers.push('the attached carrier output value differs from the claim');
    }
    if (target.type === 'op_return') {
      blockers.push('the attached carrier destination cannot be an OP_RETURN output');
    }
  }
  const dataOutputs = outputs.filter(output => output.type === 'op_return');
  if (dataOutputs.length !== 1 || dataOutputs[0]?.value !== 0) {
    blockers.push('the attach must contain exactly one zero-value OP_RETURN data output');
  }
  const signerSet = new Set(signerAddresses.map(normalizeAddressForComparison));
  for (const output of outputs) {
    if (output.type === 'op_return') continue;
    if (output.index === intent.expectedAttachedOutpoint.vout) continue;
    if (!output.address || !signerSet.has(normalizeAddressForComparison(output.address))) {
      blockers.push(`attach output ${output.index} is not controlled by an approved signer`);
    }
  }

  const allInputValues = inputs.map(transactionInput => transactionInput.value);
  if (allInputValues.some(value => value === undefined)) {
    retry.push('the wallet could not authenticate every input value needed to prove the miner fee');
  } else {
    const inputTotal = safeSum(allInputValues as number[]);
    const outputTotal = safeSum(outputs.map(output => output.value));
    const actualFee = inputTotal === null || outputTotal === null ? null : inputTotal - outputTotal;
    if (actualFee === null || actualFee < 0 || actualFee !== intent.networkFeeSats) {
      blockers.push('the actual Bitcoin miner fee differs from the claim');
    }
  }

  const allProblems = [...retry, ...blockers];
  const status = blockers.length > 0
    ? 'blocked'
    : retry.length > 0
      ? 'retry'
      : 'caution';
  return {
    status,
    family: 'attach_for_listing',
    // The standard attach screen already states the asset, amount, network fee, and the created
    // outpoint — these facts carry only what is marketplace-specific, so the merged details list
    // says each thing once.
    title: `Attach ${claim.asset} for listing`,
    facts: [
      { label: 'Asset source', value: assetSource },
      { label: 'Asset destination', value: intent.seller },
      { label: 'Destination UTXO', value: `${intent.carrierValueSats.toLocaleString()} sats` },
      {
        label: 'Quoted XCP fee',
        value: `${formatXcpRaw(intent.protocolFee.quotedAmountRaw)} (finalized at confirmation)`,
      },
      {
        label: 'Operation expiry',
        value: new Date(intent.operationExpiresAt * 1000).toLocaleString(),
      },
    ],
    notices: [],
    blockers: allProblems,
  };
}

/** Prove an atomic buyer checkout whose complete transaction is committed by SIGHASH_ALL. */
function analyzeBuyListingsIntent(
  input: MarketplaceAnalysisInput,
  intent: BuyListingsIntentClaim,
): MarketplaceApprovalReview {
  const {
    inputs,
    outputs,
    signedInputs,
    signerAddresses,
    attachedAssets,
    hasCounterpartyPayload,
    transactionId,
    localCounterpartyMessage,
  } = input;
  const blockers: string[] = [];
  const retry: string[] = [];
  const itemCount = intent.items.length;
  const firstAdditionalBuyerInput = itemCount + 1;

  if (!sameAddress(intent.delivery.address, intent.buyer)) {
    blockers.push('the claimed detach address differs from the claimed buyer');
  }
  if (!transactionId) {
    retry.push('the wallet could not establish the unsigned transaction id');
  } else if (transactionId.toLowerCase() !== intent.expectedTxid) {
    blockers.push('the unsigned transaction id differs from the claim');
  }
  if (!hasCounterpartyPayload) {
    blockers.push('the checkout carries no Counterparty payload');
  }
  const detachData = isRecord(localCounterpartyMessage?.data)
    ? localCounterpartyMessage.data
    : undefined;
  if (localCounterpartyMessage?.messageType !== 'detach' || !detachData) {
    blockers.push('the Counterparty payload is not a locally decoded detach');
  } else if (
    typeof detachData.destination !== 'string'
    || !sameAddress(detachData.destination, intent.delivery.address)
  ) {
    blockers.push('the locally decoded detach destination differs from the buyer');
  }

  if (inputs.length < itemCount + 1) {
    blockers.push(`expected at least ${itemCount + 1} inputs, got ${inputs.length}`);
  }
  const inputOutpoints = inputs.map(transactionInput =>
    `${transactionInput.txid.toLowerCase()}:${transactionInput.vout}`);
  if (new Set(inputOutpoints).size !== inputOutpoints.length) {
    blockers.push('the checkout contains a duplicate input outpoint');
  }
  const listingIds = intent.items.map(item => item.listingId);
  if (new Set(listingIds).size !== listingIds.length) {
    blockers.push('the checkout contains a duplicate listing id');
  }
  if (outputs[0]?.type !== 'op_return' || outputs[0]?.value !== 0) {
    blockers.push('output 0 is not the zero-value Counterparty detach output');
  }

  const expectedSignedIndices = [
    0,
    ...Array.from(
      { length: Math.max(0, inputs.length - firstAdditionalBuyerInput) },
      (_, index) => firstAdditionalBuyerInput + index,
    ),
  ];
  const sortedSignedInputs = [...signedInputs].sort((left, right) => left.index - right.index);
  if (
    sortedSignedInputs.length !== expectedSignedIndices.length
    || sortedSignedInputs.some(
      (signed, index) => signed.index !== expectedSignedIndices[index] || signed.sighashType !== 0x01,
    )
    || new Set(signedInputs.map(signed => signed.index)).size !== signedInputs.length
  ) {
    blockers.push('the wallet must sign every buyer funding input, and only those inputs, with ALL (0x01)');
  }
  if (signerAddresses.length !== 1 || !sameAddress(signerAddresses[0], intent.buyer)) {
    blockers.push('the requested signer is not exactly the claimed buyer');
  }
  inputs.forEach((transactionInput) => {
    if (transactionInput.hasSignatures !== false) {
      blockers.push(`input ${transactionInput.index} must be proven unsigned before buyer approval`);
    }
  });

  const balances = new Map(attachedAssets.map(entry => [entry.inputIndex, entry]));
  for (const buyerInputIndex of expectedSignedIndices) {
    const buyerInput = inputs[buyerInputIndex];
    if (!buyerInput) continue;
    if (!sameAddress(buyerInput.address, intent.buyer)) {
      blockers.push(`buyer funding input ${buyerInputIndex} is not controlled by the claimed buyer`);
    }
    if (buyerInput.value === undefined) {
      retry.push(`buyer funding input ${buyerInputIndex} has no authenticated value`);
    }
    const balance = balances.get(buyerInputIndex);
    if (balance?.lookupFailed) {
      retry.push(`the attached-asset lookup for buyer input ${buyerInputIndex} failed`);
    } else if (balance && balance.assets.length > 0) {
      blockers.push(`buyer funding input ${buyerInputIndex} carries attached Counterparty assets`);
    }
  }

  for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
    const item = intent.items[itemIndex]!;
    const claim = intent.assets[itemIndex]!;
    const sellerInputIndex = itemIndex + 1;
    const sellerInput = inputs[sellerInputIndex];
    const sellerOutput = outputs[sellerInputIndex];

    if (
      item.asset !== claim.asset
      || item.quantityRaw !== claim.quantityRaw
      || item.sourceOutpoint.txid !== claim.sourceOutpoint.txid
      || item.sourceOutpoint.vout !== claim.sourceOutpoint.vout
    ) {
      blockers.push(`item ${itemIndex + 1} does not align with its top-level asset claim`);
    }
    if (item.sellerPaymentSats !== item.carrierValueSats + item.priceSats) {
      blockers.push(`item ${itemIndex + 1} seller payment is not carrier plus price`);
    }
    if (!sellerInput) {
      blockers.push(`seller input ${sellerInputIndex} is missing`);
    } else {
      if (!sameOutpoint(sellerInput, item.sourceOutpoint)) {
        blockers.push(`seller input ${sellerInputIndex} is not the claimed attached outpoint`);
      }
      if (!sameAddress(sellerInput.address, item.seller)) {
        blockers.push(`seller input ${sellerInputIndex} is not controlled by the claimed seller`);
      }
      if (sellerInput.value === undefined) {
        retry.push(`seller input ${sellerInputIndex} has no authenticated carrier value`);
      } else if (sellerInput.value !== item.carrierValueSats) {
        blockers.push(`seller input ${sellerInputIndex} carrier value differs from the claim`);
      }
    }
    if (!sellerOutput) {
      blockers.push(`seller payment output ${sellerInputIndex} is missing`);
    } else {
      if (!sameAddress(sellerOutput.address, item.seller)) {
        blockers.push(`output ${sellerInputIndex} does not pay the claimed seller`);
      }
      if (sellerOutput.value !== item.sellerPaymentSats) {
        blockers.push(`output ${sellerInputIndex} differs from the claimed seller payment`);
      }
    }

    const balance = balances.get(sellerInputIndex);
    if (balance?.lookupFailed) {
      retry.push(`the attached-asset lookup for seller input ${sellerInputIndex} failed`);
    } else if (!balance || balance.assets.length !== 1) {
      blockers.push(`seller input ${sellerInputIndex} does not resolve to exactly one attached asset`);
    } else {
      const actual = balance.assets[0]!;
      if (actual.asset !== item.asset) {
        blockers.push(`seller input ${sellerInputIndex} attached asset differs from the claim`);
      }
      if (actual.quantity === undefined) {
        retry.push(`seller input ${sellerInputIndex} has no exact raw attached quantity`);
      } else if (actual.quantity !== item.quantityRaw) {
        blockers.push(`seller input ${sellerInputIndex} raw attached quantity differs from the claim`);
      }
    }
  }

  const subtotal = safeSum(intent.items.map(item => item.priceSats));
  if (subtotal === null || subtotal !== intent.subtotalSats) {
    blockers.push('the claimed subtotal does not equal the item prices');
  }
  const claimedTotal = safeSum([
    intent.subtotalSats,
    intent.networkFeeSats,
    intent.platformFeeSats,
  ]);
  if (claimedTotal === null || claimedTotal !== intent.totalSats) {
    blockers.push('the claimed total does not equal subtotal plus network and platform fees');
  }

  let trailingIndex = itemCount + 1;
  if (intent.platformFeeSats > 0) {
    const platformOutput = outputs[trailingIndex];
    if (
      !platformOutput
      || platformOutput.type === 'op_return'
      || !platformOutput.address
      || sameAddress(platformOutput.address, intent.buyer)
      || platformOutput.value !== intent.platformFeeSats
    ) {
      blockers.push(`output ${trailingIndex} is not the claimed external platform fee`);
    }
    trailingIndex += 1;
  }
  const changeOutput = outputs[trailingIndex];
  if (changeOutput && (!sameAddress(changeOutput.address, intent.buyer) || changeOutput.value <= 0)) {
    blockers.push(`output ${trailingIndex} is not valid buyer change`);
  }
  if (outputs.length > trailingIndex + Number(Boolean(changeOutput))) {
    blockers.push('the checkout has unexpected trailing outputs');
  }

  const allInputValues = inputs.map(transactionInput => transactionInput.value);
  if (allInputValues.some(value => value === undefined)) {
    retry.push('the wallet could not authenticate every input value needed to prove the miner fee');
  } else {
    const inputTotal = safeSum(allInputValues as number[]);
    const outputTotal = safeSum(outputs.map(output => output.value));
    const actualFee = inputTotal === null || outputTotal === null ? null : inputTotal - outputTotal;
    if (actualFee === null || actualFee < 0 || actualFee !== intent.networkFeeSats) {
      blockers.push('the actual miner fee differs from the claim');
    }
  }

  const buyerInputValues = expectedSignedIndices.map(index => inputs[index]?.value);
  if (!buyerInputValues.some(value => value === undefined)) {
    const buyerInputTotal = safeSum(buyerInputValues as number[]);
    const buyerChange = changeOutput?.value ?? 0;
    if (buyerInputTotal === null || buyerInputTotal - buyerChange !== intent.totalSats) {
      blockers.push('the buyer funding minus change differs from the claimed total');
    }
  }

  const allProblems = [...retry, ...blockers];
  const status = blockers.length > 0 ? 'blocked' : retry.length > 0 ? 'retry' : 'proved';
  const distinctAssets = new Set(intent.items.map(item => item.asset)).size;
  return {
    status,
    family: 'buy_listings',
    title: `Buy ${itemCount} collectible${itemCount === 1 ? '' : 's'} for ${(intent.totalSats / 100_000_000).toFixed(8)} BTC`,
    facts: [
      { label: 'Items', value: `${itemCount} across ${distinctAssets} asset${distinctAssets === 1 ? '' : 's'}` },
      // No network-fee row: the money-movement summary beside these facts already states it.
      { label: 'Seller subtotal', value: `${intent.subtotalSats.toLocaleString()} sats` },
      { label: 'Platform fee', value: `${intent.platformFeeSats.toLocaleString()} sats` },
      { label: 'You pay', value: `${intent.totalSats.toLocaleString()} sats` },
      { label: 'Delivery', value: `Detached to ${intent.delivery.address}` },
      {
        label: 'Marketplace expiry',
        value: new Date(intent.marketplaceExpiresAt * 1000).toLocaleString(),
      },
    ],
    notices: allProblems.length > 0
      ? []
      : [{
          severity: 'info',
          message:
            'SIGHASH_ALL fixes every input, seller payment, fee, change output, and the detach destination shown above.',
        }],
    blockers: allProblems,
  };
}

/**
 * Prove the fixed transaction shared by exact-offer authorization and unilateral acceptance.
 * The role changes, but the economics never do: buyer input 0 pays the exact price, seller input
 * 1 contributes the asset carrier, output 0 detaches to the bidder, and output 1 returns carrier
 * plus price minus the miner fee to the seller. Both signatures bind the whole transaction.
 */
function analyzeExactOfferIntent(
  input: MarketplaceAnalysisInput,
  intent: AuthorizeExactOfferIntentClaim | AcceptExactOfferIntentClaim,
): MarketplaceApprovalReview {
  const {
    inputs,
    outputs,
    signedInputs,
    signerAddresses,
    attachedAssets,
    hasCounterpartyPayload,
    transactionId,
    localCounterpartyMessage,
  } = input;
  const blockers: string[] = [];
  const retry: string[] = [];
  const claim = intent.assets[0];
  const authorizing = intent.action === 'authorize_exact_offer';
  const requestedInputIndex = authorizing ? 0 : 1;
  const requestedSigner = authorizing ? intent.bidder : intent.seller;

  if (!sameAddress(intent.delivery.address, intent.bidder)) {
    blockers.push('the detach delivery address differs from the bidder');
  }
  if (!transactionId) {
    retry.push('the wallet could not establish the unsigned transaction id');
  } else if (transactionId.toLowerCase() !== intent.expectedTxid) {
    blockers.push('the unsigned transaction id differs from the exact authorization');
  }
  if (!hasCounterpartyPayload) {
    blockers.push('the exact offer carries no Counterparty payload');
  }
  const detachData = isRecord(localCounterpartyMessage?.data)
    ? localCounterpartyMessage.data
    : undefined;
  if (localCounterpartyMessage?.messageType !== 'detach' || !detachData) {
    blockers.push('the Counterparty payload is not a locally decoded detach');
  } else if (
    typeof detachData.destination !== 'string'
    || !sameAddress(detachData.destination, intent.delivery.address)
  ) {
    blockers.push('the locally decoded detach destination differs from the bidder');
  }

  if (inputs.length !== 2 || outputs.length !== 2) {
    blockers.push(`expected exactly 2 inputs and 2 outputs, got ${inputs.length}/${outputs.length}`);
  }
  const inputOutpoints = inputs.map(transactionInput =>
    `${transactionInput.txid.toLowerCase()}:${transactionInput.vout}`);
  if (new Set(inputOutpoints).size !== inputOutpoints.length) {
    blockers.push('the exact offer contains a duplicate input outpoint');
  }
  if (outputs[0]?.type !== 'op_return' || outputs[0]?.value !== 0) {
    blockers.push('output 0 is not the zero-value Counterparty detach output');
  }

  if (
    signedInputs.length !== 1
    || signedInputs[0]?.index !== requestedInputIndex
    || signedInputs[0]?.sighashType !== 0x01
  ) {
    blockers.push(
      `the wallet must sign only input ${requestedInputIndex} with ALL (0x01) for this action`,
    );
  }
  if (signerAddresses.length !== 1 || !sameAddress(signerAddresses[0], requestedSigner)) {
    blockers.push(`the requested signer is not exactly the claimed ${authorizing ? 'bidder' : 'seller'}`);
  }
  if (authorizing) {
    if (inputs[0]?.hasSignatures !== false || inputs[1]?.hasSignatures !== false) {
      blockers.push('both exact-offer inputs must be proven unsigned before buyer authorization');
    }
  } else {
    if (inputs[0]?.hasSignatures !== true) {
      blockers.push('seller acceptance requires the stored buyer authorization on input 0');
    }
    if (inputs[1]?.hasSignatures !== false) {
      blockers.push('seller input 1 must be proven unsigned before acceptance');
    }
  }

  const bidderInput = inputs[0];
  if (!bidderInput) {
    blockers.push('buyer funding input 0 is missing');
  } else {
    if (!sameOutpoint(bidderInput, intent.bitcoinInvalidation.outpoint)) {
      blockers.push('input 0 is not the funding outpoint that invalidates this authorization');
    }
    if (!sameAddress(bidderInput.address, intent.bidder)) {
      blockers.push('input 0 is not controlled by the claimed bidder');
    }
    if (bidderInput.value === undefined) {
      retry.push('buyer funding input 0 has no authenticated value');
    } else if (bidderInput.value !== intent.priceSats) {
      blockers.push('buyer funding input 0 does not equal the exact offer price');
    }
  }

  const sellerInput = inputs[1];
  if (!sellerInput) {
    blockers.push('seller asset input 1 is missing');
  } else {
    if (!sameOutpoint(sellerInput, claim.sourceOutpoint)) {
      blockers.push('input 1 is not the claimed attached asset outpoint');
    }
    if (!sameAddress(sellerInput.address, intent.seller)) {
      blockers.push('input 1 is not controlled by the claimed seller');
    }
    if (sellerInput.value === undefined) {
      retry.push('seller input 1 has no authenticated carrier value');
    } else if (sellerInput.value !== intent.carrierValueSats) {
      blockers.push('seller input 1 carrier value differs from the claim');
    }
  }

  const balances = new Map(attachedAssets.map(entry => [entry.inputIndex, entry]));
  const bidderBalance = balances.get(0);
  if (bidderBalance?.lookupFailed) {
    retry.push('the attached-asset lookup for buyer funding input 0 failed');
  } else if (bidderBalance && bidderBalance.assets.length > 0) {
    blockers.push('buyer funding input 0 carries attached Counterparty assets');
  }
  const sellerBalance = balances.get(1);
  // The ledger-normalized amount, for display: the title only needs it on proved/caution, where
  // this lookup has succeeded — so the screen never has to show raw base units.
  let provedQuantity: string | null = null;
  if (sellerBalance?.lookupFailed) {
    retry.push('the attached-asset lookup for seller input 1 failed');
  } else if (!sellerBalance || sellerBalance.assets.length !== 1) {
    blockers.push('seller input 1 does not independently resolve to exactly one attached asset');
  } else {
    const actual = sellerBalance.assets[0]!;
    if (actual.asset !== claim.asset) {
      blockers.push('seller input 1 attached asset differs from the claim');
    }
    if (actual.quantity === undefined) {
      retry.push('seller input 1 has no exact raw attached quantity');
    } else if (actual.quantity !== claim.quantityRaw) {
      blockers.push('seller input 1 raw attached quantity differs from the claim');
    } else {
      provedQuantity = actual.quantity_normalized;
    }
  }

  const claimedProceeds = safeSum([
    intent.priceSats,
    intent.carrierValueSats,
    -intent.networkFeeSats,
  ]);
  if (claimedProceeds === null || claimedProceeds !== intent.sellerProceedsSats) {
    blockers.push('claimed seller proceeds do not equal price plus carrier minus miner fee');
  }
  const sellerOutput = outputs[1];
  if (!sellerOutput) {
    blockers.push('seller proceeds output 1 is missing');
  } else {
    if (!sameAddress(sellerOutput.address, intent.seller)) {
      blockers.push('output 1 does not pay the claimed seller');
    }
    if (sellerOutput.value !== intent.sellerProceedsSats) {
      blockers.push('output 1 differs from the claimed seller proceeds');
    }
  }

  const allInputValues = inputs.map(transactionInput => transactionInput.value);
  if (allInputValues.some(value => value === undefined)) {
    retry.push('the wallet could not authenticate every input value needed to prove the miner fee');
  } else {
    const inputTotal = safeSum(allInputValues as number[]);
    const outputTotal = safeSum(outputs.map(output => output.value));
    const actualFee = inputTotal === null || outputTotal === null ? null : inputTotal - outputTotal;
    if (actualFee === null || actualFee < 0 || actualFee !== intent.networkFeeSats) {
      blockers.push('the actual miner fee differs from the exact-offer claim');
    }
  }

  const allProblems = [...retry, ...blockers];
  const status = blockers.length > 0
    ? 'blocked'
    : retry.length > 0
      ? 'retry'
      : authorizing
        ? 'caution'
        : 'proved';
  const fundingOutpoint = intent.bitcoinInvalidation.outpoint;
  return {
    status,
    family: intent.action,
    title: `${authorizing ? 'Authorize' : 'Accept'} ${(intent.priceSats / 100_000_000).toFixed(8)} BTC` +
      ` for ${provedQuantity ? `${provedQuantity} ` : ''}${claim.asset}`,
    facts: [
      { label: 'Offer price', value: `${intent.priceSats.toLocaleString()} sats` },
      { label: 'Seller receives', value: `${intent.sellerProceedsSats.toLocaleString()} sats` },
      { label: 'Delivery', value: `Detached to ${intent.delivery.address}` },
      { label: 'Funding slot', value: `${fundingOutpoint.txid}:${fundingOutpoint.vout}` },
      {
        label: 'Marketplace expiry',
        value: new Date(intent.marketplaceExpiresAt * 1000).toLocaleString(),
      },
      { label: 'Bitcoin expiry', value: 'None — cancel by spending the funding UTXO' },
    ],
    notices: allProblems.length > 0
      ? []
      : [{
          severity: authorizing ? 'warning' : 'info',
          message: authorizing
            ? 'After signing, this seller can complete this exact trade without another approval. Other exact offers backed by the same funding slot are alternatives: the first confirmed spend wins and invalidates its siblings.'
            : 'Your signature completes this exact sale without a buyer callback. If the buyer already spent this shared funding slot, broadcast fails and your asset remains yours.',
        }],
    blockers: allProblems,
  };
}

/** Prove a clean-BTC parent that creates same-owner attach funding slots. */
function analyzePrepareBulkFanoutIntent(
  input: MarketplaceAnalysisInput,
  intent: PrepareBulkFanoutIntentClaim,
): MarketplaceApprovalReview {
  const {
    inputs,
    outputs,
    signedInputs,
    signerAddresses,
    attachedAssets,
    hasCounterpartyPayload,
    transactionId,
  } = input;
  const blockers: string[] = [];
  const retry: string[] = [];

  if (!transactionId) {
    retry.push('the wallet could not establish the fan-out transaction id');
  } else if (transactionId.toLowerCase() !== intent.expectedTxid) {
    blockers.push('the fan-out transaction id differs from the claim');
  }
  if (hasCounterpartyPayload) {
    blockers.push('a funding fan-out must not carry a Counterparty payload');
  }
  if (inputs.length !== 1) {
    blockers.push(`expected exactly one fan-out funding input, got ${inputs.length}`);
  }
  if (
    signedInputs.length !== 1
    || signedInputs[0]?.index !== 0
    || signedInputs[0]?.sighashType !== 0x01
  ) {
    blockers.push('the wallet must sign only fan-out input 0 with ALL (0x01)');
  }
  if (signerAddresses.length !== 1 || !sameAddress(signerAddresses[0], intent.seller)) {
    blockers.push('the requested fan-out signer is not exactly the claimed seller');
  }

  const fundingInput = inputs[0];
  if (!fundingInput) {
    blockers.push('the fan-out funding input is missing');
  } else {
    if (!sameOutpoint(fundingInput, intent.fundingOutpoint)) {
      blockers.push('the fan-out input differs from the claimed funding outpoint');
    }
    if (!sameAddress(fundingInput.address, intent.seller)) {
      blockers.push('the fan-out input is not controlled by the claimed seller');
    }
    if (fundingInput.value === undefined) {
      retry.push('the fan-out input has no authenticated value');
    } else if (fundingInput.value !== intent.fundingValueSats) {
      blockers.push('the fan-out input value differs from the claim');
    }
    if (fundingInput.hasSignatures !== false) {
      blockers.push('the fan-out input must be proven unsigned before approval');
    }
  }

  const fundingAssets = attachedAssets.find(entry => entry.inputIndex === 0);
  if (fundingAssets?.lookupFailed) {
    retry.push('the attached-asset lookup for the fan-out input failed');
  } else if (fundingAssets && fundingAssets.assets.length > 0) {
    blockers.push('the fan-out funding input already carries Counterparty assets');
  }

  const expectedOutputCount = intent.slotCount + (intent.changeSats > 0 ? 1 : 0);
  if (outputs.length !== expectedOutputCount) {
    blockers.push(`expected ${expectedOutputCount} fan-out outputs, got ${outputs.length}`);
  }
  for (let outputIndex = 0; outputIndex < outputs.length; outputIndex += 1) {
    const output = outputs[outputIndex]!;
    const expectedValue = outputIndex < intent.slotCount
      ? intent.slotValueSats
      : intent.changeSats;
    if (output.type === 'op_return' || !sameAddress(output.address, intent.seller)) {
      blockers.push(`fan-out output ${outputIndex} does not return to the seller`);
    }
    if (output.value !== expectedValue) {
      blockers.push(`fan-out output ${outputIndex} value differs from the plan`);
    }
  }

  const slotTotal = safeSum(Array.from({ length: intent.slotCount }, () => intent.slotValueSats));
  const outputTotal = slotTotal === null ? null : safeSum([slotTotal, intent.changeSats]);
  const claimedFee = outputTotal === null ? null : intent.fundingValueSats - outputTotal;
  if (claimedFee === null || claimedFee < 0 || claimedFee !== intent.networkFeeSats) {
    blockers.push('the claimed fan-out fee does not equal funding minus outputs');
  }
  if (fundingInput?.value !== undefined) {
    const actualOutputTotal = safeSum(outputs.map(output => output.value));
    const actualFee = actualOutputTotal === null ? null : fundingInput.value - actualOutputTotal;
    if (actualFee === null || actualFee < 0 || actualFee !== intent.networkFeeSats) {
      blockers.push('the actual fan-out fee differs from the claim');
    }
  }

  const allProblems = [...retry, ...blockers];
  return {
    status: blockers.length > 0 ? 'blocked' : retry.length > 0 ? 'retry' : 'proved',
    family: 'prepare_bulk_fanout',
    title: `Prepare ${intent.slotCount} listing funding slot${intent.slotCount === 1 ? '' : 's'}`,
    facts: [
      { label: 'Funding input', value: `${intent.fundingValueSats.toLocaleString()} sats` },
      {
        label: 'Attach slots',
        value: `${intent.slotCount} × ${intent.slotValueSats.toLocaleString()} sats`,
      },
      { label: 'Change', value: `${intent.changeSats.toLocaleString()} sats` },
      { label: 'Network fee', value: `${intent.networkFeeSats.toLocaleString()} sats` },
      {
        label: 'Operation expiry',
        value: new Date(intent.operationExpiresAt * 1000).toLocaleString(),
      },
    ],
    notices: allProblems.length > 0
      ? []
      : [{
          severity: 'info',
          message:
            'Every output remains controlled by this wallet. These plain-Bitcoin slots fund later Counterparty attach transactions; no asset moves in this phase.',
        }],
    blockers: allProblems,
  };
}

export function analyzeMarketplaceIntent(input: MarketplaceAnalysisInput): MarketplaceApprovalReview {
  switch (input.intent.action) {
    case 'attach_for_listing':
      return analyzeAttachForListingIntent(input, input.intent);
    case 'buy_listings':
      return analyzeBuyListingsIntent(input, input.intent);
    case 'create_listing':
      return analyzeCreateListingIntent(input, input.intent);
    case 'authorize_exact_offer':
    case 'accept_exact_offer':
      return analyzeExactOfferIntent(input, input.intent);
    case 'prepare_bulk_fanout':
      return analyzePrepareBulkFanoutIntent(input, input.intent);
  }
}
