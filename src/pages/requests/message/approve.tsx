import { useEffect, useState } from "react";
import {
  ApprovalExpired,
  ApprovalFooter,
  ApprovalLayout,
  ApprovalLoading,
  ApprovalNoWallet,
} from "@/components/domain/approval/approval-chrome";
import { providerReviewErrorMessage } from '@/components/domain/approval/provider-review-error';
import { ErrorAlert } from "@/components/ui/error-alert";
import { WarningStack } from "@/components/ui/warning-stack";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { getMessageSigningRisks } from "@/core/bitcoin/messageRisk";
import { usePopupLifecycle } from "@/hooks/usePopupLifecycle";
import { useSignMessageRequest } from "@/hooks/useSignMessageRequest";
import { t } from '@/i18n';
export default function ApproveMessagePage() {
  const { activeAddress, activeWallet } = useWallet();
  const { setHeaderProps } = useHeader();
  const {
    request,
    review,
    requestId,
    isLoading,
    error: loadError,
    handleApprove,
    handleCancel,
  } = useSignMessageRequest();
  usePopupLifecycle(requestId, "sign-message");
  const signingRisks = getMessageSigningRisks(request?.message ?? "");
  const cancellation = request?.cancelOffersIntent;
  const title = cancellation
    ? cancellation.offerIds.length === 1 ? t('message_cancel_one_offer') : t('message_cancel_offers', [String(cancellation.offerIds.length)])
    : t('common_sign_message');

  const [isSigning, setIsSigning] = useState(false);
  const [signingError, setError] = useState<unknown>(null);
  const error = signingError ? providerReviewErrorMessage(signingError) : '';

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: t('common_sign_message'),
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
      setError(failure instanceof Error ? failure : {});
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
          onCancel={() => void handleReject()}
          onSign={() => void handleSign()}
          busy={isSigning}
          blocked={false}
          isHardware={activeWallet.type === "hardware"}
          signLabel={cancellation ? t('message_cancel_sign') : t('message_approve_sign_message')}
        />
      }
    >
      {error && <ErrorAlert message={error} />}
      {cancellation && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-lg leading-6 font-semibold text-gray-900 mb-3">{title}</h2>
          <ul className="space-y-2">
            {review?.cancellationCoins?.map(coin => (
              <li key={coin.outpoint} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-mono text-gray-600" title={coin.outpoint}>{coin.outpoint.slice(0, 8)}…{coin.outpoint.slice(-8)}</span>
                <span className="text-gray-900">{coin.effect === 'unlocks' ? t('message_cancel_unlocks')
                  : coin.effect === 'stays_locked' ? t('message_cancel_stays_locked') : t('message_cancel_no_lock')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
        <p className="text-lg leading-6 font-semibold text-gray-900 mb-3">{t('message_approve_message_to_sign')}</p>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-sm leading-5 text-gray-900 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {request.message}
          </p>
        </div>
      </div>
    </ApprovalLayout>
  );
}
