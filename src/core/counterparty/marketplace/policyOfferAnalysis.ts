/** `funded_policy_offer_v1` proofs: the bidder's funding parent and the seller's acceptance child. */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { decodeAddressFromScript, sameAddress } from '@/core/bitcoin/address';
import type { ProtocolField } from '@/core/counterparty/describe';
import {
  describeCanonicalPolicy,
  formatExpiry,
  grouped,
  policyOfferStandingNotice,
  satsValue,
} from '@/core/counterparty/marketplace/format';
import type {
  AcceptPolicyOfferIntentClaim,
  FundPolicyOfferIntentClaim,
  MarketplaceAnalysisInput,
  MarketplaceApprovalReview,
} from '@/core/counterparty/marketplace/intentTypes';
import { attempt, ledgerBlockKind, safeSum, sameOutpoint } from '@/core/counterparty/marketplace/proofs';
import {
  decodePolicyDetachScript,
  decodePolicyLeaf,
  encodePolicyLeaf,
  MAX_POLICY_PARENT_FEE_SATS,
  MAX_POLICY_PARENT_VSIZE,
  MIN_POLICY_PRICE_SATS,
  POLICY_ANCHOR_SATS,
  POLICY_CHANGE_DUST_SATS,
  POLICY_MAX_EXPIRY_SECONDS,
  POLICY_MIN_EXPIRY_SECONDS,
  POLICY_OFFER_LOCKTIME,
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
} from '@/core/counterparty/policyOffer';
import { t } from '@/i18n';

/** The wallet's own policy-offer context, never the site's. The clock defaults to the wallet's;
 * a missing origin or funding settlement stays missing and blocks. */
const policyWalletContext = (input: MarketplaceAnalysisInput) => ({
  origin: input.policyOffer?.origin,
  nowSeconds: input.policyOffer?.nowSeconds ?? Math.floor(Date.now() / 1000),
  fundingSettlement: input.policyOffer?.fundingSettlement,
});

/**
 * Prove one `fund_policy_offer` alternative (spec §11.1) from its own parent bytes.
 *
 * Nothing the bidder signs here is broadcast: the parent pays zero fee and cannot relay alone. What
 * the signature authorizes is the named market key's script path over the offer output, for as
 * long as the funding inputs stay unspent. So every term the market key could later exploit is
 * rebuilt by the wallet — the leaf from the displayed terms, the output key from the bidder's own
 * key, the change back to the bidder, the fee below dust — and the review names the market key
 * and the requesting site's verified origin.
 */
export function analyzeFundPolicyOfferIntent(
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

  const origin = context.origin;
  if (origin === undefined || origin === '') {
    blockers.push('the wallet could not establish the requesting site’s origin');
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
    // The leaf is rebuilt from the displayed terms and the displayed market key, never read back.
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
    // What this signature leaves standing, stated whenever the proof holds: the offer can be
    // filled without another prompt until it expires or a funding input is spent.
    notices: allProblems.length > 0 || !origin
      ? []
      : [{
          severity: 'warning',
          message: policyOfferStandingNotice(shown.expiresAt),
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
export function analyzeAcceptPolicyOfferIntent(
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
