/** Versioned Counterparty marketplace intent claims, as parsed from the wire, and their reviews. */

import type { AttachedAssetDestination } from '@/core/counterparty/attachedAssetMovement';
import type { ProtocolField } from '@/core/counterparty/describe';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';
import type { AttachInputSettlement } from '@/core/counterparty/marketplaceAttachLink';
import type {
  CanonicalPolicy,
  PLATFORM_FEE_BPS,
  PLATFORM_FEE_MIN_SATS,
  POLICY_ANCHOR_SATS,
  POLICY_OFFER_PROTOCOL_VERSION,
} from '@/core/counterparty/policyOffer';

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

export interface ExactOfferIntentBase<Action extends 'authorize_exact_offer' | 'accept_exact_offer'> {
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

export interface InputLike {
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

export interface OutputLike {
  index: number;
  type: string;
  address?: string;
  value: number;
  /** scriptPubKey hex, where the caller decoded it. */
  script?: string;
}

/**
 * Wallet-side facts a policy offer is proved against. Supplied only by wallet code, never by the
 * requesting site: the origin is the one the wallet's provider verified from the sender, the clock
 * is the wallet's, and the funding settlement is the wallet's own chain and ledger read
 * (`proveAttachInputsSettled`).
 */
export interface PolicyOfferWalletContext {
  /**
   * The requesting site's origin, as the wallet verified it from the message sender — never a
   * value the site wrote. Named on the review beside the market key; absent means unknown and blocks.
   */
  origin?: string;
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
