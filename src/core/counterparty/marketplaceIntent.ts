/**
 * Wallet-side proof for versioned Counterparty marketplace intent claims.
 *
 * An intent is display context from a website, never authority. The parser only bounds its wire
 * shape; the analyzer independently matches every security-relevant term to PSBT bytes, requested
 * signatures, prevouts, and Counterparty UTXO balances.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { decodeAddressFromScript, normalizeAddressForComparison } from '@/core/bitcoin/address';
import type { AttachedAssetDestination } from '@/core/counterparty/attachedAssetMovement';
import type { ProtocolField } from '@/core/counterparty/describe';
import { MAX_ASSET_LOOKUP_INPUTS } from '@/core/counterparty/inputAssetLimits';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';
import type { AttachInputSettlement } from '@/core/counterparty/marketplaceAttachLink';
import {
  type CanonicalPolicy,
  decodePolicyDetachScript,
  decodePolicyLeaf,
  encodePolicyLeaf,
  MAX_POLICY_ALTERNATIVES,
  MAX_POLICY_PARENT_FEE_SATS,
  MAX_POLICY_PARENT_FUNDING_INPUTS,
  MAX_POLICY_PARENT_VSIZE,
  MIN_POLICY_PRICE_SATS,
  PLATFORM_FEE_BPS,
  PLATFORM_FEE_MIN_SATS,
  POLICY_ANCHOR_SATS,
  POLICY_CHANGE_DUST_SATS,
  POLICY_MAX_EXPIRY_SECONDS,
  POLICY_MIN_EXPIRY_SECONDS,
  POLICY_OFFER_LOCKTIME,
  POLICY_OFFER_PROTOCOL_VERSION,
  POLICY_OFFER_SEQUENCE,
  POLICY_OFFER_TX_VERSION,
  POLICY_SELLER_DUST_SATS,
  parseWitnessStrippedParent,
  platformFeeSats,
  policyDetachScriptHex,
  policyHashHex,
  policyInternalKeyAddresses,
  policyOfferTaproot,
  unsignedPolicyParentVsize,
  validateCanonicalPolicy,
} from '@/core/counterparty/policyOffer';
import { PINNED_POLICY_OFFER_MARKET_KEYS, type PinnedPolicyMarketKey } from '@/core/counterparty/policyOfferKeys';
import { displayLocale, formatAmount } from '@/core/format';
import { validateAssetName } from '@/core/validation/asset';
import { t } from '@/i18n';

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

export type MarketplaceSettlementDelivery =
  | { mode: 'detached'; address: string }
  | { mode: 'attached'; address: string; utxoValueSats: number };

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
  utxoAddress: string;
  utxoValueSats: number;
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

export interface PrepareAssetIntentClaim {
  standard: typeof MARKETPLACE_INTENT_STANDARD;
  version: typeof MARKETPLACE_INTENT_VERSION;
  action: 'prepare_asset';
  operationId: string;
  protocolVersion: 'counterparty_prepare_assets_v1';
  assets: [{ asset: string; quantityRaw: string }];
  utxoOwner: string;
  assetSource: string;
  expectedAttachedOutpoint: MarketplaceOutpointClaim;
  utxoValueSats: number;
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
  utxoValueSats: number;
  guaranteedSellerPaymentSats: number;
  delivery: { mode: 'buyer_selected_detach' };
  signingRequestExpiresAt: number;
  marketplaceExpiresAt: number | null;
  bitcoinExpiresAt: null;
  listingContext?: {
    mode: 'reprice';
  };
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
    utxoValueSats: number;
    priceSats: number;
    sellerPaymentSats: number;
  }>;
  subtotalSats: number;
  networkFeeSats: number;
  platformFeeSats: number;
  totalSats: number;
  expectedTxid: string;
  delivery: MarketplaceSettlementDelivery;
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
  utxoValueSats: number;
  sellerProceedsSats: number;
  networkFeeSats: number;
  /** The marketplace fee output. Omitted pre-fee v1 requests parse as zero. */
  platformFeeSats: number;
  /**
   * The part of that fee the seller pays out of their proceeds (the marketplace charges the taker,
   * and accepting an offer takes it). `priceSats` is then the price the seller is paid after it,
   * which keeps every equation below exact; the offer as the bidder made it is
   * `priceSats + sellerPaidFeeSats`. Display only, and optional: builds that predate it ignore it,
   * and an absent value means the bidder funded the whole fee.
   */
  sellerPaidFeeSats?: number;
  expectedTxid: string;
  delivery: MarketplaceSettlementDelivery;
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

/** What an offer is for. Display context only: the funding transaction commits to no target;
 * the separate exact-offer authorization binds each concrete outpoint. */
export type FundOffersTargetClaim =
  | { scope: 'asset'; asset: string }
  | { scope: 'collection'; collection: string; policy?: string };

/** A clean-BTC self-send that sets aside `slotCount` exact offer-backing outputs. Each slot is
 * worth price + platform fee (+ the attached-delivery UTXO), all paid back to the bidder. */
export interface FundOffersIntentClaim {
  standard: typeof MARKETPLACE_INTENT_STANDARD;
  version: typeof MARKETPLACE_INTENT_VERSION;
  action: 'fund_offers';
  operationId: string;
  protocolVersion: 'exact_offer_v1';
  assets: [];
  bidder: string;
  target: FundOffersTargetClaim;
  priceSats: number;
  platformFeeSats: number;
  delivery: { mode: 'detached' } | { mode: 'attached'; utxoValueSats: number };
  fundingInputs: Array<MarketplaceOutpointClaim & { valueSats: number }>;
  fundingValueSats: number;
  slotCount: number;
  slotValueSats: number;
  networkFeeSats: number;
  changeSats: number;
  expectedTxid: string;
  marketplaceExpiresAt: number;
}

/** One alternative parent in a policy-offer funding set. Every one spends the same inputs. */
export interface FundPolicyOfferAlternativeClaim {
  expectedParentTxid: string;
  priceSats: number;
  offerValueSats: number;
  expiresAt: number;
  policy: CanonicalPolicy;
  policyHash: string;
  leafHex: string;
  offerScriptPubKey: string;
  parentVsize: number;
  /** Per alternative: prices differ, so change and the folded sub-dust fee may too. */
  changeSats: number;
  parentFeeSats: number;
  /** Detached only; the wallet recomputes it from the parent txid. */
  detachScriptHex?: string;
}

/**
 * `funded_policy_offer_v1` bidder funding (spec §11.1): one zero-fee version-3 parent per
 * alternative, each moving the bidder's funding inputs into an offer output that only the pinned
 * market key (or the bidder's own key path) can spend. Never relayed alone.
 */
export interface FundPolicyOfferIntentClaim {
  standard: typeof MARKETPLACE_INTENT_STANDARD;
  version: typeof MARKETPLACE_INTENT_VERSION;
  action: 'fund_policy_offer';
  protocolVersion: typeof POLICY_OFFER_PROTOCOL_VERSION;
  operationId: string;
  assets: [];
  /** Signing address, P2TR or P2WPKH. */
  bidder: string;
  /** x-only K_b. */
  internalKey: string;
  /** x-only K_m; must be in the wallet's pinned set. */
  marketKey: string;
  /** v1 enables only detached delivery; an attached claim is refused when parsed. */
  delivery: { mode: 'detached'; address: string };
  fundingInputs: Array<MarketplaceOutpointClaim & { valueSats: number }>;
  anchor: MarketplaceOutpointClaim & { valueSats: typeof POLICY_ANCHOR_SATS; scriptPubKey: string };
  alternatives: FundPolicyOfferAlternativeClaim[];
  marketplaceFee: { payer: 'seller'; bps: typeof PLATFORM_FEE_BPS; minSats: typeof PLATFORM_FEE_MIN_SATS };
}

/** `funded_policy_offer_v1` seller acceptance (spec §11.2): the wallet signs child input 1 only. */
export interface AcceptPolicyOfferIntentClaim {
  standard: typeof MARKETPLACE_INTENT_STANDARD;
  version: typeof MARKETPLACE_INTENT_VERSION;
  action: 'accept_policy_offer';
  protocolVersion: typeof POLICY_OFFER_PROTOCOL_VERSION;
  operationId: string;
  assets: [MarketplaceAssetClaim];
  offerOutpoint: { parentTxid: string; vout: 0 };
  offerValueSats: number;
  priceSats: number;
  /** The parent without witnesses: holding the bidder-signed bytes would let a seller mine it alone. */
  parentRawHex: string;
  /** Parent input values in input order; the parent fee cannot be proven from the raw bytes alone. */
  parentInputValuesSats: number[];
  parentVsize: number;
  parentFeeSats: number;
  leafHex: string;
  internalKey: string;
  seller: string;
  utxoValueSats: number;
  delivery: { mode: 'detached'; address: string };
  platformFeeSats: number;
  networkFeeSats: number;
  packageVsize: number;
  packageFeeRate: number;
  sellerProceedsSats: number;
  expectedTxid: string;
}

export type MarketplaceIntentClaimV1 =
  | AttachForListingIntentClaim
  | PrepareAssetIntentClaim
  | CreateListingIntentClaim
  | BuyListingsIntentClaim
  | AuthorizeExactOfferIntentClaim
  | AcceptExactOfferIntentClaim
  | PrepareBulkFanoutIntentClaim
  | FundOffersIntentClaim
  | FundPolicyOfferIntentClaim
  | AcceptPolicyOfferIntentClaim;

export interface MarketplaceApprovalReview {
  /** Optional concise action summary, separate from the full transaction description. */
  summary?: { label: string; description: string };
  /** Role-specific payment facts, emitted only after the transaction's economics prove.
   * These replace the generic all-parties BTC movement on the decision screen. */
  paymentSummary?: ProtocolField[];
  status: 'proved' | 'caution' | 'retry' | 'blocked';
  family:
    | 'attach_for_listing'
    | 'prepare_asset'
    | 'create_listing'
    | 'buy_listings'
    | 'authorize_exact_offer'
    | 'accept_exact_offer'
    | 'accept_exact_offer_with_cpfp'
    | 'prepare_bulk_fanout'
    | 'fund_offers'
    | 'fund_policy_offer'
    | 'accept_policy_offer'
    | 'marketplace_batch';
  title: string;
  facts: ProtocolField[];
  notices: Array<{ severity: 'info' | 'warning' | 'danger'; message: string }>;
  blockers: string[];
  /**
   * Why a `blocked` review is blocked, when that is narrower than "the transaction contradicts the
   * site's claim": `ledger` when every blocker is the ledger no longer matching the claimed asset
   * (the listing sold or moved), `input_limit` when the transaction has more inputs than the
   * wallet checks. Presentation only; any blocked review refuses signing the same way.
   */
  blockKind?: 'ledger' | 'input_limit';
}

interface InputLike {
  index: number;
  txid: string;
  vout: number;
  address?: string;
  value?: number;
  hasSignatures?: boolean;
  /** nSequence, where the caller decoded it. */
  sequence?: number;
  /** Script type of the spent prevout, where the caller decoded it. */
  scriptType?: string;
}

interface OutputLike {
  index: number;
  type: string;
  address?: string;
  value: number;
  /** scriptPubKey hex, where the caller decoded it. */
  script?: string;
}

/**
 * Wallet-side facts a policy offer is proved against. Supplied only by wallet code, never by the
 * requesting site: the pinned market keys are compiled in, the clock is the wallet's, and the
 * funding settlement is the wallet's own chain and ledger read (`proveAttachInputsSettled`).
 */
export interface PolicyOfferWalletContext {
  pinnedMarketKeys?: readonly PinnedPolicyMarketKey[];
  /** Unix seconds. */
  nowSeconds?: number;
  /** Every funding input confirmed, indexed, and asset-free; absent means not proven. */
  fundingSettlement?: AttachInputSettlement;
}

export interface MarketplaceAnalysisInput {
  intent: MarketplaceIntentClaimV1;
  inputs: InputLike[];
  outputs: OutputLike[];
  signedInputs: Array<{ index: number; sighashType: number }>;
  signerAddresses: string[];
  /** Background-derived wallet addresses, including paired recipients that need not sign. */
  ownedAddresses?: string[];
  attachedAssets: InputAttachedAssets[];
  attachedAssetDestination: AttachedAssetDestination | null;
  hasCounterpartyPayload: boolean;
  transactionId?: string;
  localCounterpartyMessage?: { messageType: string; data: unknown };
  /** Bitcoin transaction header, decoded from the PSBT. */
  transactionVersion?: number;
  lockTime?: number;
  policyOffer?: PolicyOfferWalletContext;
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
  // A TRUC (BIP431) parent and child: a v2 child of the v3 parent is refused by every node.
  if (
    intent.protocolVersion === POLICY_OFFER_PROTOCOL_VERSION
    && (transactionVersion !== POLICY_OFFER_TX_VERSION || lockTime !== POLICY_OFFER_LOCKTIME)
  ) {
    return 'funded_policy_offer_v1 requires Bitcoin transaction version 3 with locktime 0';
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

const settlementDelivery = (value: unknown, label: string): MarketplaceSettlementDelivery => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const address = boundedString(value.address, `${label}.address`, 128);
  if (value.mode === 'detached') return { mode: 'detached', address };
  if (value.mode === 'attached') {
    return {
      mode: 'attached',
      address,
      utxoValueSats: safeInteger(
        value.utxoValueSats,
        `${label}.utxoValueSats`,
        { positive: true },
      )!,
    };
  }
  throw new Error(`${label}.mode must be detached or attached`);
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

/**
 * Website-supplied display text reduced to one plain line: control and format characters (bidi
 * overrides and isolates, zero-width joiners, BOMs) are dropped, and any run of whitespace becomes
 * one space. Rejects text that is empty once cleaned.
 */
const plainDisplayText = (value: unknown, label: string, max: number): string => {
  const cleaned = boundedString(value, label, max)
    .replace(/\p{Cf}/gu, '')
    .replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, ' ')
    .trim();
  if (cleaned.length === 0) throw new Error(`${label} must contain visible text`);
  return cleaned;
};

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

const hex32 = (value: unknown, label: string): string => {
  const parsed = boundedString(value, label, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(parsed)) throw new Error(`${label} must be 32-byte hex`);
  return parsed;
};

const evenHex = (value: unknown, label: string, maxBytes: number): string => {
  const parsed = boundedString(value, label, maxBytes * 2).toLowerCase();
  if (!/^(?:[0-9a-f]{2})+$/.test(parsed)) throw new Error(`${label} must be even-length hex`);
  return parsed;
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

const sameAddress = (left: string | undefined, right: string) =>
  left !== undefined
  && normalizeAddressForComparison(left) === normalizeAddressForComparison(right);

/** Prove the seller's flexible listing authorization from independent transaction facts. */
/** A block whose every reason is the ledger disagreeing with the claimed asset: the listing changed. */
const ledgerBlockKind = (blockers: string[], ledger: ReadonlySet<string>): { blockKind?: 'ledger' } =>
  blockers.length > 0 && blockers.every(problem => ledger.has(problem)) ? { blockKind: 'ledger' } : {};

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
  const ledger = new Set<string>();
  const ledgerBlock = (problem: string) => { ledger.add(problem); blockers.push(problem); };
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
    if (sellerInput.value !== intent.utxoValueSats) {
      blockers.push('the seller input UTXO value differs from the claim');
    }
  }

  if (intent.guaranteedSellerPaymentSats !== intent.utxoValueSats + intent.priceSats) {
    blockers.push('the claimed seller payment does not equal the asset UTXO value plus the price');
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
    ledgerBlock('seller input 1 does not independently resolve to exactly one attached asset');
  } else {
    const actual = balance.assets[0]!;
    if (actual.asset !== claim.asset) ledgerBlock('attached asset name differs from the claim');
    if (actual.quantity === undefined) {
      retry.push('the indexer did not return an exact raw attached quantity');
    } else if (actual.quantity !== claim.quantityRaw) {
      ledgerBlock('attached asset raw quantity differs from the claim');
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
    // Without exactly one attached asset on the ledger there is nothing whose delivery can prove.
    const problem = 'listing signature does not prove the expected buyer-selected delivery flexibility';
    if (!balance || balance.assets.length !== 1) ledgerBlock(problem);
    else blockers.push(problem);
  }

  const allProblems = [...retry, ...blockers];
  const status = blockers.length > 0 ? 'blocked' : retry.length > 0 ? 'retry' : 'proved';
  const payout: ProtocolField = {
    kind: 'amount', label: t('marketplace_intent_your_payout_if_sold'),
    value: satsValue(intent.guaranteedSellerPaymentSats), emphasis: 'primary',
  };
  const salePrice: ProtocolField = { kind: 'amount', label: t('marketplace_intent_sale_price'), value: satsValue(intent.priceSats) };
  const utxoReturn: ProtocolField = {
    kind: 'amount', label: t('marketplace_intent_utxo_returned'), value: satsValue(intent.utxoValueSats),
  };
  const repricing = intent.listingContext?.mode === 'reprice';
  return {
    status,
    family: 'create_listing',
    ...ledgerBlockKind(blockers, ledger),
    ...(status === 'proved' ? { paymentSummary: [payout, salePrice, utxoReturn] } : {}),
    ...(status === 'proved' && provedQuantity !== null ? {
      summary: {
        label: repricing
          ? t('marketplace_intent_reprice_listing')
          : t('marketplace_intent_list_for_sale'),
        description: `${provedQuantity} ${claim.asset}`,
      },
    } : {}),
    title: repricing
      ? t('marketplace_intent_title_reprice_asset_to_price', [claim.asset, satsValue(intent.priceSats)])
      : t('marketplace_intent_title_list_asset_for_price', [claim.asset, satsValue(intent.priceSats)]),
    facts: [
      payout, salePrice, utxoReturn,
      // The headline already names the proved quantity and asset.
      {
        kind: 'paragraph' as const, label: t('marketplace_intent_delivery'),
        value: t('marketplace_intent_buyer_chooses_attached_or_detached_delivery'),
      },
      // The signature commits only the seller-payment output; state who controls the rest.
      {
        kind: 'paragraph' as const, label: t('marketplace_intent_buyer_controls'),
        value: t('marketplace_intent_funding_fees_and_delivery_destination'),
      },
      {
        kind: 'text' as const, label: t('marketplace_intent_broadcast'),
        value: t('marketplace_intent_not_now'),
      },
      {
        kind: 'date' as const, label: t('marketplace_intent_expires'),
        value: intent.marketplaceExpiresAt === null
          ? t('marketplace_intent_none_requested')
          : formatExpiry(intent.marketplaceExpiresAt),
      },
      {
        kind: 'paragraph' as const, label: t('marketplace_intent_marketplace_cancellation'),
        value: t('marketplace_intent_delist_without_a_transaction'),
      },
      {
        kind: 'paragraph' as const, label: t('marketplace_intent_signature_invalidation'),
        value: t('marketplace_intent_spend_the_asset_utxo'),
      },
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

/**
 * A whole count — sats, UTXOs, items — in the language the wallet is reading in.
 *
 * `Number.prototype.toLocaleString()` with no argument follows the browser's REGIONAL FORMAT,
 * which is a different setting from the UI LANGUAGE these labels are drawn from. A reader can
 * have the two disagree. `formatAmount` follows the language, so the digits and the words around
 * them always come from one choice.
 */
const grouped = (value: number): string => formatAmount({ value, maximumFractionDigits: 0 });

/** A satoshi amount with its unit. `sats` is a ticker, not a word to translate. */
const satsValue = (value: number): string => `${grouped(value)} sats`;

const formatXcpRaw = (raw: string): string => {
  const amount = BigInt(raw);
  const whole = amount / 100_000_000n;
  const fraction = (amount % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction} XCP` : `${whole} XCP`;
};

/** Expiry timestamps share rows with their labels; seconds-precision wraps them into a third line. */
export function formatExpiry(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(displayLocale(), {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/** Prove a full-input ALL-signed attach that creates one exact one-unit asset UTXO. */
function analyzeAttachIntent(
  input: MarketplaceAnalysisInput,
  intent: AttachForListingIntentClaim | PrepareAssetIntentClaim,
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
  const preparing = intent.action === 'prepare_asset';
  const utxoOwner = preparing ? intent.utxoOwner : intent.seller;
  const utxoAddress = preparing ? intent.utxoOwner : intent.utxoAddress;
  // A request can already be persisted when the extension updates. Those older
  // same-address v1 records bypass the wire parser, so retain its compatibility default here.
  const assetSource = intent.assetSource ?? utxoOwner;
  if (!(input.ownedAddresses ?? signerAddresses).some(address => sameAddress(address, utxoOwner))) {
    blockers.push('the new asset UTXO must belong to this wallet; use an asset transfer to send it to someone else');
  }

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
  if (!sameAddress(utxoAddress, utxoOwner)) {
    blockers.push('the attach destination address differs from the claimed asset UTXO owner');
  }
  if (!target) {
    blockers.push('the claimed new attached UTXO is missing');
  } else {
    if (!sameAddress(target.address, utxoAddress)) {
      blockers.push('the new attached UTXO is not controlled by the claimed owner');
    }
    if (target.value !== intent.utxoValueSats) {
      blockers.push('the new attached UTXO value differs from the claim');
    }
    if (target.type === 'op_return') {
      blockers.push('the attach destination cannot be an OP_RETURN output');
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
    family: preparing ? 'prepare_asset' : 'attach_for_listing',
    // The standard attach screen already states the asset, amount, network fee, and the created
    // outpoint — these facts carry only what is marketplace-specific, so the merged details list
    // says each thing once.
    title: preparing
      ? t('marketplace_intent_title_prepare_asset', claim.asset)
      : t('marketplace_intent_title_attach_asset_for_listing', claim.asset),
    facts: [
      ...(!sameAddress(assetSource, utxoOwner) ? [
        { kind: 'address' as const, label: t('marketplace_intent_asset_source'), value: assetSource },
        { kind: 'address' as const, label: t('marketplace_intent_new_utxo_owner'), value: utxoOwner },
      ] : []),
      {
        kind: 'amount' as const, label: t('marketplace_intent_new_utxo_value'),
        value: satsValue(intent.utxoValueSats),
      },
      {
        kind: 'amount' as const, label: t('marketplace_intent_xcp_fee'),
        value: formatXcpRaw(intent.protocolFee.quotedAmountRaw),
        description: t('common_xcp_fee_may_change'),
      },
      {
        kind: 'date' as const, label: t('marketplace_intent_expires'),
        value: formatExpiry(intent.operationExpiresAt),
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
  const ledger = new Set<string>();
  const ledgerBlock = (problem: string) => { ledger.add(problem); blockers.push(problem); };
  const itemCount = intent.items.length;
  const firstAdditionalBuyerInput = itemCount + 1;
  const attachedDelivery = intent.delivery.mode === 'attached';
  const deliveryUtxoSats = intent.delivery.mode === 'attached'
    ? intent.delivery.utxoValueSats
    : 0;

  if (!sameAddress(intent.delivery.address, intent.buyer)) {
    blockers.push('the claimed delivery address differs from the claimed buyer');
  }
  if (!transactionId) {
    retry.push('the wallet could not establish the unsigned transaction id');
  } else if (transactionId.toLowerCase() !== intent.expectedTxid) {
    blockers.push('the unsigned transaction id differs from the claim');
  }
  const detachData = isRecord(localCounterpartyMessage?.data)
    ? localCounterpartyMessage.data
    : undefined;
  if (attachedDelivery) {
    if (itemCount !== 1) {
      blockers.push('attached checkout must contain exactly one collectible');
    }
    if (hasCounterpartyPayload) {
      blockers.push('attached checkout must use ordinary Counterparty UTXO movement, not a protocol message');
    }
    if (
      outputs[0]?.type === 'op_return'
      || !sameAddress(outputs[0]?.address, intent.delivery.address)
      || outputs[0]?.value !== deliveryUtxoSats
    ) {
      blockers.push('output 0 is not the claimed buyer-owned attached asset UTXO');
    }
  } else {
    if (!hasCounterpartyPayload) {
      blockers.push('the checkout carries no Counterparty payload');
    }
    if (localCounterpartyMessage?.messageType !== 'detach' || !detachData) {
      blockers.push('the Counterparty payload is not a locally decoded detach');
    } else if (
      typeof detachData.destination !== 'string'
      || !sameAddress(detachData.destination, intent.delivery.address)
    ) {
      blockers.push('the locally decoded detach destination differs from the buyer');
    }
    if (outputs[0]?.type !== 'op_return' || outputs[0]?.value !== 0) {
      blockers.push('output 0 is not the zero-value Counterparty detach output');
    }
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
    if (item.sellerPaymentSats !== item.utxoValueSats + item.priceSats) {
      blockers.push(`item ${itemIndex + 1} seller payment is not the asset UTXO value plus the price`);
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
        retry.push(`seller input ${sellerInputIndex} has no authenticated UTXO value`);
      } else if (sellerInput.value !== item.utxoValueSats) {
        blockers.push(`seller input ${sellerInputIndex} UTXO value differs from the claim`);
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
      ledgerBlock(`seller input ${sellerInputIndex} does not resolve to exactly one attached asset`);
    } else {
      const actual = balance.assets[0]!;
      if (actual.asset !== item.asset) {
        ledgerBlock(`seller input ${sellerInputIndex} attached asset differs from the claim`);
      }
      if (actual.quantity === undefined) {
        retry.push(`seller input ${sellerInputIndex} has no exact raw attached quantity`);
      } else if (actual.quantity !== item.quantityRaw) {
        ledgerBlock(`seller input ${sellerInputIndex} raw attached quantity differs from the claim`);
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
    if (
      buyerInputTotal === null
      || buyerInputTotal - buyerChange - deliveryUtxoSats !== intent.totalSats
    ) {
      blockers.push('the buyer funding minus change differs from the claimed total');
    }
  }

  const allProblems = [...retry, ...blockers];
  const status = blockers.length > 0 ? 'blocked' : retry.length > 0 ? 'retry' : 'proved';
  const distinctAssets = new Set(intent.items.map(item => item.asset)).size;
  // An attached checkout has no decoded Counterparty message to supply asset summary rows.
  // Name the independently checked ledger amount on the decision screen, never raw base units.
  const receivedAsset = attachedDelivery && status === 'proved' ? balances.get(1)?.assets[0] : undefined;
  const paymentSummary: ProtocolField[] = [
    { kind: 'amount', label: t('marketplace_intent_you_pay'), value: satsValue(intent.totalSats), emphasis: 'primary' },
    { kind: 'amount', label: t('marketplace_intent_seller_subtotal'), value: satsValue(intent.subtotalSats) },
    { kind: 'amount', label: t('marketplace_intent_platform_fee'), value: satsValue(intent.platformFeeSats) },
    { kind: 'amount', label: t('marketplace_intent_network_fee'), value: satsValue(intent.networkFeeSats) },
    ...(deliveryUtxoSats > 0 ? [{
      kind: 'amount' as const, label: t('marketplace_intent_asset_utxo'),
      value: satsValue(deliveryUtxoSats),
      description: t('marketplace_intent_still_yours_separate_from_the_purchase_cost_and_change'),
    }] : []),
    ...(changeOutput
      ? [{ kind: 'amount' as const, label: t('marketplace_intent_change'), value: satsValue(changeOutput.value) }]
      : []),
  ];
  const collectibles = itemCount === 1
    ? t('marketplace_intent_one_collectible')
    : t('marketplace_intent_collectibles_count', grouped(itemCount));
  return {
    status,
    family: 'buy_listings',
    ...ledgerBlockKind(blockers, ledger),
    ...(status === 'proved' ? {
      paymentSummary,
      summary: {
        label: t('marketplace_intent_buy_collectibles'),
        description: collectibles,
      },
    } : {}),
    title: itemCount === 1
      ? t('marketplace_intent_title_buy_one_collectible_for_price', satsValue(intent.totalSats))
      : t('marketplace_intent_title_buy_collectibles_for_price', [grouped(itemCount), satsValue(intent.totalSats)]),
    facts: [
      ...paymentSummary,
      ...(receivedAsset
        ? [{
            kind: 'amount' as const, label: t('marketplace_intent_you_receive'),
            value: `${receivedAsset.quantity_normalized} ${receivedAsset.asset}`,
          }]
        : []),
      // Per-item rows already name each asset; this row only adds the distinct-asset count when it
      // differs from the item count.
      {
        kind: 'text' as const, label: t('marketplace_intent_items'),
        value: itemCount === distinctAssets
          ? grouped(itemCount)
          : t('marketplace_intent_items_with_asset_count', [grouped(itemCount), grouped(distinctAssets)]),
      },
      {
        kind: 'address' as const, label: t('marketplace_intent_delivery'), value: intent.delivery.address,
        description: attachedDelivery
          ? t('marketplace_intent_asset_stays_attached_to_sat_utxo', grouped(deliveryUtxoSats))
          : t('marketplace_intent_assets_detach_to_this_address'),
      },
      {
        kind: 'date' as const, label: t('marketplace_intent_expires'),
        value: formatExpiry(intent.marketplaceExpiresAt),
      },
    ],
    notices: allProblems.length > 0
      ? []
      : [{
          severity: 'info',
          message: attachedDelivery
            ? t('marketplace_intent_notice_sighash_all_attached_delivery')
            : t('marketplace_intent_notice_sighash_all_detach_destination'),
        }],
    blockers: allProblems,
  };
}

/**
 * Prove the fixed transaction shared by exact-offer authorization and unilateral acceptance.
 * The role changes, but the economics never do: buyer input 0 pays the exact price, seller input
 * 1 contributes the asset UTXO, output 0 applies the selected delivery, and output 1 returns
 * the seller asset UTXO plus price minus the miner fee. Both signatures bind the whole transaction.
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
  const ledger = new Set<string>();
  const ledgerBlock = (problem: string) => { ledger.add(problem); blockers.push(problem); };
  const claim = intent.assets[0];
  const authorizing = intent.action === 'authorize_exact_offer';
  const attachedDelivery = intent.delivery.mode === 'attached';
  const deliveryUtxoSats = intent.delivery.mode === 'attached'
    ? intent.delivery.utxoValueSats
    : 0;
  const requestedInputIndex = authorizing ? 0 : 1;
  const requestedSigner = authorizing ? intent.bidder : intent.seller;
  const buyerFundingSats = safeSum([
    intent.priceSats, deliveryUtxoSats, intent.platformFeeSats,
  ]);

  if (!sameAddress(intent.delivery.address, intent.bidder)) {
    blockers.push('the delivery address differs from the bidder');
  }
  if (!transactionId) {
    retry.push('the wallet could not establish the unsigned transaction id');
  } else if (transactionId.toLowerCase() !== intent.expectedTxid) {
    blockers.push('the unsigned transaction id differs from the exact authorization');
  }
  const detachData = isRecord(localCounterpartyMessage?.data)
    ? localCounterpartyMessage.data
    : undefined;
  if (attachedDelivery) {
    if (hasCounterpartyPayload) {
      blockers.push('attached exact offer must use ordinary Counterparty UTXO movement, not a protocol message');
    }
    if (
      outputs[0]?.type === 'op_return'
      || !sameAddress(outputs[0]?.address, intent.delivery.address)
      || outputs[0]?.value !== deliveryUtxoSats
    ) {
      blockers.push('output 0 is not the claimed bidder-owned attached asset UTXO');
    }
  } else {
    if (!hasCounterpartyPayload) {
      blockers.push('the exact offer carries no Counterparty payload');
    }
    if (localCounterpartyMessage?.messageType !== 'detach' || !detachData) {
      blockers.push('the Counterparty payload is not a locally decoded detach');
    } else if (
      typeof detachData.destination !== 'string'
      || !sameAddress(detachData.destination, intent.delivery.address)
    ) {
      blockers.push('the locally decoded detach destination differs from the bidder');
    }
    if (outputs[0]?.type !== 'op_return' || outputs[0]?.value !== 0) {
      blockers.push('output 0 is not the zero-value Counterparty detach output');
    }
  }

  const expectedOutputs = intent.platformFeeSats > 0 ? 3 : 2;
  if (inputs.length !== 2 || outputs.length !== expectedOutputs) {
    blockers.push(`expected exactly 2 inputs and ${expectedOutputs} outputs, got ${inputs.length}/${outputs.length}`);
  }
  if (intent.platformFeeSats > 0) {
    const platformOutput = outputs[2];
    // Match the declared amount to a distinct, decoded payment output. The site chooses
    // its fee recipient; this proves the payment, not the recipient's business identity.
    if (
      !platformOutput
      || platformOutput.type === 'op_return'
      || !platformOutput.address
      || sameAddress(platformOutput.address, intent.bidder)
      || sameAddress(platformOutput.address, intent.seller)
      || platformOutput.value !== intent.platformFeeSats
    ) {
      blockers.push('output 2 is not the claimed external platform fee');
    }
  }
  const inputOutpoints = inputs.map(transactionInput =>
    `${transactionInput.txid.toLowerCase()}:${transactionInput.vout}`);
  if (new Set(inputOutpoints).size !== inputOutpoints.length) {
    blockers.push('the exact offer contains a duplicate input outpoint');
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
    } else if (
      buyerFundingSats === null
      || bidderInput.value !== buyerFundingSats
    ) {
      blockers.push('buyer funding input 0 does not equal the offer price plus platform fee and selected delivery UTXO value');
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
      retry.push('seller input 1 has no authenticated UTXO value');
    } else if (sellerInput.value !== intent.utxoValueSats) {
      blockers.push('seller input 1 UTXO value differs from the claim');
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
    ledgerBlock('seller input 1 does not independently resolve to exactly one attached asset');
  } else {
    const actual = sellerBalance.assets[0]!;
    if (actual.asset !== claim.asset) {
      ledgerBlock('seller input 1 attached asset differs from the claim');
    }
    if (actual.quantity === undefined) {
      retry.push('seller input 1 has no exact raw attached quantity');
    } else if (actual.quantity !== claim.quantityRaw) {
      ledgerBlock('seller input 1 raw attached quantity differs from the claim');
    } else {
      provedQuantity = actual.quantity_normalized;
    }
  }

  const claimedProceeds = safeSum([
    intent.priceSats,
    intent.utxoValueSats,
    -intent.networkFeeSats,
  ]);
  if (claimedProceeds === null || claimedProceeds !== intent.sellerProceedsSats) {
    blockers.push('claimed seller proceeds do not equal the price plus the asset UTXO value minus the miner fee');
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
  // Absent means the bidder funded the whole fee (requests from before the taker fee).
  const sellerPaidFeeSats = intent.sellerPaidFeeSats ?? 0;
  const sellerPaysFee = sellerPaidFeeSats > 0;
  // The offer as the bidder made it; `priceSats` is what the seller is paid after the taker fee.
  const offerPriceSats = safeSum([intent.priceSats, sellerPaidFeeSats]);
  const offerPrice: ProtocolField = {
    kind: 'amount',
    label: t('marketplace_intent_offer_price'),
    value: offerPriceSats === null ? t('marketplace_intent_unavailable') : satsValue(offerPriceSats),
  };
  const platformFee: ProtocolField = {
    kind: 'amount', label: t('marketplace_intent_platform_fee'), value: satsValue(intent.platformFeeSats),
    description: sellerPaysFee
      ? t('marketplace_intent_deducted_from_seller_proceeds')
      : t('marketplace_intent_paid_by_the_buyer'),
  };
  const networkFee: ProtocolField = {
    kind: 'amount', label: t('marketplace_intent_network_fee'), value: satsValue(intent.networkFeeSats),
    description: t('marketplace_intent_deducted_from_seller_proceeds'),
  };
  const sellerReceives: ProtocolField = {
    kind: 'amount',
    label: authorizing ? t('marketplace_intent_seller_receives') : t('marketplace_intent_you_receive'),
    value: satsValue(intent.sellerProceedsSats),
    ...(!authorizing ? { emphasis: 'primary' as const } : {}),
  };
  const buyerCost = safeSum([intent.priceSats, intent.platformFeeSats]);
  const paymentSummary: ProtocolField[] = authorizing ? [
    {
      kind: 'amount', label: t('marketplace_intent_you_pay_if_accepted'),
      value: buyerCost === null ? t('marketplace_intent_unavailable') : satsValue(buyerCost),
      emphasis: 'primary',
    },
    offerPrice,
    ...(intent.platformFeeSats > 0 ? [platformFee] : []),
    ...(deliveryUtxoSats > 0 ? [{
      kind: 'amount' as const, label: t('marketplace_intent_asset_utxo'),
      value: satsValue(deliveryUtxoSats),
      description: t('marketplace_intent_still_yours_separate_from_the_offer_cost'),
    }] : []),
  ] : [
    sellerReceives, offerPrice,
    // The seller sees the fee only when it comes out of their proceeds.
    ...(sellerPaysFee ? [platformFee] : []),
    {
      kind: 'amount', label: t('marketplace_intent_utxo_returned'),
      value: satsValue(intent.utxoValueSats),
    },
    networkFee,
  ];
  const offerAsset = provedQuantity ? `${provedQuantity} ${claim.asset}` : claim.asset;
  return {
    status,
    ...ledgerBlockKind(blockers, ledger),
    family: intent.action,
    ...(allProblems.length === 0 ? {
      paymentSummary,
      summary: {
        label: authorizing
          ? t('marketplace_intent_offer_to_buy')
          : t('marketplace_intent_accept_offer'),
        description: `${provedQuantity} ${claim.asset}`,
      },
    } : {}),
    title: authorizing
      ? t('marketplace_intent_title_authorize_price_for_asset', [satsValue(offerPriceSats ?? intent.priceSats), offerAsset])
      : t('marketplace_intent_title_accept_price_for_asset', [satsValue(offerPriceSats ?? intent.priceSats), offerAsset]),
    facts: [
      ...paymentSummary,
      // Whoever pays the platform fee sees it: the bidder when they funded it, the seller when it
      // comes out of their proceeds. The fee output itself stays itemized in the raw transaction.
      ...((authorizing || sellerPaysFee) && intent.platformFeeSats > 0 && outputs[2]?.address ? [{
        kind: 'address' as const, label: t('marketplace_intent_fee_recipient'), value: outputs[2].address,
      }] : []),
      ...(authorizing && buyerFundingSats !== null ? [{
        kind: 'amount' as const, label: t('marketplace_intent_buyer_funding'),
        value: satsValue(buyerFundingSats),
        // With a seller-paid fee the funding is only the offer and any delivery UTXO.
        ...(sellerPaysFee
          ? {}
          : { description: t('marketplace_intent_offer_price_platform_fee_and_any_attached_delivery_utxo') }),
      }] : []),
      ...(authorizing ? [sellerReceives, networkFee] : []),
      {
        kind: 'address' as const, label: t('marketplace_intent_delivery'), value: intent.delivery.address,
        description: attachedDelivery
          ? t('marketplace_intent_asset_stays_attached_to_sat_utxo', grouped(deliveryUtxoSats))
          : t('marketplace_intent_asset_detaches_to_this_address'),
      },
      {
        kind: 'outpoint' as const,
        label: authorizing
          ? t('marketplace_intent_funding_utxo')
          : t('marketplace_intent_buyer_funding_utxo'),
        value: `${fundingOutpoint.txid}:${fundingOutpoint.vout}`,
      },
      {
        kind: 'date' as const, label: t('marketplace_intent_expires'),
        value: formatExpiry(intent.marketplaceExpiresAt),
      },
      ...(authorizing ? [{
        kind: 'paragraph' as const, label: t('marketplace_intent_cancellation'),
        value: t('marketplace_intent_withdraw_by_spending_your_funding_utxo'),
      }] : []),
    ],
    notices: allProblems.length > 0
      ? []
      : [{
          // Both are statements of what the signature is for, not exceptions to act on.
          severity: 'info',
          message: authorizing
            ? t('marketplace_intent_notice_authorize_exact_offer')
            : t('marketplace_intent_notice_accept_exact_offer'),
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
    title: intent.slotCount === 1
      ? t('marketplace_intent_title_create_one_listing_utxo')
      : t('marketplace_intent_title_create_listing_utxos', grouped(intent.slotCount)),
    facts: [
      {
        kind: 'amount' as const, label: t('marketplace_intent_funding_input'),
        value: satsValue(intent.fundingValueSats),
      },
      {
        kind: 'amount' as const, label: t('marketplace_intent_new_utxos'),
        value: `${grouped(intent.slotCount)} × ${satsValue(intent.slotValueSats)}`,
      },
      { kind: 'amount' as const, label: t('marketplace_intent_change'), value: satsValue(intent.changeSats) },
      {
        kind: 'amount' as const, label: t('marketplace_intent_network_fee'),
        value: satsValue(intent.networkFeeSats),
      },
      {
        kind: 'date' as const, label: t('marketplace_intent_expires'),
        value: formatExpiry(intent.operationExpiresAt),
      },
    ],
    notices: allProblems.length > 0
      ? []
      : [{
          severity: 'info',
          message: t('marketplace_intent_notice_bulk_fanout_outputs_stay_in_wallet'),
        }],
    blockers: allProblems,
  };
}

/** Keep website-supplied display text short enough that it cannot carry a sentence of its own. */
const clipDisplayText = (value: string, max: number): string => {
  const characters = Array.from(value);
  return characters.length <= max ? value : `${characters.slice(0, max - 1).join('').trimEnd()}…`;
};

const MAX_TARGET_COLLECTION_DISPLAY = 40;
const MAX_TARGET_POLICY_DISPLAY = 60;

/** An asset target is a validated Counterparty name and reads bare; collection text is the
 * website's own words, so it is always shown clipped and inside quotation marks. */
const fundOffersTitle = (intent: FundOffersIntentClaim): string => {
  const { target, slotCount } = intent;
  if (target.scope === 'asset') {
    return slotCount === 1
      ? t('marketplace_intent_title_fund_offer', target.asset)
      : t('marketplace_intent_title_fund_offers', [grouped(slotCount), target.asset]);
  }
  const collection = clipDisplayText(target.collection, MAX_TARGET_COLLECTION_DISPLAY);
  return slotCount === 1
    ? t('marketplace_intent_title_fund_offer_collection', collection)
    : t('marketplace_intent_title_fund_offers_collection', [grouped(slotCount), collection]);
};

/**
 * Prove a clean-BTC self-send that backs exact offers: every signed input is the bidder's own
 * asset-free coin, and every output — each exact offer slot and the change — pays the bidder back.
 * Nothing leaves the wallet here; a seller can only take a slot through the separate
 * `authorize_exact_offer` signature that fixes the asset, payment, and delivery.
 */
function analyzeFundOffersIntent(
  input: MarketplaceAnalysisInput,
  intent: FundOffersIntentClaim,
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
    retry.push('the wallet could not establish the offer funding transaction id');
  } else if (transactionId.toLowerCase() !== intent.expectedTxid) {
    blockers.push('the offer funding transaction id differs from the claim');
  }
  if (hasCounterpartyPayload) {
    blockers.push('offer funding must not carry a Counterparty payload');
  }

  const attachedUtxoSats = intent.delivery.mode === 'attached' ? intent.delivery.utxoValueSats : 0;
  const expectedSlot = safeSum([intent.priceSats, intent.platformFeeSats, attachedUtxoSats]);
  if (expectedSlot === null || expectedSlot !== intent.slotValueSats) {
    blockers.push('each offer slot must equal the offer price plus the platform fee and any delivery UTXO');
  }

  if (inputs.length !== intent.fundingInputs.length) {
    blockers.push(`expected ${intent.fundingInputs.length} offer funding inputs, got ${inputs.length}`);
  }
  if (signerAddresses.length !== 1 || !sameAddress(signerAddresses[0], intent.bidder)) {
    blockers.push('the requested offer funding signer is not exactly the claimed bidder');
  }
  const signedIndices = new Set(signedInputs.map(entry => entry.index));
  if (
    signedInputs.length !== inputs.length
    || inputs.some(transactionInput => !signedIndices.has(transactionInput.index))
    || signedInputs.some(entry => entry.sighashType !== 0x01)
  ) {
    blockers.push('the wallet must sign every offer funding input with ALL (0x01)');
  }

  for (let inputIndex = 0; inputIndex < inputs.length; inputIndex += 1) {
    const fundingInput = inputs[inputIndex]!;
    const claim = intent.fundingInputs[inputIndex];
    if (!claim || !sameOutpoint(fundingInput, claim)) {
      blockers.push(`offer funding input ${inputIndex} differs from the claimed outpoint`);
    }
    if (!sameAddress(fundingInput.address, intent.bidder)) {
      blockers.push(`offer funding input ${inputIndex} is not controlled by the claimed bidder`);
    }
    if (fundingInput.value === undefined) {
      retry.push(`offer funding input ${inputIndex} has no authenticated value`);
    } else if (claim && fundingInput.value !== claim.valueSats) {
      blockers.push(`offer funding input ${inputIndex} value differs from the claim`);
    }
    if (fundingInput.hasSignatures !== false) {
      blockers.push(`offer funding input ${inputIndex} must be proven unsigned before approval`);
    }
    // Absence of an entry means the lookup ran and found nothing attached.
    const assets = attachedAssets.find(entry => entry.inputIndex === fundingInput.index);
    if (assets?.lookupFailed) {
      retry.push(`the attached-asset lookup for offer funding input ${inputIndex} failed`);
    } else if (assets && assets.assets.length > 0) {
      blockers.push(`offer funding input ${inputIndex} already carries Counterparty assets`);
    }
  }

  const claimedInputTotal = safeSum(intent.fundingInputs.map(claim => claim.valueSats));
  if (claimedInputTotal === null || claimedInputTotal !== intent.fundingValueSats) {
    blockers.push('the claimed funding value does not equal the claimed inputs');
  }

  const expectedOutputCount = intent.slotCount + (intent.changeSats > 0 ? 1 : 0);
  if (outputs.length !== expectedOutputCount) {
    blockers.push(`expected ${expectedOutputCount} offer funding outputs, got ${outputs.length}`);
  }
  for (let outputIndex = 0; outputIndex < outputs.length; outputIndex += 1) {
    const output = outputs[outputIndex]!;
    const expectedValue = outputIndex < intent.slotCount ? intent.slotValueSats : intent.changeSats;
    if (output.type === 'op_return' || !sameAddress(output.address, intent.bidder)) {
      blockers.push(`offer funding output ${outputIndex} does not return to the bidder`);
    }
    if (output.value !== expectedValue) {
      blockers.push(`offer funding output ${outputIndex} value differs from the plan`);
    }
  }

  const slotTotal = safeSum(Array.from({ length: intent.slotCount }, () => intent.slotValueSats));
  const outputTotal = slotTotal === null ? null : safeSum([slotTotal, intent.changeSats]);
  const claimedFee = outputTotal === null ? null : intent.fundingValueSats - outputTotal;
  if (claimedFee === null || claimedFee < 0 || claimedFee !== intent.networkFeeSats) {
    blockers.push('the claimed offer funding fee does not equal funding minus outputs');
  }
  const actualInputTotal = inputs.every(transactionInput => transactionInput.value !== undefined)
    ? safeSum(inputs.map(transactionInput => transactionInput.value!))
    : undefined;
  if (actualInputTotal !== undefined) {
    const actualOutputTotal = safeSum(outputs.map(output => output.value));
    const actualFee = actualInputTotal === null || actualOutputTotal === null
      ? null
      : actualInputTotal - actualOutputTotal;
    if (actualFee === null || actualFee < 0 || actualFee !== intent.networkFeeSats) {
      blockers.push('the actual offer funding fee differs from the claim');
    }
  }

  const allProblems = [...retry, ...blockers];
  const each = (label: string) => t('marketplace_intent_each_label', label);
  const setAsideSats = safeSum(Array.from({ length: intent.slotCount }, () => intent.slotValueSats));
  // Per-edition amounts are marked "each"; the one total is what leaves spendable balance.
  const paymentSummary: ProtocolField[] = [
    {
      kind: 'amount', label: each(t('marketplace_intent_offer_price')),
      value: satsValue(intent.priceSats),
    },
    {
      kind: 'amount', label: each(t('marketplace_intent_platform_fee')),
      value: satsValue(intent.platformFeeSats),
      description: t('marketplace_intent_paid_only_if_a_seller_accepts'),
    },
    ...(attachedUtxoSats > 0 ? [{
      kind: 'amount' as const, label: each(t('marketplace_intent_asset_utxo')),
      value: satsValue(attachedUtxoSats),
    }] : []),
    ...(setAsideSats === null ? [] : [{
      kind: 'amount' as const, label: t('marketplace_intent_set_aside'),
      value: satsValue(setAsideSats),
      description: `${grouped(intent.slotCount)} × ${satsValue(intent.slotValueSats)}`,
    }]),
    {
      kind: 'amount', label: t('marketplace_intent_network_fee'),
      value: satsValue(intent.networkFeeSats),
    },
  ];
  const policy = intent.target.scope === 'collection' ? intent.target.policy : undefined;
  return {
    status: blockers.length > 0 ? 'blocked' : retry.length > 0 ? 'retry' : 'proved',
    family: 'fund_offers',
    ...(allProblems.length === 0 ? { paymentSummary } : {}),
    title: fundOffersTitle(intent),
    facts: [
      ...paymentSummary,
      ...(policy === undefined ? [] : [{
        kind: 'text' as const, label: t('marketplace_intent_offer_policy'),
        value: t('marketplace_intent_quoted_text', clipDisplayText(policy, MAX_TARGET_POLICY_DISPLAY)),
      }]),
      { kind: 'amount' as const, label: t('marketplace_intent_change'), value: satsValue(intent.changeSats) },
      {
        kind: 'date' as const, label: t('marketplace_intent_expires'),
        value: formatExpiry(intent.marketplaceExpiresAt),
      },
      {
        kind: 'paragraph' as const, label: t('marketplace_intent_cancellation'),
        value: t('marketplace_intent_cancel_anytime_by_spending_set_aside_outputs'),
      },
    ],
    notices: allProblems.length > 0
      ? []
      : [{
          severity: 'info',
          message: t('marketplace_intent_notice_fund_offers'),
        }],
    blockers: allProblems,
  };
}

/** Run one derivation; a site value that cannot even be parsed is the site's contradiction. */
const attempt = <T>(blockers: string[], run: () => T): T | undefined => {
  try {
    return run();
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
    return undefined;
  }
};

/** Website-supplied policy text reduced to one visible line. Presentation only: the hash commits
 * to the exact canonical string, which the wallet re-hashes before any of this is shown. */
const visibleText = (value: string, max: number): string => {
  const cleaned = value
    .replace(/\p{Cf}/gu, '')
    .replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, ' ')
    .trim();
  return clipDisplayText(cleaned.length > 0 ? cleaned : '?', max);
};

const MAX_POLICY_ARTIST_DISPLAY = 30;

/** A canonical policy in words: an asset name, or a quoted collection narrowed by its traits. */
export function describeCanonicalPolicy(policy: CanonicalPolicy): string {
  if (policy.scope === 'asset') return policy.asset ?? '?';
  const parts = [
    t('marketplace_intent_quoted_text', visibleText(policy.collection ?? '', MAX_TARGET_COLLECTION_DISPLAY)),
  ];
  // Years and series numbers are names, not quantities, so they are never digit-grouped.
  if (policy.series !== null) parts.push(t('marketplace_intent_policy_series', String(policy.series)));
  if (policy.artist !== null) {
    parts.push(t('marketplace_intent_policy_artist', t(
      'marketplace_intent_quoted_text', visibleText(policy.artist, MAX_POLICY_ARTIST_DISPLAY),
    )));
  }
  if (policy.issued_year !== null) parts.push(t('marketplace_intent_policy_issued_year', String(policy.issued_year)));
  if (policy.min_supply_units !== null) {
    parts.push(t('marketplace_intent_policy_min_supply', grouped(policy.min_supply_units)));
  }
  if (policy.max_supply_units !== null) {
    parts.push(t('marketplace_intent_policy_max_supply', grouped(policy.max_supply_units)));
  }
  return parts.join(' · ');
}

/** The wallet's own policy-offer context, never the site's. Defaults are the compiled-in keys
 * and the wallet clock; a missing funding settlement stays missing and blocks. */
const policyWalletContext = (input: MarketplaceAnalysisInput) => ({
  pinnedMarketKeys: input.policyOffer?.pinnedMarketKeys ?? PINNED_POLICY_OFFER_MARKET_KEYS,
  nowSeconds: input.policyOffer?.nowSeconds ?? Math.floor(Date.now() / 1000),
  fundingSettlement: input.policyOffer?.fundingSettlement,
});

/** Who holds a pinned market key, for the review. Wallet configuration, never the site's words. */
export function pinnedPolicyMarketOperator(
  marketKey: string,
  pinnedMarketKeys: readonly PinnedPolicyMarketKey[] = PINNED_POLICY_OFFER_MARKET_KEYS,
): string | undefined {
  return pinnedMarketKeys.find(entry => entry.xOnlyKey === marketKey)?.operator;
}

/**
 * Prove one `fund_policy_offer` alternative (spec §11.1) from its own parent bytes.
 *
 * Nothing the bidder signs here is broadcast: the parent pays zero fee and cannot relay alone. What
 * the signature authorizes is the pinned market key's script path over the offer output, for as
 * long as the funding inputs stay unspent. So every term the market key could later exploit is
 * rebuilt by the wallet — the leaf from the displayed terms, the output key from the bidder's own
 * key, the change back to the bidder, the fee below dust — and the market key itself must be one
 * compiled into this wallet.
 */
function analyzeFundPolicyOfferIntent(
  input: MarketplaceAnalysisInput,
  intent: FundPolicyOfferIntentClaim,
): MarketplaceApprovalReview {
  const {
    inputs, outputs, signedInputs, signerAddresses, attachedAssets, hasCounterpartyPayload, transactionId,
  } = input;
  const context = policyWalletContext(input);
  const blockers: string[] = [];
  const retry: string[] = [];
  const fundingCount = intent.fundingInputs.length;

  const txid = transactionId?.toLowerCase();
  const alternative = txid === undefined
    ? undefined
    : intent.alternatives.find(candidate => candidate.expectedParentTxid === txid);
  if (!txid) {
    retry.push('the wallet could not establish the parent transaction id');
  } else if (!alternative) {
    blockers.push('the parent transaction id is not one of the claimed alternatives');
  }

  const operator = pinnedPolicyMarketOperator(intent.marketKey, context.pinnedMarketKeys);
  if (operator === undefined) {
    blockers.push('the market key is not pinned in this wallet for funded_policy_offer_v1');
  }
  const keyAddresses = attempt(blockers, () => policyInternalKeyAddresses(intent.internalKey));
  if (keyAddresses && !keyAddresses.some(address => sameAddress(address, intent.bidder))) {
    blockers.push('the internal key is not the bidder address’s own key');
  }
  // policyInternalKeyAddresses lists the BIP86 P2TR address first.
  const bidderTaproot = keyAddresses !== undefined && sameAddress(keyAddresses[0], intent.bidder);
  if (signerAddresses.length !== 1 || !sameAddress(signerAddresses[0], intent.bidder)) {
    blockers.push('the requested signer is not exactly the claimed bidder');
  }

  // Delivery is not signing: any family this wallet owns, but byte-for-byte what the leaf commits.
  const owned = input.ownedAddresses ?? signerAddresses;
  const ownedDelivery = owned.find(address => sameAddress(address, intent.delivery.address));
  if (!ownedDelivery) {
    blockers.push('the delivery address does not belong to this wallet');
  } else if (ownedDelivery !== intent.delivery.address) {
    blockers.push('the delivery address is not in its canonical form');
  }

  const settlement = context.fundingSettlement;
  if (!settlement) {
    blockers.push('the funding inputs were not proven confirmed; a policy offer is signed only through its linked review');
  } else if (settlement.status === 'retry') {
    retry.push(settlement.problem);
  } else if (settlement.status === 'blocked') {
    blockers.push(settlement.problem);
  }

  if (input.transactionVersion !== POLICY_OFFER_TX_VERSION || input.lockTime !== POLICY_OFFER_LOCKTIME) {
    blockers.push('the offer parent must be Bitcoin transaction version 3 with locktime 0');
  }
  if (hasCounterpartyPayload) blockers.push('an offer parent must not carry a Counterparty payload');

  if (inputs.length !== fundingCount + 1) {
    blockers.push(`expected ${fundingCount} funding inputs and the anchor, got ${inputs.length} inputs`);
  }
  const balances = new Map(attachedAssets.map(entry => [entry.inputIndex, entry]));
  intent.fundingInputs.forEach((claim, index) => {
    const fundingInput = inputs[index];
    if (!fundingInput) return;
    if (!sameOutpoint(fundingInput, claim)) blockers.push(`funding input ${index} is not the claimed outpoint`);
    if (!sameAddress(fundingInput.address, intent.bidder)) {
      blockers.push(`funding input ${index} is not controlled by the claimed bidder`);
    }
    if (fundingInput.value === undefined) {
      retry.push(`funding input ${index} has no authenticated value`);
    } else if (fundingInput.value !== claim.valueSats) {
      blockers.push(`funding input ${index} value differs from the claim`);
    }
    if (fundingInput.sequence !== POLICY_OFFER_SEQUENCE) {
      blockers.push(`funding input ${index} sequence must be 0xfffffffd`);
    }
    if (fundingInput.hasSignatures !== false) {
      blockers.push(`funding input ${index} must be proven unsigned before approval`);
    }
    // Absence of an entry means the lookup ran and found nothing attached.
    const balance = balances.get(index);
    if (balance?.lookupFailed) {
      retry.push(`the attached-asset lookup for funding input ${index} failed`);
    } else if (balance && balance.assets.length > 0) {
      blockers.push(`funding input ${index} carries attached Counterparty assets`);
    }
  });
  const anchorInput = inputs[fundingCount];
  const anchorAddress = decodeAddressFromScript(intent.anchor.scriptPubKey) ?? undefined;
  if (!anchorAddress) blockers.push('the anchor script is not a recognizable output script');
  else if (sameAddress(anchorAddress, intent.bidder)) blockers.push('the market anchor must not be the bidder’s own coin');
  if (anchorInput) {
    if (!sameOutpoint(anchorInput, intent.anchor)) blockers.push('the last input is not the claimed market anchor');
    if (!anchorAddress || !sameAddress(anchorInput.address, anchorAddress)) {
      blockers.push('the anchor input does not spend the claimed anchor script');
    }
    if (anchorInput.value !== POLICY_ANCHOR_SATS) blockers.push(`the anchor input is not ${POLICY_ANCHOR_SATS} sats`);
    if (anchorInput.sequence !== POLICY_OFFER_SEQUENCE) blockers.push('the anchor input sequence must be 0xfffffffd');
    if (anchorInput.hasSignatures !== false) blockers.push('the anchor input must be unsigned');
  }

  // Every funding input, only those — never the anchor — with a signature over the whole parent.
  const allowedSighashes = bidderTaproot ? [0x00, 0x01] : [0x01];
  const sortedSigned = [...signedInputs].sort((left, right) => left.index - right.index);
  if (
    sortedSigned.length !== fundingCount
    || sortedSigned.some((signed, index) => signed.index !== index || !allowedSighashes.includes(signed.sighashType))
    || new Set(signedInputs.map(signed => signed.index)).size !== signedInputs.length
  ) {
    blockers.push(bidderTaproot
      ? 'the wallet must sign every funding input, and only those, with DEFAULT or ALL'
      : 'the wallet must sign every funding input, and only those, with ALL (0x01)');
  }

  if (alternative) {
    if (alternative.priceSats < MIN_POLICY_PRICE_SATS) {
      blockers.push(`the offer price is below the ${MIN_POLICY_PRICE_SATS}-sat minimum`);
    }
    if (alternative.offerValueSats !== alternative.priceSats) {
      blockers.push('a detached offer output must equal the price');
    }
    if (
      alternative.expiresAt < context.nowSeconds + POLICY_MIN_EXPIRY_SECONDS
      || alternative.expiresAt > context.nowSeconds + POLICY_MAX_EXPIRY_SECONDS
    ) {
      blockers.push('the offer expiry is not between ten minutes and 90 days from now');
    }
    const hash = attempt(blockers, () => policyHashHex(alternative.policy));
    if (hash !== undefined && hash !== alternative.policyHash) {
      blockers.push('the policy hash does not commit to the displayed policy');
    }
    // The leaf is rebuilt from the displayed terms and the wallet's pinned key, never read back.
    const leaf = hash === undefined ? undefined : attempt(blockers, () => encodePolicyLeaf({
      priceSats: alternative.priceSats,
      expiresAt: alternative.expiresAt,
      deliveryAddress: intent.delivery.address,
      policyHash: hash,
      marketKey: intent.marketKey,
    }));
    if (leaf && bytesToHex(leaf) !== alternative.leafHex) {
      blockers.push('the leaf differs from the one rebuilt from the displayed terms');
    }
    const taproot = leaf ? attempt(blockers, () => policyOfferTaproot(intent.internalKey, leaf)) : undefined;
    if (taproot && taproot.scriptPubKeyHex !== alternative.offerScriptPubKey) {
      blockers.push('the claimed offer script is not the internal key tweaked by the leaf');
    }

    const hasChange = alternative.changeSats > 0;
    const expectedOutputs = hasChange ? 3 : 2;
    if (outputs.length !== expectedOutputs) {
      blockers.push(`expected exactly ${expectedOutputs} outputs, got ${outputs.length}`);
    }
    const offer = outputs[0];
    if (
      !offer || !taproot || offer.script !== taproot.scriptPubKeyHex
      || offer.value !== alternative.offerValueSats
    ) {
      blockers.push('output 0 is not the offer output for the price');
    }
    const anchorReturn = outputs[1];
    if (
      !anchorReturn || anchorReturn.script !== intent.anchor.scriptPubKey
      || anchorReturn.value !== POLICY_ANCHOR_SATS
    ) {
      blockers.push('output 1 does not return the anchor');
    }
    if (hasChange) {
      const change = outputs[2];
      if (
        !change || change.type === 'op_return' || !sameAddress(change.address, intent.bidder)
        || change.value !== alternative.changeSats
      ) {
        blockers.push('output 2 does not return the claimed change to the bidder');
      }
      const dust = bidderTaproot ? POLICY_CHANGE_DUST_SATS.p2tr : POLICY_CHANGE_DUST_SATS.p2wpkh;
      if (alternative.changeSats < dust) blockers.push('the claimed change is below dust');
    }

    // Σ funding + anchor − Σ outputs = the folded sub-dust fee, at most 329 sats.
    const fundingTotal = safeSum(intent.fundingInputs.map(claim => claim.valueSats));
    const claimedOutputs = safeSum([alternative.offerValueSats, POLICY_ANCHOR_SATS, alternative.changeSats]);
    const claimedFee = fundingTotal === null || claimedOutputs === null
      ? null
      : fundingTotal + POLICY_ANCHOR_SATS - claimedOutputs;
    if (
      claimedFee === null || claimedFee !== alternative.parentFeeSats
      || claimedFee < 0 || claimedFee > MAX_POLICY_PARENT_FEE_SATS
    ) {
      blockers.push(`the parent fee does not balance or exceeds ${MAX_POLICY_PARENT_FEE_SATS} sats`);
    }
    const inputValues = inputs.map(transactionInput => transactionInput.value);
    if (!inputValues.some(value => value === undefined)) {
      const actualIn = safeSum(inputValues as number[]);
      const actualOut = safeSum(outputs.map(output => output.value));
      if (actualIn === null || actualOut === null || actualIn - actualOut !== alternative.parentFeeSats) {
        blockers.push('the actual parent fee differs from the claim');
      }
    }
    const vsize = attempt(blockers, () => unsignedPolicyParentVsize(
      inputs.map(transactionInput => transactionInput.scriptType),
      outputs.map((output) => {
        if (!output.script) throw new Error(`parent output ${output.index} has no decoded script`);
        return output.script;
      }),
    ));
    if (vsize !== undefined && (vsize !== alternative.parentVsize || vsize > MAX_POLICY_PARENT_VSIZE)) {
      blockers.push(`the parent size differs from the claim or exceeds ${MAX_POLICY_PARENT_VSIZE} vB`);
    }
    if (alternative.detachScriptHex !== undefined && txid) {
      const expected = attempt(blockers, () => policyDetachScriptHex(intent.delivery.address, txid));
      if (expected !== undefined && expected !== alternative.detachScriptHex) {
        blockers.push('the claimed detach script is not keyed by this parent to the delivery address');
      }
    }
  }

  const allProblems = [...retry, ...blockers];
  const status = blockers.length > 0 ? 'blocked' : retry.length > 0 ? 'retry' : 'caution';
  const shown = alternative ?? intent.alternatives[0]!;
  const policyText = describeCanonicalPolicy(shown.policy);
  const offerPrice: ProtocolField = {
    kind: 'amount', label: t('marketplace_intent_offer_price'), value: satsValue(shown.priceSats),
    emphasis: 'primary',
  };
  const networkFee: ProtocolField = {
    kind: 'text', label: t('marketplace_intent_network_fee'), value: t('marketplace_intent_none_now'),
    description: t('marketplace_intent_seller_pays_marketplace_and_network_fees'),
  };
  return {
    status,
    family: 'fund_policy_offer',
    ...(allProblems.length === 0 ? {
      paymentSummary: [offerPrice, networkFee],
      summary: { label: t('marketplace_intent_offer_to_buy'), description: policyText },
    } : {}),
    title: t('marketplace_intent_title_policy_offer', [satsValue(shown.priceSats), policyText]),
    facts: [
      offerPrice,
      { kind: 'text' as const, label: t('marketplace_intent_offer_policy'), value: policyText },
      networkFee,
      {
        kind: 'address' as const, label: t('marketplace_intent_delivery'), value: intent.delivery.address,
        description: t('marketplace_intent_asset_detaches_to_this_address'),
      },
      ...intent.fundingInputs.map(funding => ({
        kind: 'outpoint' as const, label: t('marketplace_intent_funding_utxo'),
        value: `${funding.txid}:${funding.vout}`,
      })),
      { kind: 'date' as const, label: t('marketplace_intent_expires'), value: formatExpiry(shown.expiresAt) },
      {
        kind: 'paragraph' as const, label: t('marketplace_intent_cancellation'),
        value: t('marketplace_intent_policy_cancel_by_spending_funding'),
      },
    ],
    // The one trust this signature adds, stated whenever the proof holds: the pinned key's
    // holder can complete the offer for up to its value until a funding input is spent.
    notices: allProblems.length > 0 || operator === undefined
      ? []
      : [{
          severity: 'warning',
          message: t('marketplace_intent_notice_policy_offer_market_key', [operator, satsValue(shown.offerValueSats)]),
        }],
    blockers: allProblems,
  };
}

/**
 * Prove a `accept_policy_offer` child (spec §11.2) before the seller signs input 1.
 *
 * The seller's signature commits the whole child: the offer outpoint, the seller's asset UTXO, the
 * detach to the bidder, the seller's proceeds, and the marketplace fee. What the wallet must prove
 * is that input 0 really is the bidder's offer for the claimed price — from the parent's own bytes,
 * the leaf, and the bidder's key — and that the asset UTXO holds exactly the unit being sold.
 */
function analyzeAcceptPolicyOfferIntent(
  input: MarketplaceAnalysisInput,
  intent: AcceptPolicyOfferIntentClaim,
): MarketplaceApprovalReview {
  const {
    inputs, outputs, signedInputs, signerAddresses, attachedAssets, hasCounterpartyPayload, transactionId,
  } = input;
  const blockers: string[] = [];
  const retry: string[] = [];
  const ledger = new Set<string>();
  const ledgerBlock = (problem: string) => { ledger.add(problem); blockers.push(problem); };
  const claim = intent.assets[0];
  const parentTxid = intent.offerOutpoint.parentTxid;

  if (signerAddresses.length !== 1 || !sameAddress(signerAddresses[0], intent.seller)) {
    blockers.push('the requested signer is not exactly the claimed seller');
  }

  // The parent, from its own witness-free bytes.
  const parent = attempt(blockers, () => parseWitnessStrippedParent(intent.parentRawHex));
  if (parent) {
    if (parent.txid !== parentTxid) blockers.push('the parent bytes do not hash to the offer outpoint');
    if (parent.version !== POLICY_OFFER_TX_VERSION || parent.lockTime !== POLICY_OFFER_LOCKTIME) {
      blockers.push('the offer parent must be Bitcoin transaction version 3 with locktime 0');
    }
    if (intent.parentInputValuesSats.length !== parent.inputCount) {
      blockers.push('the parent input values do not cover every parent input');
    } else {
      const parentIn = safeSum(intent.parentInputValuesSats);
      const parentOut = safeSum(parent.outputs.map(output => output.valueSats));
      const parentFee = parentIn === null || parentOut === null ? null : parentIn - parentOut;
      if (
        parentFee === null || parentFee !== intent.parentFeeSats
        || parentFee < 0 || parentFee > MAX_POLICY_PARENT_FEE_SATS
      ) {
        blockers.push(`the parent fee does not balance or exceeds ${MAX_POLICY_PARENT_FEE_SATS} sats`);
      }
    }
  }
  const leaf = attempt(blockers, () => hexToBytes(intent.leafHex));
  const terms = leaf ? attempt(blockers, () => decodePolicyLeaf(leaf)) : undefined;
  if (terms) {
    if (terms.priceSats !== intent.priceSats) blockers.push('the offer leaf commits to a different price');
    if (terms.deliveryAddress !== intent.delivery.address) {
      blockers.push('the offer leaf commits to a different delivery address');
    }
  }
  const taproot = leaf ? attempt(blockers, () => policyOfferTaproot(intent.internalKey, leaf)) : undefined;
  const parentOffer = parent?.outputs[0];
  if (
    parent && taproot
    && (!parentOffer || parentOffer.scriptHex !== taproot.scriptPubKeyHex
      || parentOffer.valueSats !== intent.offerValueSats)
  ) {
    blockers.push('parent output 0 is not the claimed offer');
  }
  // Detached delivery adds no UTXO to the offer, so the offer value is the price.
  if (intent.priceSats !== intent.offerValueSats) {
    blockers.push('the price is not the offer value');
  }

  // The child.
  if (!transactionId) {
    retry.push('the wallet could not establish the acceptance transaction id');
  } else if (transactionId.toLowerCase() !== intent.expectedTxid) {
    blockers.push('the acceptance transaction id differs from the claim');
  }
  if (input.transactionVersion !== POLICY_OFFER_TX_VERSION || input.lockTime !== POLICY_OFFER_LOCKTIME) {
    blockers.push('the acceptance must be Bitcoin transaction version 3 with locktime 0');
  }
  if (inputs.length !== 2 || outputs.length !== 3) {
    blockers.push(`expected exactly 2 inputs and 3 outputs, got ${inputs.length}/${outputs.length}`);
  }
  const offerInput = inputs[0];
  const offerAddress = taproot ? decodeAddressFromScript(taproot.scriptPubKeyHex) ?? undefined : undefined;
  if (!offerInput || offerInput.txid.toLowerCase() !== parentTxid || offerInput.vout !== 0) {
    blockers.push('input 0 is not the offer outpoint');
  } else if (
    !offerAddress || !sameAddress(offerInput.address, offerAddress)
    || offerInput.value !== intent.offerValueSats
  ) {
    blockers.push('input 0 does not spend parent output 0 for the offer value');
  }
  const sellerInput = inputs[1];
  if (!sellerInput) {
    blockers.push('seller asset input 1 is missing');
  } else {
    if (!sameOutpoint(sellerInput, claim.sourceOutpoint)) blockers.push('input 1 is not the claimed asset outpoint');
    if (!sameAddress(sellerInput.address, intent.seller)) blockers.push('input 1 is not controlled by the claimed seller');
    if (sellerInput.value === undefined) {
      retry.push('seller input 1 has no authenticated UTXO value');
    } else if (sellerInput.value !== intent.utxoValueSats) {
      blockers.push('seller input 1 UTXO value differs from the claim');
    }
    if (sellerInput.hasSignatures !== false) blockers.push('seller input 1 must be proven unsigned before acceptance');
  }
  if (offerInput && offerInput.hasSignatures !== false) {
    blockers.push('offer input 0 must be unsigned; the market signs it after the seller');
  }
  inputs.forEach((transactionInput) => {
    if (transactionInput.sequence !== POLICY_OFFER_SEQUENCE) {
      blockers.push(`input ${transactionInput.index} sequence must be 0xfffffffd`);
    }
  });
  const sellerTaproot = sellerInput?.scriptType === 'p2tr';
  if (
    signedInputs.length !== 1
    || signedInputs[0]?.index !== 1
    || !(sellerTaproot ? [0x00, 0x01] : [0x01]).includes(signedInputs[0]!.sighashType)
  ) {
    blockers.push(sellerTaproot
      ? 'the wallet must sign only input 1 with DEFAULT or ALL'
      : 'the wallet must sign only input 1 with ALL (0x01)');
  }

  const balance = attachedAssets.find(entry => entry.inputIndex === 1);
  let provedQuantity: string | null = null;
  if (balance?.lookupFailed) {
    retry.push('the attached-asset lookup for seller input 1 failed');
  } else if (!balance || balance.assets.length !== 1) {
    ledgerBlock('seller input 1 does not independently resolve to exactly one attached asset');
  } else {
    const actual = balance.assets[0]!;
    if (actual.asset !== claim.asset) ledgerBlock('seller input 1 attached asset differs from the claim');
    if (actual.quantity === undefined) {
      retry.push('seller input 1 has no exact raw attached quantity');
    } else if (actual.quantity !== claim.quantityRaw) {
      ledgerBlock('seller input 1 raw attached quantity differs from the claim');
    } else {
      provedQuantity = actual.quantity_normalized;
    }
  }

  if (!hasCounterpartyPayload) blockers.push('the acceptance carries no Counterparty payload');
  const delivery = outputs[0];
  if (
    !delivery || delivery.type !== 'op_return' || delivery.value !== 0 || !delivery.script
    || decodePolicyDetachScript(delivery.script, parentTxid) !== intent.delivery.address
  ) {
    blockers.push('output 0 does not detach to the claimed delivery address, keyed by the offer parent');
  }
  const proceeds = outputs[1];
  if (!proceeds || !sameAddress(proceeds.address, intent.seller) || proceeds.value !== intent.sellerProceedsSats) {
    blockers.push('output 1 does not pay the seller the claimed proceeds');
  }
  const expectedFee = attempt(blockers, () => platformFeeSats(intent.priceSats));
  if (expectedFee !== undefined && intent.platformFeeSats !== expectedFee) {
    blockers.push('the claimed marketplace fee is not the published fee for this price');
  }
  const feeOutput = outputs[2];
  if (!feeOutput || feeOutput.type === 'op_return' || !feeOutput.address || feeOutput.value !== intent.platformFeeSats) {
    blockers.push('output 2 is not the claimed marketplace fee');
  }
  const conserved = safeSum([intent.offerValueSats, intent.utxoValueSats]) === safeSum([
    intent.sellerProceedsSats, intent.platformFeeSats, intent.networkFeeSats,
  ]);
  if (!conserved) blockers.push('the offer and asset UTXO do not equal the proceeds, marketplace fee, and network fee');
  const inputValues = inputs.map(transactionInput => transactionInput.value);
  if (!inputValues.some(value => value === undefined)) {
    const actualIn = safeSum(inputValues as number[]);
    const actualOut = safeSum(outputs.map(output => output.value));
    if (actualIn === null || actualOut === null || actualIn - actualOut !== intent.networkFeeSats) {
      blockers.push('the actual network fee differs from the claim');
    }
  }
  if (intent.sellerProceedsSats <= POLICY_SELLER_DUST_SATS) {
    blockers.push(`seller proceeds must exceed ${POLICY_SELLER_DUST_SATS} sats`);
  }
  if (intent.networkFeeSats <= 0 || intent.packageVsize <= intent.parentVsize) {
    blockers.push('the network fee or package size is invalid');
  }

  const allProblems = [...retry, ...blockers];
  const status = blockers.length > 0 ? 'blocked' : retry.length > 0 ? 'retry' : 'proved';
  const paymentSummary: ProtocolField[] = [
    {
      kind: 'amount', label: t('marketplace_intent_you_receive'), value: satsValue(intent.sellerProceedsSats),
      emphasis: 'primary',
    },
    { kind: 'amount', label: t('marketplace_intent_offer_price'), value: satsValue(intent.priceSats) },
    {
      kind: 'amount', label: t('marketplace_intent_platform_fee'), value: satsValue(intent.platformFeeSats),
      description: t('marketplace_intent_deducted_from_seller_proceeds'),
    },
    {
      kind: 'amount', label: t('marketplace_intent_network_fee'), value: satsValue(intent.networkFeeSats),
      description: t('marketplace_intent_pays_for_two_transactions', grouped(intent.packageVsize)),
    },
    { kind: 'amount', label: t('marketplace_intent_utxo_returned'), value: satsValue(intent.utxoValueSats) },
  ];
  const offerAsset = provedQuantity ? `${provedQuantity} ${claim.asset}` : claim.asset;
  return {
    status,
    family: 'accept_policy_offer',
    ...ledgerBlockKind(blockers, ledger),
    ...(allProblems.length === 0 ? {
      paymentSummary,
      summary: { label: t('marketplace_intent_accept_offer'), description: offerAsset },
    } : {}),
    title: t('marketplace_intent_title_accept_price_for_asset', [satsValue(intent.priceSats), offerAsset]),
    facts: [
      ...paymentSummary,
      {
        kind: 'address' as const, label: t('marketplace_intent_delivery'), value: intent.delivery.address,
        description: t('marketplace_intent_asset_detaches_to_this_address'),
      },
    ],
    notices: allProblems.length > 0
      ? []
      : [{ severity: 'info', message: t('marketplace_intent_notice_accept_policy_offer') }],
    blockers: allProblems,
  };
}

export function analyzeMarketplaceIntent(input: MarketplaceAnalysisInput): MarketplaceApprovalReview {
  const review = analyzeMarketplaceIntentClaim(input);
  // An input the wallet never looked up because the transaction has too many can only ever read
  // as "retry", and retrying cannot clear it. Say what it is. Still blocked either way.
  if (review.status === 'retry' && input.attachedAssets.some(entry => entry.overLimit)) {
    return { ...review, status: 'blocked', blockKind: 'input_limit' };
  }
  return review;
}

function analyzeMarketplaceIntentClaim(input: MarketplaceAnalysisInput): MarketplaceApprovalReview {
  switch (input.intent.action) {
    case 'attach_for_listing':
    case 'prepare_asset':
      return analyzeAttachIntent(input, input.intent);
    case 'buy_listings':
      return analyzeBuyListingsIntent(input, input.intent);
    case 'create_listing':
      return analyzeCreateListingIntent(input, input.intent);
    case 'authorize_exact_offer':
    case 'accept_exact_offer':
      return analyzeExactOfferIntent(input, input.intent);
    case 'prepare_bulk_fanout':
      return analyzePrepareBulkFanoutIntent(input, input.intent);
    case 'fund_offers':
      return analyzeFundOffersIntent(input, input.intent);
    case 'fund_policy_offer':
      return analyzeFundPolicyOfferIntent(input, input.intent);
    case 'accept_policy_offer':
      return analyzeAcceptPolicyOfferIntent(input, input.intent);
  }
}
