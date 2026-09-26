/** Listing-side marketplace proofs: attach, flexible listing authorization, and buyer checkout. */

import { SigHash } from '@scure/btc-signer';
import { normalizeAddressForComparison, sameAddress } from '@/core/bitcoin/address';
import type { ProtocolField } from '@/core/counterparty/describe';
import { formatExpiry, formatXcpRaw, grouped, satsValue } from '@/core/counterparty/marketplace/format';
import type {
  AttachForListingIntentClaim,
  BuyListingsIntentClaim,
  CreateListingIntentClaim,
  MarketplaceAnalysisInput,
  MarketplaceApprovalReview,
  PrepareAssetIntentClaim,
} from '@/core/counterparty/marketplace/intentTypes';
import {
  blockOnLedger,
  ledgerBlockKind,
  newProofLog,
  proveActualFee,
  proveAttachedAsset,
  proveTxidClaim,
  reviewStatus,
  safeSum,
  sameOutpoint,
  sellerInputAssetMessages,
  signsExactly,
} from '@/core/counterparty/marketplace/proofs';
import { isRecord } from '@/core/isRecord';
import { t } from '@/i18n';

/** Prove the seller's flexible listing authorization from independent transaction facts. */
export function analyzeCreateListingIntent({
  inputs,
  outputs,
  signedInputs,
  signerAddresses,
  attachedAssets,
  attachedAssetDestination,
  hasCounterpartyPayload,
}: MarketplaceAnalysisInput, intent: CreateListingIntentClaim): MarketplaceApprovalReview {
  const log = newProofLog();
  const { blockers, retry } = log;
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

  if (!signsExactly(signedInputs, [1], [SigHash.SINGLE_ANYONECANPAY])) {
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
  const provedQuantity = proveAttachedAsset(log, balance, claim, {
    ...sellerInputAssetMessages(1),
    assetDiffers: 'attached asset name differs from the claim',
    noRawQuantity: 'the indexer did not return an exact raw attached quantity',
    quantityDiffers: 'attached asset raw quantity differs from the claim',
  });

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
    if (!balance || balance.assets.length !== 1) blockOnLedger(log, problem);
    else blockers.push(problem);
  }

  const allProblems = [...retry, ...blockers];
  const status = reviewStatus(log, 'proved');
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
    ...ledgerBlockKind(blockers, log.ledger),
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

/** Prove a full-input ALL-signed attach that creates one exact one-unit asset UTXO. */
export function analyzeAttachIntent(
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
  const log = newProofLog();
  const { blockers, retry } = log;
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

  proveTxidClaim(log, transactionId, intent.expectedAttachedOutpoint.txid, {
    unknown: 'the wallet could not establish the unsigned transaction id',
    differs: 'the unsigned transaction id differs from the expected attached outpoint',
  });
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
  if (!signsExactly(signedInputs, inputs.map((_, index) => index), [SigHash.ALL])) {
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

  proveActualFee(log, inputs.map(transactionInput => transactionInput.value), outputs, intent.networkFeeSats, {
    unauthenticated: 'the wallet could not authenticate every input value needed to prove the miner fee',
    differs: 'the actual Bitcoin miner fee differs from the claim',
  });

  const allProblems = [...retry, ...blockers];
  const status = reviewStatus(log, 'caution');
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
export function analyzeBuyListingsIntent(
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
  const log = newProofLog();
  const { blockers, retry } = log;
  const itemCount = intent.items.length;
  const firstAdditionalBuyerInput = itemCount + 1;
  const attachedDelivery = intent.delivery.mode === 'attached';
  const deliveryUtxoSats = intent.delivery.mode === 'attached'
    ? intent.delivery.utxoValueSats
    : 0;

  if (!sameAddress(intent.delivery.address, intent.buyer)) {
    blockers.push('the claimed delivery address differs from the claimed buyer');
  }
  proveTxidClaim(log, transactionId, intent.expectedTxid, {
    unknown: 'the wallet could not establish the unsigned transaction id',
    differs: 'the unsigned transaction id differs from the claim',
  });
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
  if (!signsExactly(signedInputs, expectedSignedIndices, [SigHash.ALL])) {
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

    proveAttachedAsset(log, balances.get(sellerInputIndex), item, {
      ...sellerInputAssetMessages(sellerInputIndex),
      notExactlyOne: `seller input ${sellerInputIndex} does not resolve to exactly one attached asset`,
    });
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

  proveActualFee(log, inputs.map(transactionInput => transactionInput.value), outputs, intent.networkFeeSats, {
    unauthenticated: 'the wallet could not authenticate every input value needed to prove the miner fee',
    differs: 'the actual miner fee differs from the claim',
  });

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
  const status = reviewStatus(log, 'proved');
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
    ...ledgerBlockKind(blockers, log.ledger),
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
