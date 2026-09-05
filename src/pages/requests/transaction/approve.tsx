import { useEffect, useState } from 'react';
import {
  ApprovalAttentionScreen,
  highFeeAttentionItem,
  partitionApprovalItems,
  verificationAttentionItem,
} from '@/components/domain/approval/approval-attention';
import {ApprovalExpired, ApprovalFooter,
  ApprovalLoading, ApprovalNoWallet,ApprovalSiteBar, 
  ApprovalWalletHeader, 
} from '@/components/domain/approval/approval-chrome';
import { splitTrailingAddress } from '@/components/domain/approval/approval-summary-card';
import { ApprovalTransactionDetails } from '@/components/domain/approval/approval-transaction-details';
import { buildApprovalWarnings } from '@/components/domain/approval/approval-warnings';
import { CounterpartyDetailsCard } from '@/components/domain/approval/counterparty-details-card';
import { computeMoneyMovement } from '@/components/domain/approval/money-movement';
import { MoneyMovementView } from '@/components/domain/approval/money-movement-view';
import { buildOrderAction, type OrderAction, OrderCard } from '@/components/domain/approval/order-card';
import { attachDestinationVout, getTxActionInfo } from '@/components/domain/tx/tx-action-info';
import { VerificationStatus } from '@/components/domain/tx/verification-status';
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
import { formatAmount } from '@/core/format';
import { fromSatoshis, isGreaterThan } from "@/core/numeric";
import { useFeeRates } from '@/hooks/useFeeRates';
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
  const { feeRates } = useFeeRates();
  usePopupLifecycle(request?.id, 'sign-transaction');

  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string>('');
  const [showAttention, setShowAttention] = useState(false);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Sign Transaction",
    });
  }, [setHeaderProps]);

  useEffect(() => setShowAttention(false), [request?.id]);

  const handleSign = async () => {
    if (!request || !decodedInfo || !activeAddress) return;
    if (decodedInfo.safety?.blocked) {
      setError('This transaction is blocked by the wallet safety checks.');
      return;
    }

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

      await handleSuccess(
        signedTxHex,
        signerInputIndices.length === decodedInfo.inputs.length
          && signedInputsWithAssets.length === 0
          && signedInputsUnknownStatus.length === 0
      );
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
  const feeRateAbsurd = exceedsSaneFeeRate(
    decodedInfo.fee,
    decodedInfo.vsize,
    feeRates?.fastestFee,
  );
  const hasHighFee = decodedInfo.fee > 10000000 || feeRateAbsurd; // > 0.1 BTC, or an absurd rate
  const verificationPassed = decodedInfo.verification?.passed;
  const verificationRepackProved = decodedInfo.verification?.repackProved ?? false;
  const verificationWarning = decodedInfo.verification?.warning;
  const isStrictMode = settings?.strictTransactionVerification !== false;
  const deferredVerificationFailure = verificationPassed === false
    && !verificationRepackProved
    && !isStrictMode;
  const safetyBlocked = decodedInfo.safety?.blocked ?? false;
  const safetyWarnings = decodedInfo.safety?.warnings ?? [];
  // Shared with the PSBT approval screen so the two cannot drift.
  const verificationBlocked = shouldBlockSigning({
    safetyBlocked,
    verificationPassed,
    repackProved: verificationRepackProved,
    strictMode: isStrictMode,
  });

  // Attached-asset status per input. Inputs are dense, so array position is the index.
  // The wallet signs inputs it controls, i.e. those belonging to the active address.
  const signerInputIndices = decodedInfo.inputs
    .map((input, index) => ({ input, index }))
    .filter(({ input }) => input.address &&
      normalizeAddressForComparison(input.address) === normalizeAddressForComparison(activeAddress.address))
    .map(({ index }) => index);
  const { withAssets: signedInputsWithAssets, unknownStatus: signedInputsUnknownStatus } =
    classifySignedInputAssets(decodedInfo.attachedAssets, signerInputIndices);
  const displayedText = txAction?.type === 'order'
    ? [txAction.order.giveAsset, txAction.order.getAsset]
    : txAction?.type === 'fallback'
      ? [txAction.description, ...txAction.protocol.map((field) => field.value)]
      : [];
  displayedText.push(...signedInputsWithAssets.flatMap((entry) =>
    entry.assets.map((asset) => asset.asset_longname ?? asset.asset)
  ));

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
    displayedText,
    safetyWarnings,
    attachedAssetDestination: decodedInfo.attachedAssetDestination,
    structureFindings: decodedInfo.structureFindings ?? [],
    signedInputsWithAssets,
    signedInputsUnknownStatus,
  });

  // An unavailable asset lookup is a retry state. It cannot be acknowledged away because the
  // wallet does not know whether signing moves an attached asset. A structure finding blocks too:
  // the message provably cannot do what it claims, so signing only spends fees on a broken
  // transaction no honest composer produces.
  const blockSigning = verificationBlocked
    || signedInputsUnknownStatus.length > 0
    || (decodedInfo.structureFindings ?? []).length > 0;
  const { attention } = partitionApprovalItems(warningItems);
  const approvalAttentionItems: WarningItem[] = [
    ...attention,
    ...(deferredVerificationFailure ? [verificationAttentionItem(verificationWarning)] : []),
    ...(hasHighFee ? [highFeeAttentionItem(decodedInfo.fee, decodedInfo.vsize)] : []),
  ];
  const requiresAttention = !blockSigning && approvalAttentionItems.length > 0;
  const attentionTitle = approvalAttentionItems.some(item => item.severity === 'danger')
    ? 'Review transaction risk'
    : 'Review before signing';
  const confirmLabel = decodedInfo.counterpartyMessage?.messageType === 'destroy'
    ? 'Destroy supply'
    : 'Confirm and sign';
  const handleApprovalAction = () => {
    if (requiresAttention) {
      setShowAttention(true);
      return;
    }
    void handleSign();
  };

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
                  const { sentence, address, subline } = splitTrailingAddress(txAction.description);
                  return (
                    <>
                      <p className="text-lg font-bold text-gray-900 break-words">{sentence}</p>
                      {subline && (
                        <p className="mt-1 text-sm text-gray-700 break-words">{subline}</p>
                      )}
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
            <MoneyMovementView
              movement={movement}
              hasHighFee={hasHighFee}
              deferCautions={requiresAttention}
              showHeadline={!txAction}
            />
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

          <CounterpartyDetailsCard
            fields={txAction && 'protocol' in txAction ? txAction.protocol : []}
            recipients={decodedInfo.mpmaRecipients}
          />
          <ApprovalTransactionDetails
            txid={decodedInfo.txid}
            inputs={decodedInfo.inputs.map((input, index) => ({ ...input, index }))}
            outputs={decodedInfo.outputs}
            attachedAssets={decodedInfo.attachedAssets}
            verification={decodedInfo.verification}
            attachVout={attachDestinationVout(decodedInfo)}
          />

          {/* A blocked request explains itself immediately. Signable cautions wait behind Review. */}
          {blockSigning && <WarningStack items={attention} />}

          {/* Verification Status (compact badge when passed) */}
          <VerificationStatus
            passed={deferredVerificationFailure
              ? undefined
              : verificationRepackProved ? true : verificationPassed}
            warning={verificationWarning}
            isStrict={isStrictMode}
          />

        </div>
      </div>

      <ApprovalFooter
        onCancel={handleReject}
        onSign={handleApprovalAction}
        busy={isSigning}
        blocked={blockSigning}
        isHardware={activeWallet.type === 'hardware'}
        signLabel={requiresAttention ? 'Review' : 'Sign'}
      />

      {showAttention && requiresAttention && (
        <ApprovalAttentionScreen
          title={attentionTitle}
          description="Confirm the exceptional transaction behavior below before the wallet adds your signature."
          items={approvalAttentionItems}
          confirmLabel={confirmLabel}
          busy={isSigning}
          isHardware={activeWallet.type === 'hardware'}
          onBack={() => setShowAttention(false)}
          onConfirm={() => void handleSign()}
        />
      )}
    </div>
  );
}
