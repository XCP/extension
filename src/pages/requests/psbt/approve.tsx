import { useEffect, useState } from 'react';
import {ApprovalExpired, ApprovalFooter,
  ApprovalLoading, ApprovalNoWallet,ApprovalSiteBar, 
  ApprovalWalletHeader, 
} from '@/components/domain/approval/approval-chrome';
import { ApprovalSummaryCard } from '@/components/domain/approval/approval-summary-card';
import { computeMoneyMovement } from '@/components/domain/approval/money-movement';
import { buildOrderAction } from '@/components/domain/approval/order-card';
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
import { fromSatoshis } from '@/core/numeric';
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
      title: "Sign Transaction",
    });
  }, [setHeaderProps]);

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
  const userSignsWithAnyoneCanPay = anyoneCanPaySighashes.length > 0;
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

  const warningItems: WarningItem[] = safetyWarnings.map((warning, idx) => ({
    key: `safety-${idx}`,
    severity: warning.severity === 'block' ? 'danger' : warning.severity,
    title: warning.title,
    description: warning.message,
  }));
  // Where the attached assets land. Spending an attached UTXO moves its balances with no
  // Counterparty message, so without this the screen can say only that assets move, never where —
  // and for an atomic swap that is the whole question.
  if (decodedInfo.attachedAssetDestination) {
    const dest = decodedInfo.attachedAssetDestination;
    warningItems.push({
      key: 'attached-destination',
      severity: dest.leavesWallet ? 'danger' : 'warning',
      title: dest.detaches
        ? 'Attached assets are detached to your address'
        : dest.leavesWallet
          ? 'Attached assets leave your wallet'
          : 'Attached assets move to your own output',
      description: dest.detaches
        ? 'This transaction has no ordinary output, so every asset attached to the inputs you are ' +
          'signing is credited back to your address.'
        : `Every asset attached to input${dest.sourceInputs.length === 1 ? '' : 's'} ` +
          `${dest.sourceInputs.map((i) => `#${i}`).join(', ')} is credited to output ` +
          `#${dest.destinationVout}${dest.destinationAddress ? ` (${dest.destinationAddress})` : ''}` +
          `${dest.leavesWallet ? ', which is not an address you control.' : '.'}`,
    });
  }

  // Message fields that reference this transaction and do not resolve against it.
  for (const [idx, finding] of (decodedInfo.structureFindings ?? []).entries()) {
    warningItems.push({
      key: `structure-${idx}`,
      severity: 'warning',
      title: finding.title,
      description: finding.message,
    });
  }

  if (signedInputsWithAssets.length > 0) {
    warningItems.push({
      key: 'attached-assets',
      severity: 'warning',
      title: 'Spends UTXOs holding Counterparty assets',
      description: 'Inputs you are signing carry attached assets. Signing moves them, not just BTC.',
      children: (
        <ul className="mt-2 space-y-1 text-xs font-medium">
          {signedInputsWithAssets.flatMap(entry =>
            entry.assets.map(asset => (
              <li key={`${entry.inputIndex}-${asset.asset}`}>
                Input #{entry.inputIndex}: {asset.quantity_normalized} {asset.asset_longname ?? asset.asset}
              </li>
            ))
          )}
        </ul>
      ),
    });
  }
  if (signedInputsUnknownStatus.length > 0) {
    warningItems.push({
      key: 'unknown-status',
      severity: 'warning',
      title: "Couldn't verify asset status",
      description: `The balance lookup failed for ${signedInputsUnknownStatus.length === 1 ? 'an input' : 'some inputs'} you are signing, so attached Counterparty assets can't be confirmed either way. Proceed only if you trust this transaction.`,
      children: (
        <ul className="mt-2 space-y-1 text-xs font-medium">
          {signedInputsUnknownStatus.map(entry => (
            <li key={entry.inputIndex}>Input #{entry.inputIndex}: status unknown</li>
          ))}
        </ul>
      ),
    });
  }
  if (userSignsWithAnyoneCanPay) {
    // Money the signature leaves redirectable is a different order of risk from a transaction that
    // can merely gain inputs, so it reads as danger rather than caution.
    const redirectable = movement.atRisk > 0;
    warningItems.push({
      key: 'anyonecanpay',
      severity: redirectable ? 'danger' : 'warning',
      title: redirectable ? 'Some of your funds can be redirected' : 'This transaction can still change',
      description: redirectable
        ? 'Part of the amount shown returning to your wallet can be sent somewhere else after you sign. Only approve this if you trust the site with that amount.'
        : 'Inputs or outputs can be added after you sign. Check the amounts above before approving.',
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

          {error && <ErrorAlert message={error} />}

          {/* Transaction action & fee */}
          <ApprovalSummaryCard
            unfunded={psbtDetails.unfunded}
            txAction={txAction}
            order={order}
            movement={movement}
            flexible={userSignsWithAnyoneCanPay}
            hasHighFee={hasHighFee}
            protocolFeeXcp={counterpartyMessage?.messageData?.fee != null ? Number(counterpartyMessage.messageData.fee) : null}
          />

          {/* Transaction Details (expandable) */}

          {/* What the Counterparty message itself says, kept apart from the Bitcoin view below.
              The headline is one line and loses most of it — a fairminter's headline is its asset
              name, while the thing being agreed to is a set of caps, a price and a deadline. */}
          {txAction && 'protocol' in txAction && txAction.protocol.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Counterparty Details</h3>
              <div className="space-y-1.5">
                {txAction.protocol.map((field) => {
                  /* A hash or an outpoint does not fit on a row beside its label: right-aligned it
                     wrapped into three ragged lines that nobody can read across. Long values get
                     their own line in monospace, where the digits line up and can be compared. */
                  const isLong = field.value.length > 32;
                  return isLong ? (
                    <div key={field.label} className="text-sm">
                      <div className="text-gray-500">{field.label}</div>
                      <div className="text-gray-900 font-mono text-xs break-all mt-0.5">
                        {field.value}
                      </div>
                    </div>
                  ) : (
                    <div key={field.label} className="flex justify-between gap-3 text-sm">
                      <span className="text-gray-500 flex-shrink-0">{field.label}</span>
                      <span className="text-gray-900 font-medium text-right break-all">
                        {field.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
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

          </Collapsible>

          {/* Warnings, rendered in a fixed severity order (danger → success) */}
          <WarningStack items={warningItems} />

          {/* Verification Status (compact badge when passed) */}
          <VerificationStatus
            passed={verification?.repackProved ? true : verificationPassed}
            warning={verificationWarning}
            isStrict={isStrictMode}
          />

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
