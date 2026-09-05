import { useEffect, useState } from "react";
import {
  ApprovalFooter,
  ApprovalLayout,
  ApprovalLoading,
  ApprovalNoWallet,
  ApprovalUnavailable,
} from "@/components/domain/approval/approval-chrome";
import { ApprovalNotice } from "@/components/domain/approval/approval-notice";
import { BundleReviewCard } from "@/components/domain/approval/bundle-review-card";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import type { WarningItem } from "@/components/ui/warning-stack";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { usePopupLifecycle } from "@/hooks/usePopupLifecycle";
import { useSignPsbtsRequest } from "@/hooks/useSignPsbtsRequest";

export default function ApprovePsbtsPage() {
  const { activeAddress, activeWallet } = useWallet();
  const { setHeaderProps } = useHeader();
  const {
    request,
    requestId,
    decodedInfo,
    isLoading,
    error: loadError,
    handleApprove,
    handleCancel,
    handleRetry,
    isRefreshing,
    refreshError,
  } = useSignPsbtsRequest();
  usePopupLifecycle(requestId, "sign-psbts");
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // "Accept Offer", not "Accept Offer + Fee Bump": the longer form truncates at popup width,
    // and the fee bump is a line item of the acceptance rather than a second act.
    const title =
      request?.bundleKind === "acceptance-cpfp"
        ? "Accept Offer"
        : request?.bundleKind === "attach-and-list"
          ? "Attach and List"
          : request?.bundleKind === "bulk-fanout"
            ? "Prepare Funds"
            : request?.bundleKind === "prepare-assets"
              ? "Prepare Assets"
              : request?.bundleKind === "bulk-attach"
                ? "Attach Collectibles"
                : request?.bundleKind === "bulk-listing"
                  ? "Authorize Listings"
                  : "Review Transaction Batch";
    setHeaderProps({ title });
  }, [request?.bundleKind, setHeaderProps]);

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
    } catch {
      setIsSigning(false);
    }
  };

  if (isLoading) return <ApprovalLoading />;
  if (loadError || !request || !decodedInfo) return <ApprovalUnavailable message={loadError} onRetry={requestId ? () => void handleRetry() : undefined} retrying={isRefreshing} />;
  if (!activeAddress || !activeWallet) return <ApprovalNoWallet />;

  const blocked = decodedInfo.review.status === "blocked" || decodedInfo.review.status === "retry";
  // A proved bulk-listing batch is a one-screen decision like the single listing: the review
  // facts carry the durable-signature boundary, and the footer names what signing authorizes —
  // including whether that is new listings or reprices of existing ones.
  const allReprice =
    request.bundleKind === "bulk-listing" &&
    request.items.every(
      (item) =>
        item.marketplaceIntent.action === "create_listing" &&
        item.marketplaceIntent.listingContext?.mode === "reprice",
    );
  const signLabel =
    request.bundleKind === "attach-and-list"
      ? "Attach and list"
      : request.bundleKind === "bulk-listing"
        ? `Authorize ${request.items.length} ${allReprice ? "reprice" : "listing"}${request.items.length === 1 ? "" : "s"}`
        : request.bundleKind === "acceptance-cpfp"
          ? "Accept offer"
          : request.bundleKind === "bulk-fanout"
            ? "Prepare funds"
            : "Sign transactions";
  const retry = decodedInfo.review.status === "retry" || Boolean(refreshError);
  const noticeItems: WarningItem[] = [
    ...(error ? [{ key: "signing-error", severity: "danger" as const, title: error }] : []),
    ...(refreshError ? [{ key: "refresh-error", severity: "warning" as const, title: refreshError }] : []),
    ...(blocked ? decodedInfo.review.blockers.map((problem, index) => ({
      key: `bundle-blocker-${index}`,
      severity: decodedInfo.review.status === "retry" ? "warning" as const : "danger" as const,
      title: problem,
    })) : []),
    ...(decodedInfo.review.status === "caution" ? decodedInfo.review.notices
      .filter(notice => notice.severity !== "info")
      .map((notice, index) => ({
        key: `bundle-caution-${index}`, severity: notice.severity,
        title: request.bundleKind === "attach-and-list" ? "Listing activates after confirmation" : notice.message,
        ...(request.bundleKind === "attach-and-list" ? { description: notice.message } : {}),
      })) : []),
  ];
  if (blocked && noticeItems.length === 0) {
    noticeItems.push({
      key: "bundle-unavailable",
      severity: retry ? "warning" : "danger",
      title: retry ? "Required ledger information is unavailable" : "Marketplace terms did not verify",
    });
  }
  return (
    <ApprovalLayout
      walletName={activeWallet.name}
      address={activeAddress.address}
      origin={request.origin}
      footer={
        <ApprovalFooter
          onCancel={handleReject}
          onSign={() => void handleSign()}
          busy={isSigning}
          blocked={blocked || isRefreshing || Boolean(refreshError)}
          blockedLabel={
            decodedInfo.review.status === "retry" || isRefreshing || refreshError
              ? "Awaiting verification"
              : "Blocked"
          }
          isHardware={activeWallet.type === "hardware"}
          signLabel={signLabel}
        />
      }
    >
      <ApprovalNotice items={noticeItems} blocked={decodedInfo.review.status === "blocked"} />
      {retry && (
        <Button color="gray" onClick={() => void handleRetry()} disabled={isRefreshing} fullWidth>
          {isRefreshing ? "Verifying…" : "Retry verification"}
        </Button>
      )}
      <BundleReviewCard review={decodedInfo.review} />
      <Collapsible compact variant="card" title="Linked Transaction Details">
        <div className="space-y-3 text-xs">
          {decodedInfo.items.map((item, index) => (
            <div
              key={`${item.txid ?? "transaction"}-${index}`}
              className={index > 0 ? "border-t border-gray-200 pt-3" : ""}
            >
              <p className="font-semibold text-gray-900">
                {index + 1}.{" "}
                {item.marketplaceReview?.title ??
                  request.items[index]?.marketplaceIntent.action
                    .replaceAll("_", " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
              </p>
              <p className="mt-1 break-all text-gray-500">{item.txid}</p>
              <p className="mt-1 text-gray-700">
                Fee: {item.psbtDetails.fee.toLocaleString()} sats
              </p>
            </div>
          ))}
          <p className="border-t border-gray-100 pt-3 text-gray-500">
            The wallet returns this batch only after every requested signature succeeds.
          </p>
        </div>
      </Collapsible>
    </ApprovalLayout>
  );
}
