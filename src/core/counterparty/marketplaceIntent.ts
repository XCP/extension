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

export type MarketplaceIntentClaimV1 = CreateListingIntentClaim | BuyListingsIntentClaim;

export interface MarketplaceApprovalReview {
  status: 'proved' | 'caution' | 'retry' | 'blocked';
  family: 'create_listing' | 'buy_listings';
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

/** Bound and copy the v1 wire claim. The result remains untrusted until analyzed. */
export function parseMarketplaceIntent(value: unknown): MarketplaceIntentClaimV1 {
  if (!isRecord(value)) throw new Error('marketplace intent must be an object');
  if (value.standard !== MARKETPLACE_INTENT_STANDARD || value.version !== 1) {
    throw new Error(`marketplace intent must use ${MARKETPLACE_INTENT_STANDARD} version 1`);
  }
  if (value.action === 'buy_listings') return parseBuyListingsIntent(value);
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

const sameOutpoint = (
  input: InputLike | undefined,
  claim: MarketplaceOutpointClaim,
): boolean => input?.txid.toLowerCase() === claim.txid && input.vout === claim.vout;

const safeSum = (values: number[]): number | null => {
  const sum = values.reduce((total, value) => total + value, 0);
  return Number.isSafeInteger(sum) ? sum : null;
};

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
      { label: 'Seller subtotal', value: `${intent.subtotalSats.toLocaleString()} sats` },
      { label: 'Network fee', value: `${intent.networkFeeSats.toLocaleString()} sats` },
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

export function analyzeMarketplaceIntent(input: MarketplaceAnalysisInput): MarketplaceApprovalReview {
  return input.intent.action === 'buy_listings'
    ? analyzeBuyListingsIntent(input, input.intent)
    : analyzeCreateListingIntent(input, input.intent);
}
