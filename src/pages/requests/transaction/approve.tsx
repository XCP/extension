import { useEffect, useState } from "react";
import {
  ApprovalAttentionScreen,
  highFeeAttentionItem,
  partitionApprovalItems,
  verificationAttentionItem,
} from "@/components/domain/approval/approval-attention";
import {
  ApprovalFooter,
  ApprovalLayout,
  ApprovalLoading,
  ApprovalNoWallet,
  ApprovalRetry,
  ApprovalUnavailable,
} from "@/components/domain/approval/approval-chrome";
import { ApprovalNotice } from "@/components/domain/approval/approval-notice";
import { ApprovalSummaryCard } from "@/components/domain/approval/approval-summary-card";
import { ApprovalTransactionDetails } from "@/components/domain/approval/approval-transaction-details";
import { buildApprovalWarnings } from "@/components/domain/approval/approval-warnings";
import { CounterpartyDetailsCard } from "@/components/domain/approval/counterparty-details-card";
import { computeMoneyMovement } from "@/components/domain/approval/money-movement";
import { buildOrderAction, type OrderAction } from "@/components/domain/approval/order-card";
import { attachDestinationVout, getTxActionInfo } from "@/components/domain/tx/tx-action-info";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { WarningItem } from "@/components/ui/warning-stack";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { normalizeAddressForComparison } from "@/core/bitcoin/address";
import { exceedsSaneFeeRate } from "@/core/bitcoin/feeVerification";
import type { ProtocolField } from "@/core/counterparty/describe";
import { classifySignedInputAssets } from "@/core/counterparty/inputAssets";
import { shouldBlockSigning } from "@/core/counterparty/unpack/providerVerify";
import { usePopupLifecycle } from "@/hooks/usePopupLifecycle";
import type { DecodedTransactionInfo } from "@/hooks/useSignTransactionRequest";
import { useSignTransactionRequest } from "@/hooks/useSignTransactionRequest";

/**
 * Structured data for per-type visual renderers.
 *
 * `order` has a card of its own — see order-card.tsx, which both approval screens use so the same
 * message does not render two different ways depending on which method the site called.
 */
type TxActionData =
  | { type: "order"; order: OrderAction }
  | { type: "fallback"; label: string; description: string; protocol: ProtocolField[] }
  | null;

function getTxActionData(decodedInfo: DecodedTransactionInfo): TxActionData {
  const order = buildOrderAction(decodedInfo);
  if (order) return { type: "order", order };

  const info = getTxActionInfo(decodedInfo, decodedInfo.protocolContext);
  if (info) {
    return {
      type: "fallback",
      label: info.label,
      description: info.description,
      protocol: info.protocol,
    };
  }
  return null;
}

export default function ApproveTransactionPage() {
  const { activeAddress, activeWallet } = useWallet();
  const { settings } = useSettings();
  const { setHeaderProps } = useHeader();
  const {
    request,
    requestId,
    decodedInfo,
    approvalPolicy,
    fastestFee,
    isLoading,
    error: loadError,
    handleApprove,
    handleCancel,
    handleRetry,
    isRefreshing,
    refreshError,
  } = useSignTransactionRequest();
  usePopupLifecycle(requestId, "sign-transaction");

  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string>("");
  const [showAttention, setShowAttention] = useState(false);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Sign Transaction",
    });
  }, [setHeaderProps]);

  useEffect(() => setShowAttention(false), [request?.id]);

  const handleSign = async () => {
    if (!request) return;
    setIsSigning(true);
    setError("");
    try {
      await handleApprove(showAttention);
      window.close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Failed to sign request");
      setIsSigning(false);
    }
  };

  const handleReject = async () => {
    setIsSigning(true);
    try {
      await handleCancel();
      window.close();
    } catch (err) {
      console.error("Failed to cancel:", err);
      setIsSigning(false);
    }
  };

  if (isLoading) return <ApprovalLoading />;
  if (loadError || !request || !decodedInfo) return <ApprovalUnavailable message={loadError} onRetry={requestId ? () => void handleRetry() : undefined} retrying={isRefreshing} />;
  if (!activeAddress || !activeWallet) return <ApprovalNoWallet />;

  const txAction = getTxActionData(decodedInfo);
  // An absolute ceiling alone lets a fee just under it drain a small transaction, so the rate is
  // checked too — that case previously drew no warning at all. It warns rather than blocks: the
  // transaction was built elsewhere, so an expensive one can be legitimate and the wallet cannot
  // know the intent. The compose path blocks the same condition because it built the transaction
  // itself, and there an absurd fee means the response misbehaved.
  const feeRateAbsurd = exceedsSaneFeeRate(decodedInfo.fee, decodedInfo.vsize, fastestFee);
  const hasHighFee = decodedInfo.fee > 10000000 || feeRateAbsurd; // > 0.1 BTC, or an absurd rate
  const verificationPassed = decodedInfo.verification?.passed;
  const verificationRepackProved = decodedInfo.verification?.repackProved ?? false;
  const verificationWarning = decodedInfo.verification?.warning;
  const isStrictMode = settings?.strictTransactionVerification !== false;
  const deferredVerificationFailure =
    verificationPassed === false && !verificationRepackProved && !isStrictMode;
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
    .filter(
      ({ input }) =>
        input.address &&
        normalizeAddressForComparison(input.address) ===
          normalizeAddressForComparison(activeAddress.address),
    )
    .map(({ index }) => index);
  const { withAssets: signedInputsWithAssets, unknownStatus: signedInputsUnknownStatus } =
    classifySignedInputAssets(decodedInfo.attachedAssets, signerInputIndices);
  const displayedText =
    txAction?.type === "order"
      ? [txAction.order.giveAsset, txAction.order.getAsset]
      : txAction?.type === "fallback"
        ? [txAction.description, ...txAction.protocol.map((field) => field.value)]
        : [];
  displayedText.push(
    ...signedInputsWithAssets.flatMap((entry) =>
      entry.assets.map((asset) => asset.asset_longname ?? asset.asset),
    ),
  );

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
  const blockSigning =
    approvalPolicy?.blocked ||
    verificationBlocked ||
    signedInputsUnknownStatus.length > 0 ||
    (decodedInfo.structureFindings ?? []).length > 0;
  const { attention } = partitionApprovalItems(warningItems);
  const approvalAttentionItems: WarningItem[] = [
    ...attention,
    ...(deferredVerificationFailure ? [verificationAttentionItem(verificationWarning)] : []),
    ...(hasHighFee ? [highFeeAttentionItem(decodedInfo.fee, decodedInfo.vsize)] : []),
  ];
  const retryAvailable = signedInputsUnknownStatus.length > 0
    || decodedInfo.inputs.some(input => input.value === undefined || !input.address);
  const requiresAttention = !blockSigning && approvalAttentionItems.length > 0;
  const blockingItems: WarningItem[] = [
    ...attention.filter(item => item.blocking),
    ...(verificationPassed === false && !verificationRepackProved && isStrictMode ? [{
      key: "verification-block", severity: "danger" as const,
      title: "Transaction details did not verify", description: verificationWarning,
    }] : []),
    ...(decodedInfo.inputs.some(input => input.value === undefined || !input.address) ? [{
      key: "unresolved-input", severity: "warning" as const,
      title: "Input details could not be verified",
      description: "The wallet cannot confirm the input value or owner. Retry verification before signing.",
    }] : []),
  ];

  const attentionTitle =
    decodedInfo.counterpartyMessage?.messageType === "destroy" && txAction?.type === "fallback"
      ? txAction.description
      : approvalAttentionItems.some((item) => item.severity === "danger")
        ? "Review transaction risk"
        : "Review before signing";
  const confirmLabel =
    decodedInfo.counterpartyMessage?.messageType === "destroy"
      ? "Destroy supply"
      : "Confirm and sign";
  const handleApprovalAction = () => {
    if (requiresAttention) {
      setShowAttention(true);
      return;
    }
    void handleSign();
  };

  return (
    <ApprovalLayout
      walletName={activeWallet.name}
      address={activeAddress.address}
      origin={request.origin}
      footer={
        <ApprovalFooter
          onCancel={handleReject}
          onSign={handleApprovalAction}
          busy={isSigning}
          blocked={blockSigning || isRefreshing || Boolean(refreshError)}
          blockedLabel={
            retryAvailable || isRefreshing || refreshError ? "Awaiting verification" : "Blocked"
          }
          isHardware={activeWallet.type === "hardware"}
          signLabel={requiresAttention ? "Review" : "Sign transaction"}
        />
      }
      attention={
        showAttention &&
        requiresAttention && (
          <ApprovalAttentionScreen
            title={attentionTitle}
            description="Confirm the exceptional transaction behavior below before the wallet adds your signature."
            items={approvalAttentionItems}
            confirmLabel={confirmLabel}
            busy={isSigning}
            isHardware={activeWallet.type === "hardware"}
            onBack={() => setShowAttention(false)}
            onConfirm={() => void handleSign()}
          />
        )
      }
    >
      {error && <ErrorAlert message={error} />}
      <ApprovalNotice items={blockSigning ? blockingItems : approvalAttentionItems} blocked={Boolean(blockSigning)} />

      <ApprovalSummaryCard
        txAction={txAction?.type === "fallback" ? txAction : null}
        order={txAction?.type === "order" ? txAction.order : null}
        movement={movement}
        hasHighFee={hasHighFee}
        deferCautions={requiresAttention}
        protocolFeeXcp={decodedInfo.counterpartyMessage?.messageData?.fee}
      />

      <CounterpartyDetailsCard
        fields={txAction && "protocol" in txAction ? txAction.protocol : []}
        recipients={decodedInfo.mpmaRecipients}
      />
      {retryAvailable && (
        <ApprovalRetry
          onRetry={() => void handleRetry()}
          retrying={isRefreshing}
          error={refreshError}
        />
      )}




      <ApprovalTransactionDetails
        txid={decodedInfo.txid}
        inputs={decodedInfo.inputs.map((input, index) => ({ ...input, index }))}
        outputs={decodedInfo.outputs}
        attachedAssets={decodedInfo.attachedAssets}
        verification={decodedInfo.verification}
        attachVout={attachDestinationVout(decodedInfo)}
      />
    </ApprovalLayout>
  );
}
