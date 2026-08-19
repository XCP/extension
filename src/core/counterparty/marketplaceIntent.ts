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

export type MarketplaceIntentClaimV1 = CreateListingIntentClaim;

export interface MarketplaceApprovalReview {
  status: 'proved' | 'caution' | 'retry' | 'blocked';
  family: 'create_listing';
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

/** Bound and copy the v1 wire claim. The result remains untrusted until analyzed. */
export function parseMarketplaceIntent(value: unknown): MarketplaceIntentClaimV1 {
  if (!isRecord(value)) throw new Error('marketplace intent must be an object');
  if (value.standard !== MARKETPLACE_INTENT_STANDARD || value.version !== 1) {
    throw new Error(`marketplace intent must use ${MARKETPLACE_INTENT_STANDARD} version 1`);
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

const sameAddress = (left: string | undefined, right: string) =>
  left !== undefined
  && normalizeAddressForComparison(left) === normalizeAddressForComparison(right);

/** Prove the seller's flexible listing authorization from independent transaction facts. */
export function analyzeMarketplaceIntent({
  intent,
  inputs,
  outputs,
  signedInputs,
  signerAddresses,
  attachedAssets,
  attachedAssetDestination,
  hasCounterpartyPayload,
}: MarketplaceAnalysisInput): MarketplaceApprovalReview {
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
    }
  }

  if (
    attachedAssetDestination?.destinationCommitted !== false
    || attachedAssetDestination?.mode !== 'flexible'
  ) {
    blockers.push('listing signature does not prove the expected buyer-selected delivery flexibility');
  }

  const allProblems = [...retry, ...blockers];
  const status = blockers.length > 0 ? 'blocked' : retry.length > 0 ? 'retry' : 'caution';
  return {
    status,
    family: 'create_listing',
    title: `List 1 ${claim.asset} for ${(intent.priceSats / 100_000_000).toFixed(8)} BTC`,
    facts: [
      { label: 'Seller receives', value: `${intent.guaranteedSellerPaymentSats.toLocaleString()} sats` },
      { label: 'Asset quantity', value: `${claim.quantityRaw} raw units` },
      { label: 'Delivery', value: 'Detached to the eventual buyer' },
      {
        label: 'Marketplace expiry',
        value: intent.marketplaceExpiresAt === null
          ? 'None requested'
          : new Date(intent.marketplaceExpiresAt * 1000).toLocaleString(),
      },
      { label: 'Bitcoin expiry', value: 'None — spend the asset UTXO to invalidate the signature' },
    ],
    notices: allProblems.length > 0
      ? []
      : [{
          severity: 'warning',
          message:
            'The buyer may add funding inputs and choose the detach destination. Your signature ' +
            'remains valid only when output 1 pays you the exact amount shown.',
        }],
    blockers: allProblems,
  };
}
