/** A narrowly scoped exception for retiring offer funding coins, never a payment. */
import { SigHash } from '@scure/btc-signer';
import { sameAddress } from '@/core/bitcoin/address';
import { t } from '@/i18n';
import { satsValue } from './format';
import type { InvalidateOffersIntentClaim, MarketplaceAnalysisInput, MarketplaceApprovalReview } from './intentTypes';
import { newProofLog, proveActualFee, proveTxidClaim, reviewStatus, sameOutpoint, signsExactly } from './proofs';

export function analyzeInvalidateOffersIntent(
  input: MarketplaceAnalysisInput,
  intent: InvalidateOffersIntentClaim,
): MarketplaceApprovalReview {
  const log = newProofLog();
  const { blockers, retry } = log;
  const { inputs, outputs, signedInputs, signerAddresses } = input;
  proveTxidClaim(log, input.transactionId, intent.expectedTxid, {
    unknown: 'the wallet could not establish the invalidation transaction id',
    differs: 'the invalidation transaction id differs from the claim',
  });
  if (input.transactionVersion !== 2 || input.lockTime !== 0) blockers.push('invalidation requires version 2 and locktime 0');
  if (input.hasCounterpartyPayload) blockers.push('invalidation must not carry a Counterparty payload');
  if (signerAddresses.length !== 1 || !sameAddress(signerAddresses[0], intent.bidder)) blockers.push('invalidation must have exactly the claimed signer');
  if (!inputs.length || inputs.length !== intent.fundingInputs.length) blockers.push('invalidation inputs differ from the claim');
  if (!signsExactly(signedInputs, inputs.map((_, i) => i), [SigHash.ALL, SigHash.DEFAULT])) blockers.push('invalidation must sign every input once with ALL or Taproot DEFAULT');
  for (const [index, coin] of inputs.entries()) {
    const claim = intent.fundingInputs[index];
    if (!claim || !sameOutpoint(coin, claim)) blockers.push(`invalidation input ${index} differs from the claimed outpoint`);
    if (!sameAddress(coin.address, intent.bidder)) blockers.push(`invalidation input ${index} is not owned by the signer`);
    if (coin.scriptType !== 'p2wpkh' && coin.scriptType !== 'p2tr') blockers.push(`invalidation input ${index} must be Native SegWit or Taproot`);
    if (coin.scriptType !== 'p2tr' && signedInputs.some(signed => signed.index === index && signed.sighashType === SigHash.DEFAULT)) blockers.push('DEFAULT is valid only for Taproot');
    if (coin.value === undefined) retry.push(`invalidation input ${index} has no authenticated value`);
    else if (coin.value !== claim?.valueSats) blockers.push(`invalidation input ${index} value differs from the claim`);
    if (coin.hasSignatures !== false) blockers.push(`invalidation input ${index} must be unsigned`);
    const assets = input.attachedAssets.find(entry => entry.inputIndex === index);
    // The common lookup emits unknown/over-limit entries; absence means checked and empty.
    if (assets?.lookupFailed) retry.push(`invalidation input ${index} asset status is unknown`);
    if (assets?.assets.length) blockers.push(`invalidation input ${index} carries Counterparty assets`);
  }
  if (outputs.length !== 1 || !sameAddress(outputs[0]?.address, intent.bidder)
    || (outputs[0]?.type !== 'p2wpkh' && outputs[0]?.type !== 'p2tr')
    || outputs[0]?.value !== intent.returnSats) blockers.push('invalidation must return the claimed amount in one output to the signer');
  proveActualFee(log, inputs.map(coin => coin.value), outputs, intent.networkFeeSats, {
    differs: 'the invalidation network fee differs from the claim',
  });
  // Conservative lower bound on native-segwit vsize: this cannot permit a rate above 500 sat/vB.
  if (intent.networkFeeSats <= 0 || intent.networkFeeSats > 500 * (10 + 57 * inputs.length + 31)) blockers.push('invalidation network fee exceeds the wallet limit');
  const status = reviewStatus(log, 'proved');
  const facts = [
    { kind: 'amount' as const, label: t('marketplace_invalidation_return'), value: satsValue(intent.returnSats) },
    { kind: 'amount' as const, label: t('marketplace_intent_network_fee'), value: satsValue(intent.networkFeeSats) },
  ];
  return {
    status, family: 'invalidate_offers', title: t('marketplace_invalidation_title'), facts,
    ...(status === 'proved' ? { paymentSummary: facts } : {}),
    notices: [{ severity: 'info', message: t('marketplace_invalidation_notice') }],
    blockers: [...retry, ...blockers],
  };
}
