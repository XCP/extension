import { useEffect, useState } from 'react';
import {ApprovalExpired, ApprovalFooter,
  ApprovalLoading, ApprovalNoWallet,ApprovalSiteBar, 
  ApprovalWalletHeader, 
} from '@/components/domain/approval/approval-chrome';
import { splitTrailingAddress } from '@/components/domain/approval/approval-summary-card';
import { buildApprovalWarnings } from '@/components/domain/approval/approval-warnings';
import { CounterpartyDetailsCard } from '@/components/domain/approval/counterparty-details-card';
import { computeMoneyMovement } from '@/components/domain/approval/money-movement';
import { MoneyMovementView } from '@/components/domain/approval/money-movement-view';
import { buildOrderAction, type OrderAction, OrderCard } from '@/components/domain/approval/order-card';
import { VerificationDetails } from '@/components/domain/approval/verification-details';
import { getTxActionInfo } from '@/components/domain/tx/tx-action-info';
import { VerificationStatus } from '@/components/domain/tx/verification-status';
import { Collapsible } from '@/components/ui/collapsible';
import { ErrorAlert } from '@/components/ui/error-alert';
import { type WarningItem, WarningStack } from '@/components/ui/warning-stack';
import { useHeader } from '@/contexts/header-context';
import { useSettings } from '@/contexts/settings-context';
import { useWallet } from '@/contexts/wallet-context';
import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { exceedsSaneFeeRate } from '@/core/bitcoin/feeVerification';
import type { ProtocolField } from '@/core/counterparty/describe';
import { classifySignedInputAssets } from '@/core/counterparty/inputAssets';
import { shouldBlockSigning } from '@/core/counterparty/unpack/providerVerify';
import { formatAddress, formatAmount } from '@/core/format';
import { fromSatoshis, isGreaterThan } from "@/core/numeric";
import { usePopupLifecycle } from '@/hooks/usePopupLifecycle';
import type { DecodedTransactionInfo } from '@/hooks/useSignTransactionRequest';
import { useSignTransactionRequest } from '@/hooks/useSignTransactionRequest';
import { getConnectionRevokedError, getIdentityMismatchError } from '@/platform/provider/requestIdentity';
import { getConnectionService } from '@/services/connectionService';
import { getWalletService } from '@/services/walletService';

/**
 * Structured data for per-type visual renderers.
 *
 * `order` has a card of its own — see order-card.tsx, which both approval screens use so the same
 * message does not render two different ways depending on which method the site called.
 */
type TxActionData =
  | { type: 'order'; order: OrderAction }
  | { type: 'fallback'; label: string; description: string; protocol: ProtocolField[] }
  | null;

function getTxActionData(decodedInfo: DecodedTransactionInfo): TxActionData {
  const order = buildOrderAction(decodedInfo);
  if (order) return { type: 'order', order };

  const info = getTxActionInfo(decodedInfo, decodedInfo.protocolContext);
  if (info) {
    return { type: 'fallback', label: info.label, description: info.description, protocol: info.protocol };
  }
  return null;
}

export default function ApproveTransactionPage() {
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
  } = useSignTransactionRequest(activeAddress?.address);
  usePopupLifecycle(request?.id, 'sign-transaction');

  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string>('');

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Sign Transaction",
    });
  }, [setHeaderProps]);

  const handleSign = async () => {
    if (!request || !decodedInfo || !activeAddress) return;

    const identityError = getIdentityMismatchError(request, activeAddress.address, activeWallet?.id);
    if (identityError) {
      setError(identityError);
      return;
    }

    // A request stays open for up to ten minutes, so the site's grant is rechecked here rather
    // than trusted from when the request was created — revoking a site in Settings must take
    // effect on an approval already on screen. The PSBT path has always done this.
    const revokedError = await getConnectionRevokedError(request, getConnectionService());
    if (revokedError) {
      setError(revokedError);
      return;
    }

    setIsSigning(true);
    setError('');

    try {
      const walletService = getWalletService();
      const signedTxHex = await walletService.signTransaction(
        request.rawTxHex,
        request.address
      );

      await handleSuccess(signedTxHex);
      window.close();
    } catch (err) {
      console.error('Failed to sign transaction:', err);
      setError(err instanceof Error ? err.message : 'Failed to sign transaction');
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

  const txAction = getTxActionData(decodedInfo);
  // An absolute ceiling alone lets a fee just under it drain a small transaction, so the rate is
  // checked too — that case previously drew no warning at all. It warns rather than blocks: the
  // transaction was built elsewhere, so an expensive one can be legitimate and the wallet cannot
  // know the intent. The compose path blocks the same condition because it built the transaction
  // itself, and there an absurd fee means the response misbehaved.
  const feeRateAbsurd = exceedsSaneFeeRate(decodedInfo.fee, decodedInfo.vsize);
  const hasHighFee = decodedInfo.fee > 10000000 || feeRateAbsurd; // > 0.1 BTC, or an absurd rate
  const verificationPassed = decodedInfo.verification?.passed;
  const verificationRepackProved = decodedInfo.verification?.repackProved ?? false;
  const verificationWarning = decodedInfo.verification?.warning;
  const isStrictMode = settings?.strictTransactionVerification !== false;
  const safetyBlocked = decodedInfo.safety?.blocked ?? false;
  const safetyWarnings = decodedInfo.safety?.warnings ?? [];
  // Shared with the PSBT approval screen so the two cannot drift.
  const blockSigning = shouldBlockSigning({
    safetyBlocked,
    verificationPassed,
    repackProved: verificationRepackProved,
    strictMode: isStrictMode,
  });

  // Attached-asset status per input. Inputs are dense, so array position is the index.
  const attachedByInput = new Map(decodedInfo.attachedAssets.map(entry => [entry.inputIndex, entry]));
  // The wallet signs inputs it controls, i.e. those belonging to the active address.
  const signerInputIndices = decodedInfo.inputs
    .map((input, index) => ({ input, index }))
    .filter(({ input }) => input.address &&
      normalizeAddressForComparison(input.address) === normalizeAddressForComparison(activeAddress.address))
    .map(({ index }) => index);
  const { withAssets: signedInputsWithAssets, unknownStatus: signedInputsUnknownStatus } =
    classifySignedInputAssets(decodedInfo.attachedAssets, signerInputIndices);

  // Net effect of this transaction on your wallet — the anti-blind-signing summary.
  const movement = computeMoneyMovement({
    inputs: decodedInfo.inputs,
    outputs: decodedInfo.outputs,
    myAddresses: [activeAddress.address],
    fee: decodedInfo.fee,
    // A raw transaction is signed SIGHASH_ALL throughout, so every output is committed.
    committedOutputs: null,
  });

  const warningItems: WarningItem[] = buildApprovalWarnings({
    safetyWarnings,
    attachedAssetDestination: decodedInfo.attachedAssetDestination,
    structureFindings: decodedInfo.structureFindings ?? [],
    signedInputsWithAssets,
    signedInputsUnknownStatus,
  });

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-4">
          <ApprovalWalletHeader walletName={activeWallet.name} address={activeAddress.address} />

          <ApprovalSiteBar origin={request.origin} />

          {error && <ErrorAlert message={error} />}

          {/* Transaction action & fee */}
          <div className="bg-white rounded-lg shadow-sm p-5">
            {txAction?.type === 'order' ? (
              <OrderCard order={txAction.order} />
            ) : txAction?.type === 'fallback' ? (
              /* Counterparty action — flat label + description */
              <div className="text-center mb-3">
                <p className="text-xs text-gray-500 mb-1">{txAction.label}</p>
                {(() => {
                  // A send or sweep headline ends in an address: a long, unbreakable token that
                  // set in 18px bold ran to three lines and dominated the card, shouting the
                  // least readable part of the sentence. It is split off and set like the
                  // outputs list — smaller, monospace, not bold — so the sentence carries the
                  // weight and the address stays scannable.
                  //
                  // It is still shown whole and allowed to wrap. Truncating here would repeat
                  // the lookalike-grinding problem the outputs list deliberately avoids, and for
                  // an enhanced send the destination lives in the payload, so this headline is
                  // the only place it appears at all.
                  const { sentence, address } = splitTrailingAddress(txAction.description);
                  return (
                    <>
                      <p className="text-lg font-bold text-gray-900 break-words">{sentence}</p>
                      {address && (
                        <p className="mt-1 text-sm font-medium font-mono text-gray-700 break-all">
                          {address}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : null}
            <MoneyMovementView movement={movement} hasHighFee={hasHighFee} showHeadline={!txAction} />
            {decodedInfo.counterpartyMessage?.messageData?.fee != null &&
              isGreaterThan(decodedInfo.counterpartyMessage.messageData.fee as string | number, 0) && (
              <div className="mt-1.5 flex items-center justify-center gap-2 text-xs">
                <span className="text-gray-500">Protocol Fee:</span>
                <span className="text-sm font-medium text-purple-700">
                  {formatAmount({
                    value: fromSatoshis(decodedInfo.counterpartyMessage.messageData.fee as string | number, { asNumber: true }),
                    minimumFractionDigits: 8,
                    maximumFractionDigits: 8,
                  })} XCP
                </span>
              </div>
            )}
          </div>

          {txAction && 'protocol' in txAction && (
            <CounterpartyDetailsCard fields={txAction.protocol} />
          )}
          {/* Transaction Details (expandable) */}
          <Collapsible variant="card" title="Transaction Details">
                  {/* TX Hash */}
                  {decodedInfo.txid && (
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">TX Hash</h4>
                      <div className="bg-gray-50 p-2 rounded text-xs text-gray-600 break-all">
                        {decodedInfo.txid}
                      </div>
                    </div>
                  )}

                  {/* Inputs List */}
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Inputs ({decodedInfo.inputs.length})</h4>
                    <div className="space-y-2">
                      {decodedInfo.inputs.map((input, idx) => {
                        const inputAssets = attachedByInput.get(idx);
                        return (
                        <div key={idx} className="bg-gray-50 p-2 rounded text-xs">
                          <span className="text-gray-600">#{idx}</span>
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
                    <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Outputs ({decodedInfo.outputs.length})</h4>
                    <div className="space-y-2">
                      {decodedInfo.outputs.map((output, idx) => (
                        <div key={idx} className="bg-gray-50 p-2 rounded text-xs">
                          <div className="flex justify-between">
                            <span className={`${output.type === 'op_return' ? 'text-purple-600' : 'text-gray-600'}`}>
                              {output.type === 'op_return' ? 'OP_RETURN' : output.type.toUpperCase()}
                            </span>
                            <span className="text-gray-900 font-medium">{formatAmount({ value: fromSatoshis(output.value, true), minimumFractionDigits: 8, maximumFractionDigits: 8 })} BTC</span>
                          </div>
                          {/* Shown in full and allowed to wrap. This is where the user checks
                              where a site's transaction sends money, and 6 leading + 6 trailing
                              characters is grindable for a lookalike - the prefix of a bech32
                              address is fixed, so only a handful of characters are actually
                              being compared. */}
                          {output.address && (
                            <div className="text-gray-500 break-all font-mono" title={output.address}>
                              {formatAddress(output.address, false)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recipients of a multi-destination send. These live in the Counterparty
                      payload rather than in BTC outputs, so the outputs list above cannot show
                      them and this is the only place they appear. Addresses are shown in full for
                      the same reason as the outputs above. */}
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

                  <VerificationDetails verification={decodedInfo.verification} />

          </Collapsible>

          {/* Warnings, rendered in a fixed severity order (danger → success) */}
          <WarningStack items={warningItems} />

          {/* Verification Status (compact badge when passed) */}
          <VerificationStatus
            passed={verificationRepackProved ? true : verificationPassed}
            warning={verificationWarning}
            isStrict={isStrictMode}
          />

        </div>
      </div>

      <ApprovalFooter
        onCancel={handleReject}
        onSign={handleSign}
        busy={isSigning}
        blocked={blockSigning}
        isHardware={activeWallet.type === 'hardware'}
      />
    </div>
  );
}
