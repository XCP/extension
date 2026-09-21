import { useEffect, useState } from "react";
import {
  ApprovalExpired,
  ApprovalFooter,
  ApprovalLayout,
  ApprovalLoading,
  ApprovalNoWallet,
} from "@/components/domain/approval/approval-chrome";
import { ErrorAlert } from "@/components/ui/error-alert";
import { WarningStack } from "@/components/ui/warning-stack";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { getMessageSigningRisks } from "@/core/bitcoin/messageRisk";
import { usePopupLifecycle } from "@/hooks/usePopupLifecycle";
import { useSignMessageRequest } from "@/hooks/useSignMessageRequest";

export default function ApproveMessagePage() {
  const { activeAddress, activeWallet } = useWallet();
  const { setHeaderProps } = useHeader();
  const {
    request,
    requestId,
    isLoading,
    error: loadError,
    handleApprove,
    handleCancel,
  } = useSignMessageRequest();
  usePopupLifecycle(requestId, "sign-message");
  const signingRisks = getMessageSigningRisks(request?.message ?? "");

  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string>("");

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Sign Message",
    });
  }, [setHeaderProps]);

  const handleSign = async () => {
    if (!request) return;
    setIsSigning(true);
    setError("");
    try {
      await handleApprove(false);
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
  if (loadError || !request) return <ApprovalExpired message={loadError} />;
  if (!activeAddress || !activeWallet) return <ApprovalNoWallet />;

  return (
    <ApprovalLayout
      walletName={activeWallet.name}
      address={request.signingAddress ?? request.address}
      origin={request.origin}
      footer={
        <ApprovalFooter
          onCancel={handleReject}
          onSign={handleSign}
          busy={isSigning}
          blocked={false}
          isHardware={activeWallet.type === "hardware"}
          signLabel="Sign message"
        />
      }
    >
      {error && <ErrorAlert message={error} />}
      {/* Where the rendered message is a poor witness for the bytes being signed. The PSBT and
              transaction screens have warned for a while; this one showed the text and a button. */}
      {signingRisks.length > 0 && (
        <WarningStack
          items={signingRisks.map((risk) => ({
            key: risk.key,
            severity: "warning",
            title: risk.title,
            description: risk.description,
          }))}
        />
      )}

      {/* Message content */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <p className="text-lg leading-6 font-semibold text-gray-900 mb-3">Message to sign</p>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-sm leading-5 text-gray-900 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {request.message}
          </p>
        </div>
      </div>
    </ApprovalLayout>
  );
}
