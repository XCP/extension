import { useState, useEffect } from 'react';
import { FiChevronDown, FiChevronUp } from '@/components/icons';
import { ErrorAlert } from '@/components/ui/error-alert';
import { VerificationStatus } from '@/components/domain/tx/verification-status';
import { formatAddress, formatAmount } from '@/utils/format';
import { fromSatoshis } from '@/utils/numeric';
import { useWallet } from '@/contexts/wallet-context';
import { getIdentityMismatchError, getPsbtPermissionError } from '@/utils/provider/requestIdentity';
import { usePopupLifecycle } from '@/hooks/usePopupLifecycle';
import { useSettings } from '@/contexts/settings-context';
import { useHeader } from '@/contexts/header-context';
import { useSignPsbtRequest } from '@/hooks/useSignPsbtRequest';
import { getWalletService } from '@/services/walletService';
import { getConnectionService } from '@/services/connectionService';
import { normalizeAddressForComparison } from '@/utils/blockchain/bitcoin/address';
import { resolvePsbtSighashType } from '@/utils/blockchain/bitcoin/psbt';
import { classifySignedInputAssets } from '@/utils/blockchain/counterparty/inputAssets';
import { WarningStack, type WarningItem } from '@/components/ui/warning-stack';
import { getTxActionInfo } from '@/components/domain/tx/txActionInfo';
import {
  ApprovalLoading, ApprovalExpired, ApprovalNoWallet,
  ApprovalWalletHeader, ApprovalSiteBar, ApprovalFooter,
} from '@/components/domain/approval/approval-chrome';

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
    isProviderRequest
  } = useSignPsbtRequest(activeAddress?.address);
  usePopupLifecycle(request?.id, 'sign-psbt');

  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string>('');
  const [showDetails, setShowDetails] = useState(false);

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
  const txAction = getTxActionInfo(decodedInfo);
  const attachedByInput = new Map(attachedAssets.map((entry) => [entry.inputIndex, entry]));
  const hasHighFee = psbtDetails.fee > 10000000; // > 0.1 BTC fee

  // Distinguish seller vs buyer in atomic swap PSBTs:
  // - Seller: the REQUEST asks the user to sign with ANYONECANPAY (0x80 bit set)
  // - Buyer: the PSBT contains an ANYONECANPAY input (seller's signature) but
  //   the user is signing with SIGHASH_ALL — they are completing the swap


  const verificationPassed = verification?.passed;
  const verificationWarning = verification?.warning;
  const verificationFailed = verificationPassed === false;
  const isStrictMode = settings?.strictTransactionVerification !== false;
  const safetyBlocked = safety?.blocked ?? false;
  const safetyWarnings = safety?.warnings ?? [];
  const shouldBlockSigning = safetyBlocked || (isStrictMode && verificationFailed);
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
  const requestedInputIndices = request.signInputs
    ? Object.values(request.signInputs).flat()
    : psbtDetails.inputs
        .filter(input => input.address && normalizeAddressForComparison(input.address)
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

  // Detect swap buy PSBT fee breakdown (buyer completing a swap):
  // The PSBT has the seller's ANYONECANPAY input, but the USER is not signing
  // with ANYONECANPAY (they sign with ALL). Output pattern:
  //   Output 0 = seller payment, Output 1 = dust to buyer (546), Output 2 = platform fee
  const swapFeeBreakdown = (() => {
    if (txAction || userSignsWithAnyoneCanPay || counterpartyMessage) return null;
    const outputs = psbtDetails.outputs;
    if (outputs.length < 3) return null;

    const signerAddr = activeAddress?.address;
    const sellerOutput = outputs[0]!;
    const dustOutput = outputs[1]!;
    const feeOutput = outputs[2]!;

    // Validate pattern: dust output should be 546 sats to the signer address
    if (dustOutput.value !== 546) return null;
    if (dustOutput.address && signerAddr && dustOutput.address !== signerAddr) return null;

    // Fee output should be to neither the seller nor the buyer address
    if (!feeOutput.address) return null;
    if (feeOutput.address === signerAddr) return null;
    if (feeOutput.address === sellerOutput.address) return null;

    return {
      sellerPayment: sellerOutput.value,
      sellerAddress: sellerOutput.address,
      platformFee: feeOutput.value,
      platformAddress: feeOutput.address,
      networkFee: psbtDetails.fee,
    };
  })();

  const warningItems: WarningItem[] = safetyWarnings.map((warning, idx) => ({
    key: `safety-${idx}`,
    severity: warning.severity === 'block' ? 'danger' : warning.severity,
    title: warning.title,
    description: warning.message,
  }));
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
    warningItems.push({
      key: 'anyonecanpay',
      severity: 'warning',
      title: 'Flexible signature rules',
      description: 'ANYONECANPAY allows other inputs to be added or removed after you sign. SINGLE commits only to the output at the same input index. Review the paired inputs and outputs carefully.',
      children: (
        <ul className="mt-2 space-y-1 text-xs font-medium">
          {anyoneCanPaySighashes.map(({ index, type }) => (
            <li key={index}>Input #{index}: {formatSighashType(type)}</li>
          ))}
        </ul>
      ),
    });
  }
  if (swapFeeBreakdown) {
    warningItems.push({
      key: 'swap',
      severity: 'success',
      title: 'Atomic Swap Purchase',
      description: "You are completing an atomic swap. The seller's UTXO asset will transfer to you upon broadcast.",
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
          <div className="bg-white rounded-lg shadow-sm p-5">
            <div className="text-center mb-3">
              {txAction ? (
                <>
                  <p className="text-xs text-gray-500 mb-1">{txAction.label}</p>
                  <p className="text-lg font-bold text-gray-900">{txAction.description}</p>
                </>
              ) : userSignsWithAnyoneCanPay ? (
                <>
                  <p className="text-xs text-gray-500 mb-1">Atomic Swap Listing</p>
                  <p className="text-lg font-bold text-gray-900">
                    {formatAmount({
                      value: fromSatoshis(psbtDetails.outputs[0]?.value ?? 0, true),
                      minimumFractionDigits: 8,
                      maximumFractionDigits: 8,
                    })} <span className="text-base font-medium text-gray-500">BTC</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Listing price (paid to you when sold)
                  </p>
                </>
              ) : swapFeeBreakdown ? (
                <>
                  <p className="text-xs text-gray-500 mb-1">Atomic Swap Purchase</p>
                  <p className="text-lg font-bold text-gray-900">
                    {formatAmount({
                      value: fromSatoshis(swapFeeBreakdown.sellerPayment, true),
                      minimumFractionDigits: 8,
                      maximumFractionDigits: 8,
                    })} <span className="text-base font-medium text-gray-500">BTC</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Payment to seller
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-1">Total Value</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatAmount({
                      value: fromSatoshis(psbtDetails.totalInputValue, true),
                      minimumFractionDigits: 8,
                      maximumFractionDigits: 8,
                    })} <span className="text-base font-medium text-gray-500">BTC</span>
                  </p>
                </>
              )}
            </div>
            <div className="text-center pt-3 border-t border-gray-100 space-y-1.5">
              {swapFeeBreakdown ? (
                <>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xs text-gray-500">Seller payment:</span>
                    <span className="text-xs font-medium text-gray-900">
                      {swapFeeBreakdown.sellerPayment.toLocaleString()} sats
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xs text-gray-500">Platform fee:</span>
                    <span className="text-xs font-medium text-gray-900">
                      {swapFeeBreakdown.platformFee.toLocaleString()} sats
                      {swapFeeBreakdown.sellerPayment > 0 && (
                        <span className="text-gray-400 font-normal ml-1">
                          ({((swapFeeBreakdown.platformFee / swapFeeBreakdown.sellerPayment) * 100).toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xs text-gray-500">Network fee:</span>
                    <span className={`text-xs font-medium ${swapFeeBreakdown.networkFee > 10000000 ? 'text-warning-600' : 'text-gray-900'}`}>
                      {swapFeeBreakdown.networkFee.toLocaleString()} sats
                    </span>
                  </div>
                </>
              ) : (
                <>
                  {psbtDetails.fee > 0 && (
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-xs text-gray-500">Network Fee:</span>
                      <span className={`text-xs font-medium ${hasHighFee ? 'text-warning-600' : 'text-gray-900'}`}>
                        {formatAmount({
                          value: fromSatoshis(psbtDetails.fee, true),
                          minimumFractionDigits: 8,
                          maximumFractionDigits: 8,
                        })} BTC
                        <span className="text-gray-400 font-normal ml-1">({psbtDetails.fee.toLocaleString()} sats)</span>
                      </span>
                    </div>
                  )}
                  {hasHighFee && (
                    <p className="text-xs text-warning-600">Unusually high — double-check before signing.</p>
                  )}
                  {counterpartyMessage?.messageData?.fee != null &&
                    Number(counterpartyMessage.messageData.fee) > 0 && (
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-xs text-gray-500">Protocol Fee:</span>
                      <span className="text-sm font-medium text-purple-700">
                        {formatAmount({
                          value: fromSatoshis(Number(counterpartyMessage.messageData.fee), true),
                          minimumFractionDigits: 8,
                          maximumFractionDigits: 8,
                        })} XCP
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Transaction Details (expandable) */}
          <div className="bg-white rounded-lg shadow-sm">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="px-6 py-4 flex items-center gap-1.5 text-left cursor-pointer hover:opacity-70 transition-opacity"
            >
              <span className="text-sm font-medium text-gray-700">Transaction Details</span>
              {showDetails ? (
                <FiChevronUp className="size-4 text-gray-400" aria-hidden="true" />
              ) : (
                <FiChevronDown className="size-4 text-gray-400" aria-hidden="true" />
              )}
            </button>

            {showDetails && (
              <div className="px-6 pb-4 space-y-4 border-t border-gray-100 pt-4">
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
                        {output.address && (
                          <div className="text-gray-500 truncate" title={output.address}>
                            {formatAddress(output.address, true)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Warnings, rendered in a fixed severity order (danger → success) */}
          <WarningStack items={warningItems} />

          {/* Verification Status (compact badge when passed) */}
          <VerificationStatus
            passed={verificationPassed}
            warning={verificationWarning}
            isStrict={isStrictMode}
          />
        </div>
      </div>

      <ApprovalFooter
        onCancel={handleReject}
        onSign={handleSign}
        busy={isSigning}
        blocked={shouldBlockSigning}
        isHardware={activeWallet.type === 'hardware'}
      />
    </div>
  );
}
