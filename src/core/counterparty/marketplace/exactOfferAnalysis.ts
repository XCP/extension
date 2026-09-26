/** Exact-offer proofs: the bidder's authorization and the seller's acceptance of one transaction. */

import { sameAddress } from '@/core/bitcoin/address';
import type { ProtocolField } from '@/core/counterparty/describe';
import { formatExpiry, grouped, satsValue } from '@/core/counterparty/marketplace/format';
import type {
  AcceptExactOfferIntentClaim,
  AuthorizeExactOfferIntentClaim,
  MarketplaceAnalysisInput,
  MarketplaceApprovalReview,
} from '@/core/counterparty/marketplace/intentTypes';
import {
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

/**
 * Prove the fixed transaction shared by exact-offer authorization and unilateral acceptance.
 * The role changes, but the economics never do: buyer input 0 pays the exact price, seller input
 * 1 contributes the asset UTXO, output 0 applies the selected delivery, and output 1 returns
 * the seller asset UTXO plus price minus the miner fee. Both signatures bind the whole transaction.
 */
export function analyzeExactOfferIntent(
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
  const log = newProofLog();
  const { blockers, retry } = log;
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
  proveTxidClaim(log, transactionId, intent.expectedTxid, {
    unknown: 'the wallet could not establish the unsigned transaction id',
    differs: 'the unsigned transaction id differs from the exact authorization',
  });
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
  if (!signsExactly(signedInputs, [requestedInputIndex], [0x01])) {
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
  // The ledger-normalized amount, for display: the title only needs it on proved/caution, where
  // this lookup has succeeded — so the screen never has to show raw base units.
  const provedQuantity = proveAttachedAsset(log, balances.get(1), claim, sellerInputAssetMessages(1));

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

  proveActualFee(log, inputs.map(transactionInput => transactionInput.value), outputs, intent.networkFeeSats, {
    unauthenticated: 'the wallet could not authenticate every input value needed to prove the miner fee',
    differs: 'the actual miner fee differs from the exact-offer claim',
  });

  const allProblems = [...retry, ...blockers];
  const status = reviewStatus(log, authorizing ? 'caution' : 'proved');
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
    ...ledgerBlockKind(blockers, log.ledger),
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
