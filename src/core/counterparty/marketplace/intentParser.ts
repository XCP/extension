/** Bound and copy each v1 marketplace intent claim. The result remains untrusted until analyzed. */

import { MAX_ASSET_LOOKUP_INPUTS } from '@/core/counterparty/inputAssetLimits';
import {
  type AcceptPolicyOfferIntentClaim,
  type AttachForListingIntentClaim,
  type BuyListingsIntentClaim,
  type CreateListingIntentClaim,
  type ExactOfferIntentBase,
  type FundOffersIntentClaim,
  type FundOffersTargetClaim,
  type FundPolicyOfferAlternativeClaim,
  type FundPolicyOfferIntentClaim,
  MARKETPLACE_INTENT_STANDARD,
  MARKETPLACE_INTENT_VERSION,
  type MarketplaceIntentClaimV1,
  type PrepareAssetIntentClaim,
  type PrepareBulkFanoutIntentClaim,
} from '@/core/counterparty/marketplace/intentTypes';
import {
  asset,
  assetWithoutOutpoint,
  boundedString,
  evenHex,
  hex32,
  isRecord,
  nonNegativeRawInteger,
  nonNegativeSafeInteger,
  outpoint,
  plainDisplayText,
  safeInteger,
  settlementDelivery,
} from '@/core/counterparty/marketplace/wire';
import {
  type CanonicalPolicy,
  MAX_POLICY_ALTERNATIVES,
  MAX_POLICY_PARENT_FUNDING_INPUTS,
  PLATFORM_FEE_BPS,
  PLATFORM_FEE_MIN_SATS,
  POLICY_ANCHOR_SATS,
  POLICY_OFFER_PROTOCOL_VERSION,
  validateCanonicalPolicy,
} from '@/core/counterparty/policyOffer';
import { validateAssetName } from '@/core/validation/asset';

const parseListingContext = (
  value: unknown,
): Pick<CreateListingIntentClaim, 'listingContext'> => {
  if (value === undefined) return {};
  if (!isRecord(value) || value.mode !== 'reprice') {
    throw new Error('listingContext must describe a reprice');
  }
  return {
    listingContext: {
      mode: 'reprice',
    },
  };
};

/** Bound and copy the v1 wire claim. The result remains untrusted until analyzed. */
export function parseMarketplaceIntent(value: unknown): MarketplaceIntentClaimV1 {
  if (!isRecord(value)) throw new Error('marketplace intent must be an object');
  if (value.standard !== MARKETPLACE_INTENT_STANDARD || value.version !== 1) {
    throw new Error(`marketplace intent must use ${MARKETPLACE_INTENT_STANDARD} version 1`);
  }
  if (value.action === 'attach_for_listing') return parseAttachForListingIntent(value);
  if (value.action === 'prepare_asset') return parsePrepareAssetIntent(value);
  if (value.action === 'prepare_bulk_fanout') return parsePrepareBulkFanoutIntent(value);
  if (value.action === 'fund_offers') return parseFundOffersIntent(value);
  if (value.action === 'fund_policy_offer') return parseFundPolicyOfferIntent(value);
  if (value.action === 'accept_policy_offer') return parseAcceptPolicyOfferIntent(value);
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
    utxoValueSats: safeInteger(value.utxoValueSats, 'utxoValueSats', { positive: true })!,
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
    ...parseListingContext(value.listingContext),
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

const MAX_FUND_OFFER_SLOTS = 20;
/** Every funding input must be proven asset-free, and the approval screen looks up at most
 * MAX_ASSET_LOOKUP_INPUTS of them: a larger claim could only ever sit in "Retry". */
const MAX_FUND_OFFER_INPUTS = MAX_ASSET_LOOKUP_INPUTS;



const fundOffersTarget = (value: unknown): FundOffersTargetClaim => {
  if (!isRecord(value)) throw new Error('target must be an object');
  if (value.scope === 'asset') {
    // Shown bare in the headline, so it must be a real Counterparty asset name: a named or
    // numeric (A-prefixed) asset, or a subasset longname.
    const name = boundedString(value.asset, 'target.asset', 250);
    if (!validateAssetName(name, name.includes('.')).isValid) {
      throw new Error('target.asset must be a Counterparty asset name');
    }
    return { scope: 'asset', asset: name };
  }
  if (value.scope === 'collection') {
    return {
      scope: 'collection',
      collection: plainDisplayText(value.collection, 'target.collection', 120),
      ...(value.policy === undefined ? {} : { policy: plainDisplayText(value.policy, 'target.policy', 200) }),
    };
  }
  throw new Error('target.scope must be asset or collection');
};

const parseFundOffersIntent = (value: Record<string, unknown>): FundOffersIntentClaim => {
  if (value.protocolVersion !== 'exact_offer_v1') {
    throw new Error('fund_offers intent has the wrong protocolVersion');
  }
  if (!Array.isArray(value.assets) || value.assets.length !== 0) {
    throw new Error('fund_offers must not claim attached assets');
  }
  const expectedTxid = boundedString(value.expectedTxid, 'expectedTxid', 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedTxid)) {
    throw new Error('expectedTxid must be 32-byte hex');
  }
  const slotCount = safeInteger(value.slotCount, 'slotCount', { positive: true });
  if (slotCount === null || slotCount > MAX_FUND_OFFER_SLOTS) {
    throw new Error(`slotCount must be 1..${MAX_FUND_OFFER_SLOTS}`);
  }
  if (
    !Array.isArray(value.fundingInputs)
    || value.fundingInputs.length < 1
    || value.fundingInputs.length > MAX_FUND_OFFER_INPUTS
  ) {
    throw new Error(`fundingInputs must list 1..${MAX_FUND_OFFER_INPUTS} outpoints`);
  }
  const seenOutpoints = new Set<string>();
  const fundingInputs = value.fundingInputs.map((candidate, index) => {
    const label = `fundingInputs[${index}]`;
    if (!isRecord(candidate)) throw new Error(`${label} must be an object`);
    const claimed = outpoint(candidate, label);
    const key = `${claimed.txid}:${claimed.vout}`;
    if (seenOutpoints.has(key)) throw new Error(`${label} repeats outpoint ${key}`);
    seenOutpoints.add(key);
    return {
      ...claimed,
      valueSats: safeInteger(candidate.valueSats, `${label}.valueSats`, { positive: true })!,
    };
  });
  if (!isRecord(value.delivery)) throw new Error('delivery must be an object');
  let delivery: FundOffersIntentClaim['delivery'];
  if (value.delivery.mode === 'detached') {
    delivery = { mode: 'detached' };
  } else if (value.delivery.mode === 'attached') {
    delivery = {
      mode: 'attached',
      utxoValueSats: safeInteger(value.delivery.utxoValueSats, 'delivery.utxoValueSats', {
        positive: true,
      })!,
    };
  } else {
    throw new Error('delivery.mode must be detached or attached');
  }
  return {
    standard: MARKETPLACE_INTENT_STANDARD,
    version: MARKETPLACE_INTENT_VERSION,
    action: 'fund_offers',
    operationId: boundedString(value.operationId, 'operationId'),
    protocolVersion: 'exact_offer_v1',
    assets: [],
    bidder: boundedString(value.bidder, 'bidder', 128),
    target: fundOffersTarget(value.target),
    priceSats: safeInteger(value.priceSats, 'priceSats', { positive: true })!,
    platformFeeSats: nonNegativeSafeInteger(value.platformFeeSats, 'platformFeeSats'),
    delivery,
    fundingInputs,
    fundingValueSats: safeInteger(value.fundingValueSats, 'fundingValueSats', { positive: true })!,
    slotCount,
    slotValueSats: safeInteger(value.slotValueSats, 'slotValueSats', { positive: true })!,
    networkFeeSats: nonNegativeSafeInteger(value.networkFeeSats, 'networkFeeSats'),
    changeSats: nonNegativeSafeInteger(value.changeSats, 'changeSats'),
    expectedTxid,
    marketplaceExpiresAt: safeInteger(value.marketplaceExpiresAt, 'marketplaceExpiresAt', {
      positive: true,
    })!,
  };
};



const policyDetachedDelivery = (value: unknown): { mode: 'detached'; address: string } => {
  if (!isRecord(value)) throw new Error('delivery must be an object');
  if (value.mode === 'attached') {
    throw new Error('attached delivery is not enabled in funded_policy_offer_v1');
  }
  if (value.mode !== 'detached') throw new Error('delivery.mode must be detached');
  return { mode: 'detached', address: boundedString(value.address, 'delivery.address', 128) };
};

const parseFundPolicyOfferAlternative = (
  value: unknown,
  index: number,
): FundPolicyOfferAlternativeClaim => {
  const label = `alternatives[${index}]`;
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  let policy: CanonicalPolicy;
  try {
    policy = validateCanonicalPolicy(value.policy);
  } catch (error) {
    throw new Error(`${label}.${error instanceof Error ? error.message : 'policy is invalid'}`);
  }
  return {
    expectedParentTxid: hex32(value.expectedParentTxid, `${label}.expectedParentTxid`),
    priceSats: safeInteger(value.priceSats, `${label}.priceSats`, { positive: true })!,
    offerValueSats: safeInteger(value.offerValueSats, `${label}.offerValueSats`, { positive: true })!,
    expiresAt: safeInteger(value.expiresAt, `${label}.expiresAt`, { positive: true })!,
    policy,
    policyHash: hex32(value.policyHash, `${label}.policyHash`),
    // 114 bytes of envelope plus a detach address of at most 71 bytes.
    leafHex: evenHex(value.leafHex, `${label}.leafHex`, 185),
    offerScriptPubKey: evenHex(value.offerScriptPubKey, `${label}.offerScriptPubKey`, 34),
    parentVsize: safeInteger(value.parentVsize, `${label}.parentVsize`, { positive: true })!,
    changeSats: nonNegativeSafeInteger(value.changeSats, `${label}.changeSats`),
    parentFeeSats: nonNegativeSafeInteger(value.parentFeeSats, `${label}.parentFeeSats`),
    ...(value.detachScriptHex === undefined
      ? {}
      : { detachScriptHex: evenHex(value.detachScriptHex, `${label}.detachScriptHex`, 83) }),
  };
};

const parseFundPolicyOfferIntent = (value: Record<string, unknown>): FundPolicyOfferIntentClaim => {
  if (value.protocolVersion !== POLICY_OFFER_PROTOCOL_VERSION) {
    throw new Error('fund_policy_offer intent has the wrong protocolVersion');
  }
  if (!Array.isArray(value.assets) || value.assets.length !== 0) {
    throw new Error('fund_policy_offer must not claim attached assets');
  }
  if (
    !Array.isArray(value.alternatives)
    || value.alternatives.length < 1
    || value.alternatives.length > MAX_POLICY_ALTERNATIVES
  ) {
    throw new Error(`fund_policy_offer carries 1..${MAX_POLICY_ALTERNATIVES} alternatives`);
  }
  if (
    !Array.isArray(value.fundingInputs)
    || value.fundingInputs.length < 1
    || value.fundingInputs.length > MAX_POLICY_PARENT_FUNDING_INPUTS
  ) {
    throw new Error(`fundingInputs must list 1..${MAX_POLICY_PARENT_FUNDING_INPUTS} outpoints`);
  }
  const seenOutpoints = new Set<string>();
  const fundingInputs = value.fundingInputs.map((candidate, index) => {
    const label = `fundingInputs[${index}]`;
    if (!isRecord(candidate)) throw new Error(`${label} must be an object`);
    const claimed = outpoint(candidate, label);
    const key = `${claimed.txid}:${claimed.vout}`;
    if (seenOutpoints.has(key)) throw new Error(`${label} repeats outpoint ${key}`);
    seenOutpoints.add(key);
    return { ...claimed, valueSats: safeInteger(candidate.valueSats, `${label}.valueSats`, { positive: true })! };
  });
  if (!isRecord(value.anchor)) throw new Error('anchor must be an object');
  const anchorOutpoint = outpoint(value.anchor, 'anchor');
  if (seenOutpoints.has(`${anchorOutpoint.txid}:${anchorOutpoint.vout}`)) {
    throw new Error('anchor repeats a funding outpoint');
  }
  if (value.anchor.valueSats !== POLICY_ANCHOR_SATS) {
    throw new Error(`anchor.valueSats must be ${POLICY_ANCHOR_SATS}`);
  }
  if (
    !isRecord(value.marketplaceFee)
    || value.marketplaceFee.payer !== 'seller'
    || value.marketplaceFee.bps !== PLATFORM_FEE_BPS
    || value.marketplaceFee.minSats !== PLATFORM_FEE_MIN_SATS
  ) {
    throw new Error('marketplaceFee must be the published seller-paid 250 bps, 1,000-sat minimum');
  }
  const alternatives = value.alternatives.map(parseFundPolicyOfferAlternative);
  if (new Set(alternatives.map(alternative => alternative.expectedParentTxid)).size !== alternatives.length) {
    throw new Error('fund_policy_offer alternatives repeat a parent transaction');
  }
  return {
    standard: MARKETPLACE_INTENT_STANDARD,
    version: MARKETPLACE_INTENT_VERSION,
    action: 'fund_policy_offer',
    protocolVersion: POLICY_OFFER_PROTOCOL_VERSION,
    operationId: boundedString(value.operationId, 'operationId'),
    assets: [],
    bidder: boundedString(value.bidder, 'bidder', 128),
    internalKey: hex32(value.internalKey, 'internalKey'),
    marketKey: hex32(value.marketKey, 'marketKey'),
    delivery: policyDetachedDelivery(value.delivery),
    fundingInputs,
    anchor: {
      ...anchorOutpoint,
      valueSats: POLICY_ANCHOR_SATS,
      scriptPubKey: evenHex(value.anchor.scriptPubKey, 'anchor.scriptPubKey', 40),
    },
    alternatives,
    marketplaceFee: { payer: 'seller', bps: PLATFORM_FEE_BPS, minSats: PLATFORM_FEE_MIN_SATS },
  };
};

const parseAcceptPolicyOfferIntent = (value: Record<string, unknown>): AcceptPolicyOfferIntentClaim => {
  if (value.protocolVersion !== POLICY_OFFER_PROTOCOL_VERSION) {
    throw new Error('accept_policy_offer intent has the wrong protocolVersion');
  }
  if (!Array.isArray(value.assets) || value.assets.length !== 1) {
    throw new Error('accept_policy_offer intent must claim exactly one asset');
  }
  if (!isRecord(value.offerOutpoint) || value.offerOutpoint.vout !== 0) {
    throw new Error('offerOutpoint must name output 0 of the offer parent');
  }
  if (
    !Array.isArray(value.parentInputValuesSats)
    || value.parentInputValuesSats.length < 2
    || value.parentInputValuesSats.length > MAX_POLICY_PARENT_FUNDING_INPUTS + 1
  ) {
    throw new Error(`parentInputValuesSats must list 2..${MAX_POLICY_PARENT_FUNDING_INPUTS + 1} values`);
  }
  const packageFeeRate = value.packageFeeRate;
  if (typeof packageFeeRate !== 'number' || !Number.isFinite(packageFeeRate) || packageFeeRate <= 0) {
    throw new Error('packageFeeRate must be a positive finite number');
  }
  return {
    standard: MARKETPLACE_INTENT_STANDARD,
    version: MARKETPLACE_INTENT_VERSION,
    action: 'accept_policy_offer',
    protocolVersion: POLICY_OFFER_PROTOCOL_VERSION,
    operationId: boundedString(value.operationId, 'operationId'),
    assets: [asset(value.assets[0], 'assets[0]')],
    offerOutpoint: { parentTxid: hex32(value.offerOutpoint.parentTxid, 'offerOutpoint.parentTxid'), vout: 0 },
    offerValueSats: safeInteger(value.offerValueSats, 'offerValueSats', { positive: true })!,
    priceSats: safeInteger(value.priceSats, 'priceSats', { positive: true })!,
    // A witness-stripped parent within the 1,000 vB cap is far below this bound.
    parentRawHex: evenHex(value.parentRawHex, 'parentRawHex', 4_000),
    parentInputValuesSats: value.parentInputValuesSats.map((entry, index) =>
      safeInteger(entry, `parentInputValuesSats[${index}]`, { positive: true })!),
    parentVsize: safeInteger(value.parentVsize, 'parentVsize', { positive: true })!,
    parentFeeSats: nonNegativeSafeInteger(value.parentFeeSats, 'parentFeeSats'),
    leafHex: evenHex(value.leafHex, 'leafHex', 185),
    internalKey: hex32(value.internalKey, 'internalKey'),
    seller: boundedString(value.seller, 'seller', 128),
    utxoValueSats: safeInteger(value.utxoValueSats, 'utxoValueSats', { positive: true })!,
    delivery: policyDetachedDelivery(value.delivery),
    platformFeeSats: nonNegativeSafeInteger(value.platformFeeSats, 'platformFeeSats'),
    networkFeeSats: nonNegativeSafeInteger(value.networkFeeSats, 'networkFeeSats'),
    packageVsize: safeInteger(value.packageVsize, 'packageVsize', { positive: true })!,
    packageFeeRate,
    sellerProceedsSats: safeInteger(value.sellerProceedsSats, 'sellerProceedsSats', { positive: true })!,
    expectedTxid: hex32(value.expectedTxid, 'expectedTxid'),
  };
};

const parseAttachTransactionClaim = (
  value: Record<string, unknown>,
  action: 'attach_for_listing' | 'prepare_asset',
) => {
  if (!Array.isArray(value.assets) || value.assets.length !== 1) {
    throw new Error(`${action} intent must claim exactly one asset`);
  }
  if (!isRecord(value.protocolFee) || value.protocolFee.asset !== 'XCP') {
    throw new Error(`${action} protocolFee must be denominated in XCP`);
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
  return {
    standard: MARKETPLACE_INTENT_STANDARD,
    version: MARKETPLACE_INTENT_VERSION,
    operationId: boundedString(value.operationId, 'operationId'),
    assets: [assetWithoutOutpoint(value.assets[0], 'assets[0]')] as [
      { asset: string; quantityRaw: string },
    ],
    expectedAttachedOutpoint: outpoint(
      value.expectedAttachedOutpoint,
      'expectedAttachedOutpoint',
    ),
    utxoValueSats: safeInteger(value.utxoValueSats, 'utxoValueSats', {
      positive: true,
    })!,
    networkFeeSats: nonNegativeSafeInteger(value.networkFeeSats, 'networkFeeSats'),
    protocolFee: {
      asset: 'XCP' as const,
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

const parseAttachForListingIntent = (
  value: Record<string, unknown>,
): AttachForListingIntentClaim => {
  if (value.protocolVersion !== 'counterparty_attach_listing_v1') {
    throw new Error('attach_for_listing intent has the wrong protocolVersion');
  }
  const seller = boundedString(value.seller, 'seller', 128);
  return {
    ...parseAttachTransactionClaim(value, 'attach_for_listing'),
    action: 'attach_for_listing',
    protocolVersion: 'counterparty_attach_listing_v1',
    seller,
    assetSource: boundedString(value.assetSource ?? seller, 'assetSource', 128),
    utxoAddress: boundedString(value.utxoAddress, 'utxoAddress', 128),
  };
};

const parsePrepareAssetIntent = (
  value: Record<string, unknown>,
): PrepareAssetIntentClaim => {
  if (value.protocolVersion !== 'counterparty_prepare_assets_v1') {
    throw new Error('prepare_asset intent has the wrong protocolVersion');
  }
  return {
    ...parseAttachTransactionClaim(value, 'prepare_asset'),
    action: 'prepare_asset',
    protocolVersion: 'counterparty_prepare_assets_v1',
    utxoOwner: boundedString(value.utxoOwner, 'utxoOwner', 128),
    assetSource: boundedString(value.assetSource, 'assetSource', 128),
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
  const delivery = settlementDelivery(value.delivery, 'delivery');
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
  const platformFeeSats = value.platformFeeSats === undefined
    ? 0
    : nonNegativeSafeInteger(value.platformFeeSats, 'platformFeeSats');
  const sellerPaidFeeSats = value.sellerPaidFeeSats === undefined
    ? undefined
    : nonNegativeSafeInteger(value.sellerPaidFeeSats, 'sellerPaidFeeSats');
  if (sellerPaidFeeSats !== undefined && sellerPaidFeeSats > platformFeeSats) {
    throw new Error('sellerPaidFeeSats cannot exceed platformFeeSats');
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
    utxoValueSats: safeInteger(value.utxoValueSats, 'utxoValueSats', {
      positive: true,
    })!,
    sellerProceedsSats: safeInteger(value.sellerProceedsSats, 'sellerProceedsSats', {
      positive: true,
    })!,
    networkFeeSats: nonNegativeSafeInteger(value.networkFeeSats, 'networkFeeSats'),
    platformFeeSats,
    ...(sellerPaidFeeSats === undefined ? {} : { sellerPaidFeeSats }),
    expectedTxid,
    delivery,
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
  const delivery = settlementDelivery(value.delivery, 'delivery');
  if (delivery.mode === 'attached' && value.items.length !== 1) {
    throw new Error('buy_listings attached delivery requires exactly one item');
  }

  const items = value.items.map((itemValue, index) => {
    if (!isRecord(itemValue)) throw new Error(`items[${index}] must be an object`);
    return {
      ...asset(itemValue, `items[${index}]`),
      listingId: boundedString(itemValue.listingId, `items[${index}].listingId`),
      seller: boundedString(itemValue.seller, `items[${index}].seller`, 128),
      utxoValueSats: safeInteger(
        itemValue.utxoValueSats,
        `items[${index}].utxoValueSats`,
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
    delivery,
    marketplaceExpiresAt: safeInteger(value.marketplaceExpiresAt, 'marketplaceExpiresAt', {
      positive: true,
    })!,
  };
};
