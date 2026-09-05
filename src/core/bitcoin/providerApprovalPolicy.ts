/** Execution policy for a website request. Presentation may add warnings, never remove these gates. */
import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { exceedsSaneFeeRate } from '@/core/bitcoin/feeVerification';
import { computeMoneyMovement } from '@/core/bitcoin/moneyMovement';
import { committedOutputIndices, resolvePsbtSighashType } from '@/core/bitcoin/psbt';
import type { DecodedPsbtInfo } from '@/core/bitcoin/psbtApprovalDecoder';
import type { DecodedTransactionInfo } from '@/core/bitcoin/transactionApprovalDecoder';
import { classifySignedInputAssets } from '@/core/counterparty/inputAssets';
import type { SignRequestAnalysis } from '@/core/counterparty/signRequestAnalysis';
import { shouldBlockSigning } from '@/core/counterparty/unpack/providerVerify';

export interface ProviderApprovalPolicy {
  blocked: boolean;
  requiresAcknowledgement: boolean;
  safeOwnChange: boolean;
}

function policy(
  analysis: SignRequestAnalysis,
  indices: number[],
  strictMode: boolean,
  hasHighFee: boolean,
  flexibleFunds: boolean,
): ProviderApprovalPolicy {
  const assets = classifySignedInputAssets(analysis.attachedAssets, indices);
  const semantic = analysis.marketplaceReview?.status === 'proved'
    || analysis.marketplaceReview?.status === 'caution';
  const destination = semantic ? null : analysis.attachedAssetDestination;
  const warning = analysis.safety.warnings.some(item =>
    !(destination && item.code === 'detach_all')
    && (item.severity === 'warning' || item.severity === 'danger'));
  const assetWarning = !semantic && (destination
    ? !destination.destinationCommitted || destination.leavesWallet
    : assets.withAssets.length > 0);
  const marketplace = analysis.marketplaceReview;
  const marketplaceWarning = marketplace?.status === 'caution'
    && marketplace.family !== 'attach_for_listing' && marketplace.family !== 'prepare_asset';
  const verificationException = analysis.verification.passed === false
    && analysis.verification.repackProved !== true && !strictMode;
  return {
    blocked: shouldBlockSigning({
      safetyBlocked: analysis.safety.blocked,
      verificationPassed: analysis.verification.passed,
      repackProved: analysis.verification.repackProved ?? false,
      strictMode,
    }) || assets.unknownStatus.length > 0 || analysis.structureFindings.length > 0
      || marketplace?.status === 'blocked' || marketplace?.status === 'retry',
    requiresAcknowledgement: warning || assetWarning || marketplaceWarning
      || verificationException || hasHighFee || (!semantic && flexibleFunds),
    safeOwnChange: assets.withAssets.length === 0 && assets.unknownStatus.length === 0,
  };
}

export function getPsbtApprovalPolicy(
  request: { address: string; signInputs?: Record<string, number[]>; sighashTypes?: number[] },
  decoded: DecodedPsbtInfo,
  strictMode: boolean,
  fastestFee?: number,
): ProviderApprovalPolicy {
  const details = decoded.psbtDetails;
  const indices = request.signInputs ? Object.values(request.signInputs).flat()
    : details.inputs.filter(input => !input.address || normalizeAddressForComparison(input.address)
      === normalizeAddressForComparison(request.address)).map(input => input.index);
  const sighashes = indices.map(index => ({ index, sighashType: resolvePsbtSighashType(
    request.sighashTypes?.[index], details.inputs[index]?.sighashType,
  ) }));
  const movement = computeMoneyMovement({
    inputs: details.inputs, outputs: details.outputs,
    myAddresses: [request.address, ...Object.keys(request.signInputs ?? {})],
    fee: details.fee, committedOutputs: committedOutputIndices(sighashes, details.outputs.length),
  });
  const vsize = details.rawTxHex ? details.rawTxHex.length / 2 + details.inputs.length * 110 : undefined;
  const highFee = details.fee > 10_000_000 || (!details.unfunded
    && exceedsSaneFeeRate(details.fee, vsize, fastestFee));
  return policy(decoded, indices, strictMode, highFee,
    movement.atRisk > 0 || sighashes.some(input => input.sighashType === 0x83));
}

export function getTransactionApprovalPolicy(
  request: { address: string },
  decoded: DecodedTransactionInfo,
  strictMode: boolean,
  fastestFee?: number,
): ProviderApprovalPolicy {
  // An unattributed input cannot silently be excluded from the asset/fee review.
  const unresolved = decoded.inputs.some(input => input.value === undefined || !input.address);
  const indices = decoded.inputs.flatMap((input, index) => input.address
    && normalizeAddressForComparison(input.address) === normalizeAddressForComparison(request.address)
    ? [index] : []);
  const result = policy(decoded, indices, strictMode,
    decoded.fee > 10_000_000 || exceedsSaneFeeRate(decoded.fee, decoded.vsize, fastestFee), false);
  return { ...result, blocked: result.blocked || unresolved || decoded.fee < 0 || indices.length === 0,
    safeOwnChange: result.safeOwnChange && indices.length === decoded.inputs.length };
}
