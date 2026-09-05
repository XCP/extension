/** Atomic wallet proof for an exact-offer acceptance parent and its seller-funded CPFP child. */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import type { MarketplaceBundleReview } from '@/core/counterparty/marketplaceBundleReview';
import {
  type AcceptExactOfferIntentClaim,
  type MarketplaceApprovalReview,
  type MarketplaceAssetClaim,
  parseMarketplaceIntent,
} from '@/core/counterparty/marketplaceIntent';
import { toFiniteNumber } from '@/core/numeric';

export interface BumpAcceptanceFeeIntentClaim {
  standard: 'counterparty-marketplace';
  version: 1;
  action: 'bump_acceptance_fee';
  operationId: string;
  protocolVersion: 'exact_offer_v1';
  assets: [MarketplaceAssetClaim];
  authorizationId: string;
  seller: string;
  parentExpectedTxid: string;
  childExpectedTxid: string;
  parentSellerProceedsVout: 1;
  parentSellerProceedsSats: number;
  parentNetworkFeeSats: number;
  childNetworkFeeSats: number;
  packageFeeSats: number;
  packageFeeRate: number;
  finalSellerProceedsSats: number;
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

export interface AcceptanceCpfpBundleAnalysisInput {
  parentIntent: AcceptExactOfferIntentClaim;
  parentReview: MarketplaceApprovalReview;
  childIntent: BumpAcceptanceFeeIntentClaim;
  childInputs: InputLike[];
  childOutputs: OutputLike[];
  childSignedInputs: Array<{ index: number; sighashType: number }>;
  childSignerAddresses: string[];
  childTransactionId?: string;
  childHasCounterpartyPayload: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const boundedString = (value: unknown, label: string, max = 160): string => {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new Error(`${label} must be a non-empty string of at most ${max} characters`);
  }
  return value;
};

const positiveInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
};

const nonNegativeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
};

const txid = (value: unknown, label: string): string => {
  const parsed = boundedString(value, label, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(parsed)) throw new Error(`${label} must be 32-byte hex`);
  return parsed;
};

const parseAsset = (value: unknown): MarketplaceAssetClaim => {
  if (!isRecord(value) || !isRecord(value.sourceOutpoint)) {
    throw new Error('bumpAcceptanceFee.assets[0] must carry a source outpoint');
  }
  const quantityRaw = boundedString(value.quantityRaw, 'quantityRaw', 24);
  if (!/^[1-9][0-9]*$/.test(quantityRaw)) {
    throw new Error('quantityRaw must be a positive base-unit integer string');
  }
  const vout = nonNegativeInteger(value.sourceOutpoint.vout, 'sourceOutpoint.vout');
  return {
    asset: boundedString(value.asset, 'asset', 250),
    quantityRaw,
    sourceOutpoint: {
      txid: txid(value.sourceOutpoint.txid, 'sourceOutpoint.txid'),
      vout,
    },
  };
};

/** Parse both untrusted request labels and require the only supported atomic bundle shape. */
export function parseAcceptanceCpfpBundleIntents(
  parentValue: unknown,
  childValue: unknown,
): {
  parent: AcceptExactOfferIntentClaim;
  child: BumpAcceptanceFeeIntentClaim;
} {
  const parent = parseMarketplaceIntent(parentValue);
  if (parent.action !== 'accept_exact_offer') {
    throw new Error('bundle request 0 must be accept_exact_offer');
  }
  if (!isRecord(childValue)) throw new Error('bundle request 1 intent must be an object');
  if (
    childValue.standard !== 'counterparty-marketplace'
    || childValue.version !== 1
    || childValue.action !== 'bump_acceptance_fee'
    || childValue.protocolVersion !== 'exact_offer_v1'
  ) {
    throw new Error('bundle request 1 must be counterparty-marketplace bump_acceptance_fee v1');
  }
  if (!Array.isArray(childValue.assets) || childValue.assets.length !== 1) {
    throw new Error('bump_acceptance_fee must claim exactly one asset');
  }
  if (childValue.parentSellerProceedsVout !== 1) {
    throw new Error('bump_acceptance_fee must spend parent seller-proceeds output 1');
  }
  const packageFeeRate = toFiniteNumber(childValue.packageFeeRate);
  if (packageFeeRate === undefined || packageFeeRate <= 0 || packageFeeRate > 500) {
    throw new Error('packageFeeRate must be a finite rate in (0, 500]');
  }

  return {
    parent,
    child: {
      standard: 'counterparty-marketplace',
      version: 1,
      action: 'bump_acceptance_fee',
      operationId: boundedString(childValue.operationId, 'operationId'),
      protocolVersion: 'exact_offer_v1',
      assets: [parseAsset(childValue.assets[0])],
      authorizationId: boundedString(childValue.authorizationId, 'authorizationId'),
      seller: boundedString(childValue.seller, 'seller', 128),
      parentExpectedTxid: txid(childValue.parentExpectedTxid, 'parentExpectedTxid'),
      childExpectedTxid: txid(childValue.childExpectedTxid, 'childExpectedTxid'),
      parentSellerProceedsVout: 1,
      parentSellerProceedsSats: positiveInteger(
        childValue.parentSellerProceedsSats,
        'parentSellerProceedsSats',
      ),
      parentNetworkFeeSats: nonNegativeInteger(
        childValue.parentNetworkFeeSats,
        'parentNetworkFeeSats',
      ),
      childNetworkFeeSats: positiveInteger(
        childValue.childNetworkFeeSats,
        'childNetworkFeeSats',
      ),
      packageFeeSats: positiveInteger(childValue.packageFeeSats, 'packageFeeSats'),
      packageFeeRate,
      finalSellerProceedsSats: positiveInteger(
        childValue.finalSellerProceedsSats,
        'finalSellerProceedsSats',
      ),
    },
  };
}

const sameAddress = (left: string | undefined, right: string): boolean =>
  left !== undefined
  && normalizeAddressForComparison(left) === normalizeAddressForComparison(right);

const sameAsset = (left: MarketplaceAssetClaim, right: MarketplaceAssetClaim): boolean =>
  left.asset === right.asset
  && left.quantityRaw === right.quantityRaw
  && left.sourceOutpoint.txid === right.sourceOutpoint.txid
  && left.sourceOutpoint.vout === right.sourceOutpoint.vout;

/** Prove both transactions before the approval page invokes either signer. */
export function analyzeAcceptanceCpfpBundle(
  input: AcceptanceCpfpBundleAnalysisInput,
): MarketplaceBundleReview {
  const { parentIntent, parentReview, childIntent } = input;
  const blockers: string[] = [];
  const retry: string[] = [];

  if (parentReview.status === 'retry') {
    retry.push(...parentReview.blockers.map(problem => `parent: ${problem}`));
  } else if (parentReview.status !== 'proved' || parentReview.family !== 'accept_exact_offer') {
    blockers.push(...(
      parentReview.blockers.length > 0
        ? parentReview.blockers.map(problem => `parent: ${problem}`)
        : ['the parent exact-offer acceptance did not independently prove']
    ));
  }
  if (
    childIntent.operationId !== parentIntent.operationId
    || childIntent.authorizationId !== parentIntent.authorizationId
  ) {
    blockers.push('parent and child do not identify the same exact authorization');
  }
  if (!sameAsset(childIntent.assets[0], parentIntent.assets[0])) {
    blockers.push('parent and child do not identify the same attached asset');
  }
  if (!sameAddress(childIntent.seller, parentIntent.seller)) {
    blockers.push('parent and child do not identify the same seller');
  }
  if (childIntent.parentExpectedTxid !== parentIntent.expectedTxid) {
    blockers.push('the child does not spend the exact reviewed parent transaction');
  }
  if (childIntent.parentSellerProceedsSats !== parentIntent.sellerProceedsSats) {
    blockers.push('the child parent value differs from the reviewed seller proceeds');
  }
  if (childIntent.parentNetworkFeeSats !== parentIntent.networkFeeSats) {
    blockers.push('the package parent fee differs from the reviewed acceptance fee');
  }

  if (input.childHasCounterpartyPayload) {
    blockers.push('the CPFP child must be an ordinary Bitcoin transaction with no Counterparty payload');
  }
  if (!input.childTransactionId) {
    retry.push('the wallet could not establish the child transaction id');
  } else if (input.childTransactionId.toLowerCase() !== childIntent.childExpectedTxid) {
    blockers.push('the child transaction id differs from the package claim');
  }
  if (input.childInputs.length !== 1 || input.childOutputs.length !== 1) {
    blockers.push(
      `expected a 1-input/1-output CPFP child, got ${input.childInputs.length}/${input.childOutputs.length}`,
    );
  }
  if (
    input.childSignedInputs.length !== 1
    || input.childSignedInputs[0]?.index !== 0
    || input.childSignedInputs[0]?.sighashType !== 0x01
  ) {
    blockers.push('the wallet must sign only child input 0 with ALL (0x01)');
  }
  if (
    input.childSignerAddresses.length !== 1
    || !sameAddress(input.childSignerAddresses[0], childIntent.seller)
  ) {
    blockers.push('the requested child signer is not exactly the accepting seller');
  }

  const childInput = input.childInputs[0];
  if (!childInput) {
    blockers.push('the CPFP child input is missing');
  } else {
    if (
      childInput.txid.toLowerCase() !== childIntent.parentExpectedTxid
      || childInput.vout !== childIntent.parentSellerProceedsVout
    ) {
      blockers.push('the child input is not parent seller-proceeds output 1');
    }
    if (!sameAddress(childInput.address, childIntent.seller)) {
      blockers.push('the child input is not controlled by the accepting seller');
    }
    if (childInput.value === undefined) {
      retry.push('the child input has no authenticated parent-output value');
    } else if (childInput.value !== childIntent.parentSellerProceedsSats) {
      blockers.push('the child input value differs from parent seller proceeds');
    }
    if (childInput.hasSignatures !== false) {
      blockers.push('the child input must be proven unsigned before bundle approval');
    }
  }

  const childOutput = input.childOutputs[0];
  if (!childOutput) {
    blockers.push('the seller-returning child output is missing');
  } else {
    if (childOutput.type === 'op_return' || !sameAddress(childOutput.address, childIntent.seller)) {
      blockers.push('the child output does not return to the accepting seller');
    }
    if (childOutput.value !== childIntent.finalSellerProceedsSats) {
      blockers.push('the child output differs from final seller proceeds');
    }
  }

  if (
    childIntent.parentSellerProceedsSats - childIntent.finalSellerProceedsSats
    !== childIntent.childNetworkFeeSats
  ) {
    blockers.push('the child fee does not equal parent proceeds minus final proceeds');
  }
  if (
    childIntent.parentNetworkFeeSats + childIntent.childNetworkFeeSats
    !== childIntent.packageFeeSats
  ) {
    blockers.push('the package fee does not equal parent plus child fees');
  }
  if (childInput?.value !== undefined && childOutput) {
    const actualChildFee = childInput.value - childOutput.value;
    if (actualChildFee < 0 || actualChildFee !== childIntent.childNetworkFeeSats) {
      blockers.push('the actual child miner fee differs from the package claim');
    }
  }

  const allProblems = [...retry, ...blockers];
  const status = blockers.length > 0 ? 'blocked' : retry.length > 0 ? 'retry' : 'proved';
  const claim = parentIntent.assets[0];
  return {
    status,
    family: 'accept_exact_offer_with_cpfp',
    title:
      `Accept ${(parentIntent.priceSats / 100_000_000).toFixed(8)} BTC for ${claim.asset}`
      + ' with fee bump',
    ...(status === 'proved' ? {
      bundleSummary: {
        outcome: {
          kind: 'amount' as const, label: 'Final proceeds',
          value: `${childIntent.finalSellerProceedsSats.toLocaleString()} sats`, emphasis: 'primary' as const,
        },
        action: `Accept offer for ${claim.asset}`,
        amounts: [
          { kind: 'amount' as const, label: 'Offer price', value: `${parentIntent.priceSats.toLocaleString()} sats` },
          { kind: 'amount' as const, label: 'UTXO returned', value: `${parentIntent.carrierValueSats.toLocaleString()} sats` },
          ...(parentIntent.platformFeeSats > 0 ? [{
            kind: 'amount' as const, label: 'Platform fee',
            value: `${parentIntent.platformFeeSats.toLocaleString()} sats`, description: 'Paid by the buyer',
          }] : []),
          { kind: 'amount' as const, label: 'Network fees', value: `${childIntent.packageFeeSats.toLocaleString()} sats` },
        ],
        timing: 'Both network fees are already deducted from your final proceeds.',
      },
    } : {}),
    facts: [
      {
        kind: 'amount', label: 'Your proceeds after fee bump',
        value: `${childIntent.finalSellerProceedsSats.toLocaleString()} sats`,
        emphasis: 'primary',
      },
      { kind: 'amount' as const, label: 'Offer price', value: `${parentIntent.priceSats.toLocaleString()} sats` },
      ...(parentIntent.platformFeeSats > 0 ? [{
        kind: 'amount' as const, label: 'Platform fee',
        value: `${parentIntent.platformFeeSats.toLocaleString()} sats`, description: 'Paid by the buyer',
      }] : []),
      { kind: 'amount' as const, label: 'Your UTXO sats returned', value: `${parentIntent.carrierValueSats.toLocaleString()} sats` },
      {
        kind: 'amount' as const, label: 'Parent seller proceeds',
        value: `${childIntent.parentSellerProceedsSats.toLocaleString()} sats`,
      },
      { kind: 'amount' as const, label: 'Parent fee', value: `${childIntent.parentNetworkFeeSats.toLocaleString()} sats` },
      { kind: 'amount' as const, label: 'Added child fee', value: `${childIntent.childNetworkFeeSats.toLocaleString()} sats` },
      { kind: 'amount' as const, label: 'Package fee', value: `${childIntent.packageFeeSats.toLocaleString()} sats` },
      { kind: 'amount' as const, label: 'Quoted package rate', value: `${childIntent.packageFeeRate.toFixed(2)} sat/vB` },
      {
        kind: 'address' as const, label: 'Delivery', value: parentIntent.delivery.address,
        description: parentIntent.delivery.mode === 'attached'
          ? `Asset stays attached to a ${parentIntent.delivery.carrierValueSats.toLocaleString()}-sat UTXO at this address`
          : 'Asset detaches to this address',
      },
    ],
    notices: allProblems.length > 0
      ? []
      : [{
          severity: 'info',
          message:
            'The parent completes the exact sale and the child spends only your parent proceeds back to you. Both transactions were proved before either signature is requested.',
        }],
    blockers: allProblems,
  };
}
