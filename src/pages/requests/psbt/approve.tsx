import { useEffect, useState } from 'react';
import {ApprovalExpired, ApprovalFooter,
  ApprovalLoading, ApprovalNoWallet,ApprovalSiteBar, 
  ApprovalWalletHeader, 
} from '@/components/domain/approval/approval-chrome';
import { ApprovalSummaryCard } from '@/components/domain/approval/approval-summary-card';
import { buildApprovalWarnings } from '@/components/domain/approval/approval-warnings';
import { BitcoinPaymentCard } from '@/components/domain/approval/bitcoin-payment-card';
import { CounterpartyDetailsCard } from '@/components/domain/approval/counterparty-details-card';
import { MarketplaceReviewCard } from '@/components/domain/approval/marketplace-review-card';
import { computeMoneyMovement } from '@/components/domain/approval/money-movement';
import { buildOrderAction } from '@/components/domain/approval/order-card';
import { describePsbtFlexibility } from '@/components/domain/approval/psbt-flexibility';
import { VerificationDetails } from '@/components/domain/approval/verification-details';
import { getTxActionInfo } from '@/components/domain/tx/tx-action-info';
import { VerificationStatus } from '@/components/domain/tx/verification-status';
import { Collapsible } from '@/components/ui/collapsible';
import { ErrorAlert } from '@/components/ui/error-alert';
import { CheckboxInput } from '@/components/ui/inputs/checkbox-input';
import { type WarningItem, WarningStack } from '@/components/ui/warning-stack';
import { useHeader } from '@/contexts/header-context';
import { useSettings } from '@/contexts/settings-context';
import { useWallet } from '@/contexts/wallet-context';
import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { exceedsSaneFeeRate } from '@/core/bitcoin/feeVerification';
import { committedOutputIndices, resolvePsbtSighashType } from '@/core/bitcoin/psbt';
import { classifySignedInputAssets } from '@/core/counterparty/inputAssets';
import { shouldBlockSigning } from '@/core/counterparty/unpack/providerVerify';
import { formatAddress, formatAmount } from '@/core/format';
import { fromSatoshis, toFiniteNumber } from "@/core/numeric";
import { usePopupLifecycle } from '@/hooks/usePopupLifecycle';
import { useSignPsbtRequest } from '@/hooks/useSignPsbtRequest';
import { getIdentityMismatchError, getPsbtPermissionError } from '@/platform/provider/requestIdentity';
import { getConnectionService } from '@/services/connectionService';
import { getWalletService } from '@/services/walletService';

function formatSighashType(sighashType: number): string {
  switch (sighashType) {
    case 0x01: return 'ALL';
    case 0x81: return 'ALL | ANYONECANPAY';
    case 0x83: return 'SINGLE | ANYONECANPAY';
    default: return `0x${sighashType.toString(16)}`;
  }
}

export default function ApprovePsbtPage() {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const { setHeaderProps } = useHeader();
  const {
    request,
    decodedInfo,
    isLoading,
    error: loadError,
    handleSuccess,
    handleCancel,
  } = useSignPsbtRequest(activeAddress?.address);
  usePopupLifecycle(request?.id, 'sign-psbt');

  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string>('');
  const [acceptedAtRisk, setAcceptedAtRisk] = useState(false);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: request?.signingPurpose === 'bitcoin-payment'
        ? 'Send Bitcoin'
        : request?.marketplaceIntent?.action === 'attach_for_listing'
          ? 'Attach for Listing'
          : request?.marketplaceIntent?.action === 'create_listing'
            ? 'Create Listing'
            : request?.marketplaceIntent?.action === 'buy_listings'
              ? 'Buy Collectibles'
              : request?.marketplaceIntent?.action === 'authorize_exact_offer'
                ? 'Authorize Offer'
                : request?.marketplaceIntent?.action === 'accept_exact_offer'
                  ? 'Accept Offer'
                  : 'Sign Transaction',
    });
  }, [request?.marketplaceIntent?.action, request?.signingPurpose, setHeaderProps]);

  const handleSign = async () => {
    if (!request || !decodedInfo) return;

    const identityError = getIdentityMismatchError(request, activeAddress?.address, activeWallet?.id);
    if (identityError) {
      setError(identityError);
      return;
    }

    setIsSigning(true);
    setError('');

    try {
      const permissionError = await getPsbtPermissionError(
        request,
        activeAddress!.address,
        getConnectionService()
      );
      if (permissionError) throw new Error(permissionError);

      const walletService = getWalletService();
      const signedPsbtHex = await walletService.signPsbt(
        request.psbtHex,
        request.signInputs,
        request.sighashTypes
      );

      await handleSuccess(signedPsbtHex);
      window.close();
    } catch (err) {
      console.error('Failed to sign PSBT:', err);
      setError(err instanceof Error ? err.message : 'Failed to sign PSBT');
      setIsSigning(false);
    }
  };

  const handleReject = async () => {
    setIsSigning(true);
    try {
      await handleCancel();
      window.close();
    } catch (err) {
      console.error('Failed to cancel:', err);
      setIsSigning(false);
    }
  };

  if (isLoading) return <ApprovalLoading />;
  if (loadError || !request || !decodedInfo) return <ApprovalExpired message={loadError} />;
  if (!activeAddress || !activeWallet) return <ApprovalNoWallet />;

  const { psbtDetails, counterpartyMessage, txid, verification, safety, attachedAssets } = decodedInfo;
  const isBitcoinPayment = request.signingPurpose === 'bitcoin-payment';
  const semanticMarketplaceReview = decodedInfo.marketplaceReview?.status === 'proved'
    || decodedInfo.marketplaceReview?.status === 'caution';
  // The same card the raw-transaction screen shows, so an order looks identical whichever signing
  // method the site called.
  const order = buildOrderAction(decodedInfo);
  const txAction = order ? null : getTxActionInfo(decodedInfo, decodedInfo.protocolContext);
  const attachedByInput = new Map(attachedAssets.map((entry) => [entry.inputIndex, entry]));
  // Warn on the fee *rate* as well as its absolute size: a fee under the absolute ceiling can still
  // be absurd on a small transaction, and that case previously drew no warning at all. It warns
  // rather than blocks — an expensive transaction can be legitimate here, the transaction was built
  // elsewhere so the wallet cannot know the intent, and vsize is only estimated (the unsigned bytes
  // plus a signature allowance per input). Skipped when the PSBT is unfunded, where the fee is not
  // yet knowable because the other party supplies the inputs.
  const estimatedVsize = psbtDetails.rawTxHex
    ? psbtDetails.rawTxHex.length / 2 + psbtDetails.inputs.length * 110
    : undefined;
  const feeRateAbsurd = !psbtDetails.unfunded
    && exceedsSaneFeeRate(psbtDetails.fee, estimatedVsize);
  const hasHighFee = psbtDetails.fee > 10000000 || feeRateAbsurd; // > 0.1 BTC, or an absurd rate

  // Distinguish seller vs buyer in atomic swap PSBTs:
  // - Seller: the REQUEST asks the user to sign with ANYONECANPAY (0x80 bit set)
  // - Buyer: the PSBT contains an ANYONECANPAY input (seller's signature) but
  //   the user is signing with SIGHASH_ALL — they are completing the swap


  const verificationPassed = verification?.passed;
  const verificationWarning = verification?.warning;
  const isStrictMode = settings?.strictTransactionVerification !== false;
  const safetyBlocked = safety?.blocked ?? false;
  const safetyWarnings = safety?.warnings ?? [];
  // Shared with the raw-transaction approval screen so the two cannot drift.
  const blockSigning = shouldBlockSigning({
    safetyBlocked,
    verificationPassed,
    repackProved: verification?.repackProved ?? false,
    strictMode: isStrictMode,
  });
  const requestedAddressSpends = Object.entries(request.signInputs ?? {}).map(
    ([address, indices]) => ({
      address,
      indices,
      value: indices.reduce(
        (sum, index) => sum + (psbtDetails.inputs[index]?.value ?? 0),
        0
      ),
    })
  );
  // Without signInputs the signer works best-effort across every input with the active address's
  // key, so an input whose prevout address cannot be decoded may still be signed. Those count as
  // ours here, so their sighash reaches the at-risk calculation below.
  const requestedInputIndices = request.signInputs
    ? Object.values(request.signInputs).flat()
    : psbtDetails.inputs
        .filter(input => !input.address || normalizeAddressForComparison(input.address)
          === normalizeAddressForComparison(activeAddress.address))
        .map(input => input.index);
  const { withAssets: signedInputsWithAssets, unknownStatus: signedInputsUnknownStatus } =
    classifySignedInputAssets(attachedAssets, requestedInputIndices);
  const effectiveSighashes = requestedInputIndices.map(index => ({
    index,
    type: resolvePsbtSighashType(
      request.sighashTypes?.[index],
      psbtDetails.inputs[index]?.sighashType
    ),
  }));
  const anyoneCanPaySighashes = effectiveSighashes.filter(({ type }) => (type & 0x80) !== 0);
  const usesPairedAddress = requestedAddressSpends.some(
    ({ address }) => normalizeAddressForComparison(address)
      !== normalizeAddressForComparison(activeAddress.address)
  );
  const requestedSignerSet = new Set(
    requestedAddressSpends.map(({ address }) => normalizeAddressForComparison(address))
  );
  const spendableOutputs = psbtDetails.outputs.filter(output => output.type !== 'op_return');
  const externalOutputValue = spendableOutputs.every(output => Boolean(output.address))
    ? spendableOutputs.reduce(
        (sum, output) => requestedSignerSet.has(normalizeAddressForComparison(output.address!))
          ? sum
          : sum + output.value,
        0
      )
    : null;

  // Net effect of this transaction on your wallet — the money-movement summary,
  // computed structurally (replaces the old swap-detection heuristic; works for
  // any tx shape). "Your" addresses are the active address plus any paired signer.
  const myAddresses = [activeAddress.address, ...requestedAddressSpends.map((s) => s.address)];
  // Outputs the signature leaves free are not change coming back to you.
  const committedOutputs = committedOutputIndices(
    effectiveSighashes.map(({ index, type }) => ({ index, sighashType: type })),
    psbtDetails.outputs.length
  );
  const movement = computeMoneyMovement({
    inputs: psbtDetails.inputs,
    outputs: psbtDetails.outputs,
    myAddresses,
    fee: psbtDetails.fee,
    committedOutputs,
  });
  const flexibilityReview = describePsbtFlexibility(
    effectiveSighashes.map(({ index, type }) => ({ index, sighashType: type })),
    movement.atRisk
  );

  const warningItems: WarningItem[] = buildApprovalWarnings({
    safetyWarnings,
    attachedAssetDestination: semanticMarketplaceReview
      ? null
      : decodedInfo.attachedAssetDestination,
    structureFindings: decodedInfo.structureFindings ?? [],
    signedInputsWithAssets: semanticMarketplaceReview ? [] : signedInputsWithAssets,
    signedInputsUnknownStatus,
  });

  // PSBT-only: a raw transaction is signed SIGHASH_ALL throughout and cannot change after signing.
  if (flexibilityReview && !semanticMarketplaceReview) {
    // ALL|ANYONECANPAY commits every present output; SINGLE|ANYONECANPAY does not. Keep that
    // distinction visible so normal collaborative funding does not look like output redirection.
    warningItems.push({
      key: 'anyonecanpay',
      severity: flexibilityReview.severity,
      title: flexibilityReview.title,
      description: flexibilityReview.description,
      children: (
        <ul className="mt-2 space-y-1 text-xs font-medium">
          {anyoneCanPaySighashes.map(({ index, type }) => (
            <li key={index}>Input #{index}: {formatSighashType(type)}</li>
          ))}
        </ul>
      ),
    });
  }
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-4">
          <ApprovalWalletHeader walletName={activeWallet.name} address={activeAddress.address} />

          {usesPairedAddress && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-medium text-blue-900">Uses a paired wallet address</p>
              <p className="mt-1 text-xs text-blue-800">
                This request signs explicitly selected inputs from your paired Legacy and SegWit addresses.
              </p>
              <div className="mt-3 space-y-2">
                {requestedAddressSpends.map(({ address, indices, value }) => (
                  <div key={address} className="flex items-start justify-between gap-3 text-xs">
                    <div>
                      <p className="font-mono text-blue-900">{formatAddress(address, true)}</p>
                      <p className="text-blue-700">Inputs {indices.map(index => `#${index}`).join(', ')}</p>
                    </div>
                    <p className="font-medium text-blue-900">{value.toLocaleString()} sats</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between text-xs font-medium text-blue-900">
                <span>Network fee: {psbtDetails.fee.toLocaleString()} sats</span>
                <span>
                  External BTC: {externalOutputValue === null
                    ? 'unknown'
                    : `${externalOutputValue.toLocaleString()} sats`}
                </span>
              </div>
            </div>
          )}

          <ApprovalSiteBar origin={request.origin} />

          {isBitcoinPayment && request.bitcoinPaymentIntent && (
            <BitcoinPaymentCard
              intent={request.bitcoinPaymentIntent}
              proof={decodedInfo.bitcoinPaymentProof}
            />
          )}

          {decodedInfo.marketplaceReview && (
            <MarketplaceReviewCard review={decodedInfo.marketplaceReview} />
          )}

          {error && <ErrorAlert message={error} />}

          {/* Transaction action & fee */}
          <ApprovalSummaryCard
            unfunded={psbtDetails.unfunded}
            txAction={txAction}
            order={order}
            movement={movement}
            flexibility={semanticMarketplaceReview ? undefined : flexibilityReview?.kind}
            hasHighFee={hasHighFee}
            protocolFeeXcp={counterpartyMessage?.messageData?.fee != null
              ? toFiniteNumber(counterpartyMessage.messageData.fee) ?? null
              : null}
          />

          {/* Transaction Details (expandable) */}

          {txAction && 'protocol' in txAction && (
            <CounterpartyDetailsCard fields={txAction.protocol} />
          )}
          <Collapsible variant="card" title="Transaction Details">
                {/* TX Hash */}
                {txid && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">TX Hash</h4>
                    <div className="bg-gray-50 p-2 rounded text-xs text-gray-600 break-all">
                      {txid}
                    </div>
                  </div>
                )}

                {/* Inputs List */}
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Inputs ({psbtDetails.inputs.length})</h4>
                  <div className="space-y-2">
                    {psbtDetails.inputs.map((input) => {
                      const inputAssets = attachedByInput.get(input.index);
                      return (
                      <div key={input.index} className="bg-gray-50 p-2 rounded text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-600">#{input.index}</span>
                          {input.value !== undefined && (
                            <span className="text-gray-900 font-medium">{formatAmount({ value: fromSatoshis(input.value, true), minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC</span>
                          )}
                        </div>
                        {input.address && (
                          <div className="text-gray-500 truncate" title={input.address}>
                            {formatAddress(input.address, true)}
                          </div>
                        )}
                        <div className="text-gray-400 truncate" title={input.txid}>
                          {input.txid.slice(0, 8)}...:{input.vout}
                        </div>
                        {inputAssets?.assets.map((asset) => (
                          <div key={asset.asset} className="mt-1 flex justify-between text-purple-700">
                            <span className="truncate" title={asset.asset_longname ?? asset.asset}>
                              {asset.asset_longname ?? asset.asset}
                            </span>
                            <span className="font-medium flex-shrink-0 ml-2">{asset.quantity_normalized}</span>
                          </div>
                        ))}
                        {inputAssets?.lookupFailed && (
                          <div className="mt-1 text-amber-600">Asset status unavailable</div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>

                {/* Outputs List */}
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Outputs ({psbtDetails.outputs.length})</h4>
                  <div className="space-y-2">
                    {psbtDetails.outputs.map((output, idx) => (
                      <div key={idx} className="bg-gray-50 p-2 rounded text-xs">
                        <div className="flex justify-between">
                          <span className={`${output.type === 'op_return' ? 'text-purple-600' : 'text-gray-600'}`}>
                            {output.type === 'op_return' ? 'OP_RETURN' : output.type.toUpperCase()}
                          </span>
                          <span className="text-gray-900 font-medium">{formatAmount({ value: fromSatoshis(output.value, true), minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC</span>
                        </div>
                        {/* Shown in full and allowed to wrap - see the matching note in the
                            transaction approval screen. Outputs are where a site's transaction
                            sends money, so the whole address has to be comparable. */}
                        {output.address && (
                          <div className="text-gray-500 break-all font-mono" title={output.address}>
                            {formatAddress(output.address, false)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recipients of a multi-destination send. Carried in the payload rather than as
                    outputs, so the list above cannot show them and this is the only place they
                    appear — the same reason the transaction screen lists them. */}
                {decodedInfo.mpmaRecipients.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                      Recipients ({decodedInfo.mpmaRecipients.length})
                    </h4>
                    <div className="space-y-2">
                      {decodedInfo.mpmaRecipients.map((recipient, idx) => (
                        <div key={idx} className="bg-gray-50 p-2 rounded text-xs">
                          <div className="flex justify-between gap-2">
                            <span className="text-gray-600 truncate">{recipient.asset}</span>
                            <span className="text-gray-900 font-medium flex-shrink-0">
                              {recipient.quantity}
                            </span>
                          </div>
                          <div className="text-gray-500 break-all font-mono" title={recipient.address}>
                            {recipient.address}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <VerificationDetails verification={verification} />

          </Collapsible>

          {/* Warnings, rendered in a fixed severity order (danger → success) */}
          <WarningStack items={warningItems} />

          {/* Verification Status (compact badge when passed) */}
          {!isBitcoinPayment && !decodedInfo.marketplaceReview && (
            <VerificationStatus
              passed={verification?.repackProved ? true : verificationPassed}
              warning={verificationWarning}
              isStrict={isStrictMode}
            />
          )}

          {movement.atRisk > 0 && (
            <div className="rounded-lg border border-danger-200 bg-danger-50 p-3">
              <CheckboxInput
                name="acceptAtRisk"
                label={`I understand ${formatAmount({
                  value: fromSatoshis(movement.atRisk, true),
                  minimumFractionDigits: 8,
                  maximumFractionDigits: 8,
                })} BTC may not come back to me`}
                checked={acceptedAtRisk}
                onChange={setAcceptedAtRisk}
              />
            </div>
          )}
        </div>
      </div>

      <ApprovalFooter
        onCancel={handleReject}
        onSign={handleSign}
        busy={isSigning}
        blocked={blockSigning || (movement.atRisk > 0 && !acceptedAtRisk)}
        isHardware={activeWallet.type === 'hardware'}
      />
    </div>
  );
}
