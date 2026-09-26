/** Execution policy for a website request. Presentation may add warnings, never remove these gates. */
import { SigHash } from '@scure/btc-signer';
import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { exceedsSaneFeeRate } from '@/core/bitcoin/feeVerification';
import { computeMoneyMovement } from '@/core/bitcoin/moneyMovement';
import { committedOutputIndices, resolvePsbtSighashType } from '@/core/bitcoin/psbt';
import type { DecodedPsbtInfo } from '@/core/bitcoin/psbtApprovalDecoder';
import type { DecodedPsbtBundleInfo, PsbtBundleApprovalInput } from '@/core/bitcoin/psbtBundleApprovalDecoder';
import { HIGH_ABSOLUTE_FEE_SATS, hasHighPsbtFee } from '@/core/bitcoin/signedVsize';
import type { DecodedTransactionInfo } from '@/core/bitcoin/transactionApprovalDecoder';
import { findUncommittedAssetSignatures } from '@/core/counterparty/durableSellAuthorization';
import { classifySignedInputAssets } from '@/core/counterparty/inputAssets';
import { marketplaceReviewRequiresAcknowledgement } from '@/core/counterparty/marketplaceReviewPolicy';
import type { SignRequestAnalysis } from '@/core/counterparty/signRequestAnalysis';
import type { SecurityWarning } from '@/core/counterparty/transactionSafety';
import { shouldBlockSigning } from '@/core/counterparty/unpack/providerVerify';
import { formatAmount } from '@/core/format';

export interface ProviderApprovalPolicy {
  blocked: boolean;
  /**
   * Set on a blocked policy when some of the block is data the wallet could not look up (an
   * input's attached assets, or a marketplace proof left at "retry"). Signing is refused all the
   * same; the flag only lets the refusal say "retry" instead of "did not verify".
   */
  retry?: true;
  requiresAcknowledgement: boolean;
  safeOwnChange: boolean;
}

function policy(
  analysis: SignRequestAnalysis,
  signedInputs: Array<{ index: number; sighashType: number }>,
  strictMode: boolean,
  hasHighFee: boolean,
  flexibleFunds: boolean,
): ProviderApprovalPolicy {
  const indices = signedInputs.map(input => input.index);
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
  const marketplaceWarning = marketplaceReviewRequiresAcknowledgement(marketplace);
  const verificationException = analysis.verification.passed === false
    && analysis.verification.repackProved !== true && !strictMode;
  const blocked = shouldBlockSigning({
    safetyBlocked: analysis.safety.blocked,
    verificationPassed: analysis.verification.passed,
    repackProved: analysis.verification.repackProved ?? false,
    strictMode,
  }) || assets.unknownStatus.length > 0 || analysis.structureFindings.length > 0
    || marketplace?.status === 'blocked' || marketplace?.status === 'retry'
    // Recomputed here rather than trusted from the analysis warning, so the signer refuses a
    // durable sell authorization even if a presentation filter ever dropped that warning.
    || findUncommittedAssetSignatures(analysis.attachedAssets, signedInputs, marketplace).length > 0;
  // An input past the lookup cap is unknown for good; retrying cannot clear it.
  const retry = assets.unknownStatus.some(entry => !entry.overLimit) || marketplace?.status === 'retry';
  return {
    blocked,
    ...(blocked && retry ? { retry: true as const } : {}),
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
  return policy(decoded, sighashes, strictMode, hasHighPsbtFee(details, fastestFee),
    movement.atRisk > 0 || sighashes.some(input => input.sighashType === SigHash.SINGLE_ANYONECANPAY));
}

/** Semantic bundle proofs supplement the ordinary signing policy; they cannot replace it. */
export function getPsbtBundleApprovalPolicy(
  request: PsbtBundleApprovalInput & { address: string },
  decoded: DecodedPsbtBundleInfo,
  strictMode: boolean,
  fastestFee?: number,
): { policy: ProviderApprovalPolicy; warnings: SecurityWarning[] } {
  const result: ProviderApprovalPolicy = {
    blocked: decoded.review.status === 'blocked' || decoded.review.status === 'retry'
      || decoded.items.length !== request.items.length || decoded.items.length === 0,
    requiresAcknowledgement: false,
    safeOwnChange: false,
  };
  const warnings: SecurityWarning[] = [];
  for (const [index, item] of decoded.items.entries()) {
    const requestItem = request.items[index];
    if (!requestItem) { result.blocked = true; continue; }
    const itemWarnings: SecurityWarning[] = [];
    let itemPolicy: ProviderApprovalPolicy;
    if ('safety' in item) {
      itemPolicy = getPsbtApprovalPolicy({ ...requestItem, address: request.address }, item, strictMode, fastestFee);
      itemWarnings.push(...item.safety.warnings.filter(warning =>
        warning.severity === 'block' || warning.severity === 'warning' || warning.severity === 'danger'));
      itemWarnings.push(...item.structureFindings.map(finding => ({ ...finding, severity: 'block' as const })));
      const unknown = classifySignedInputAssets(item.attachedAssets, Object.values(requestItem.signInputs).flat()).unknownStatus;
      if (unknown.length) itemWarnings.push({ severity: 'block', title: 'Asset status unavailable',
        message: 'Retry verification before signing; the wallet could not check assets on every requested input.' });
      if (item.verification.passed === false && !item.verification.repackProved) {
        itemWarnings.push({ severity: strictMode ? 'block' : 'warning', title: 'Transaction details did not verify',
          message: item.verification.warning ?? 'The wallet could not reproduce every transaction field.' });
      }
    } else {
      // This one child spends the proved parent's asset-free seller proceeds back to the
      // seller. Its exact linked proof replaces an impossible pre-broadcast ledger lookup.
      const provedCpfpChild = request.bundleKind === 'acceptance-cpfp' && index === 1
        && request.items.length === 2 && requestItem.marketplaceIntent.action === 'bump_acceptance_fee'
        && decoded.review.status === 'proved';
      itemPolicy = { blocked: !provedCpfpChild, requiresAcknowledgement: false, safeOwnChange: false };
    }
    if (hasHighPsbtFee(item.psbtDetails, fastestFee)) {
      itemPolicy.requiresAcknowledgement = true;
      itemWarnings.push({ severity: 'warning', title: 'Unusually high network fee',
        message: `This transaction pays ${formatAmount({ value: item.psbtDetails.fee, maximumFractionDigits: 0 })} sats. Confirm that this fee is intentional.` });
    }
    if (itemPolicy.blocked && !itemWarnings.some(warning => warning.severity === 'block')) {
      itemWarnings.push({ severity: 'block', title: 'Transaction did not pass verification',
        message: item.marketplaceReview?.blockers.join('; ') || 'The required transaction safety proof is missing.' });
    }
    if (itemPolicy.requiresAcknowledgement && !itemWarnings.some(warning => warning.severity === 'warning' || warning.severity === 'danger')) {
      itemWarnings.push({ severity: 'warning', title: 'Review transaction risks',
        message: item.marketplaceReview?.notices.map(notice => notice.message).join(' ') || 'Review this transaction’s authorization before signing.' });
    }
    result.blocked ||= itemPolicy.blocked;
    if (itemPolicy.retry) result.retry = true;
    result.requiresAcknowledgement ||= itemPolicy.requiresAcknowledgement;
    warnings.push(...itemWarnings.map(warning => ({ ...warning, title: `Transaction ${index + 1}: ${warning.title}` })));
  }
  if (decoded.review.status === 'retry') result.retry = true;
  if (!result.blocked) delete result.retry;
  return { policy: result, warnings };
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
  // A raw transaction is signed SIGHASH_ALL throughout.
  const result = policy(decoded, indices.map(index => ({ index, sighashType: SigHash.ALL })), strictMode,
    decoded.fee > HIGH_ABSOLUTE_FEE_SATS || exceedsSaneFeeRate(decoded.fee, decoded.vsize, fastestFee), false);
  return { ...result, blocked: result.blocked || unresolved || decoded.fee < 0 || indices.length === 0,
    safeOwnChange: result.safeOwnChange && indices.length === decoded.inputs.length };
}
