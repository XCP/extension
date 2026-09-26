/** Clean-BTC self-sends that prepare listing UTXOs or set aside exact-offer funding. */

import { SigHash } from '@scure/btc-signer';
import { sameAddress } from '@/core/bitcoin/address';
import type { ProtocolField } from '@/core/counterparty/describe';
import {
  clipDisplayText,
  formatExpiry,
  grouped,
  MAX_TARGET_COLLECTION_DISPLAY,
  MAX_TARGET_POLICY_DISPLAY,
  satsValue,
} from '@/core/counterparty/marketplace/format';
import type {
  FundOffersIntentClaim,
  MarketplaceAnalysisInput,
  MarketplaceApprovalReview,
  PrepareBulkFanoutIntentClaim,
} from '@/core/counterparty/marketplace/intentTypes';
import {
  newProofLog,
  proveActualFee,
  proveTxidClaim,
  reviewStatus,
  safeSum,
  sameOutpoint,
  signsExactly,
} from '@/core/counterparty/marketplace/proofs';
import { t } from '@/i18n';

/** Prove a clean-BTC parent that creates same-owner attach funding slots. */
export function analyzePrepareBulkFanoutIntent(
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
  const log = newProofLog();
  const { blockers, retry } = log;

  proveTxidClaim(log, transactionId, intent.expectedTxid, {
    unknown: 'the wallet could not establish the fan-out transaction id',
    differs: 'the fan-out transaction id differs from the claim',
  });
  if (hasCounterpartyPayload) {
    blockers.push('a funding fan-out must not carry a Counterparty payload');
  }
  if (inputs.length !== 1) {
    blockers.push(`expected exactly one fan-out funding input, got ${inputs.length}`);
  }
  if (!signsExactly(signedInputs, [0], [SigHash.ALL])) {
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
  // Only the one funding input's value: the retry for it being unknown is already raised above.
  proveActualFee(log, [fundingInput?.value], outputs, intent.networkFeeSats, {
    differs: 'the actual fan-out fee differs from the claim',
  });

  const allProblems = [...retry, ...blockers];
  return {
    status: reviewStatus(log, 'proved'),
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
export function analyzeFundOffersIntent(
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
  const log = newProofLog();
  const { blockers, retry } = log;

  proveTxidClaim(log, transactionId, intent.expectedTxid, {
    unknown: 'the wallet could not establish the offer funding transaction id',
    differs: 'the offer funding transaction id differs from the claim',
  });
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
    || signedInputs.some(entry => entry.sighashType !== SigHash.ALL)
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

  // Also the "set aside" total the review shows.
  const setAsideSats = safeSum(Array.from({ length: intent.slotCount }, () => intent.slotValueSats));
  const outputTotal = setAsideSats === null ? null : safeSum([setAsideSats, intent.changeSats]);
  const claimedFee = outputTotal === null ? null : intent.fundingValueSats - outputTotal;
  if (claimedFee === null || claimedFee < 0 || claimedFee !== intent.networkFeeSats) {
    blockers.push('the claimed offer funding fee does not equal funding minus outputs');
  }
  // Each unknown input value already raised its own retry above.
  proveActualFee(log, inputs.map(transactionInput => transactionInput.value), outputs, intent.networkFeeSats, {
    differs: 'the actual offer funding fee differs from the claim',
  });

  const allProblems = [...retry, ...blockers];
  const each = (label: string) => t('marketplace_intent_each_label', label);
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
    status: reviewStatus(log, 'proved'),
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
