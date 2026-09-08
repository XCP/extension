import type { ReactElement } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ApprovalIdentifier } from "@/components/domain/approval/approval-identifier";
import { FaCheck, FiGlobe } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { getPairedAddressFormats } from "@/core/wallet/addressDeriver";
import { t } from '@/i18n';
import { getApprovalService } from "@/services/approvalService";
import { getWalletService } from "@/services/walletService";
import type { ApprovalRequest } from "@/types/provider";
import type { Address, PairedAddresses, Wallet } from "@/types/wallet";

function getApprovalIdentityError(
  approval: ApprovalRequest | null,
  requestId: string,
  activeAddress: string | undefined,
  activeWalletId: string | undefined,
): string | null {
  if (!approval || approval.id !== requestId)
    return t('connect_approve_this_connection_request_is_no');
  const request = approval.params?.[0];
  if (request?.address !== activeAddress || request?.walletId !== activeWalletId) {
    return t('connect_approve_the_active_address_changed_after');
  }
  return null;
}
/**
 * Connection approval page for dApp requests
 * Shows when a website requests access to the wallet
 */
export default function ApproveConnectionPage(): ReactElement {
  const [searchParams] = useSearchParams();
  const { activeAddress, activeWallet, isLoading } = useWallet();
  const requestId = searchParams.get("requestId") || "";

  // Identity changes start a new review immediately, including A -> B -> A. A previous
  // identity's loaded addresses or pending decision must never become this review's state.
  return (
    <ConnectionApproval
      key={JSON.stringify([requestId, activeWallet?.id, activeAddress?.address])}
      requestId={requestId}
      activeWallet={activeWallet}
      activeAddress={activeAddress}
      isLoading={isLoading}
    />
  );
}

function ConnectionApproval({ requestId, activeWallet, activeAddress, isLoading }: {
  requestId: string;
  activeWallet: Wallet | null;
  activeAddress: Address | null;
  isLoading: boolean;
}): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const mounted = useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [faviconError, setFaviconError] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(true);
  const [requestOrigin, setRequestOrigin] = useState("");
  const [pairedAddressesRequested, setPairedAddressesRequested] = useState(false);
  const [pairedAddresses, setPairedAddresses] = useState<PairedAddresses | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [pairedAddressError, setPairedAddressError] = useState(false);

  // The displayed site comes only from the matched background request.
  let domain = requestOrigin;
  try { domain = new URL(requestOrigin).hostname; } catch { /* Keep an unavailable origin empty. */ }
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

  const address = activeAddress?.address;
  const walletId = activeWallet?.id;
  const supportsPairedAddresses = activeWallet?.type === "mnemonic"
    && Boolean(getPairedAddressFormats(activeWallet.addressFormat));

  // A paired request states both addresses in the request itself rather than adding an opt-in
  // below the fold that is easy to miss: what the screen says is what Connect grants.
  const pairedRequestSupported =
    pairedAddressesRequested && supportsPairedAddresses;
  // Without the addresses the extra access cannot be granted, so fall back to the ordinary
  // single-address screen and say so rather than listing access the connection will not carry.
  const showPairedConsent = pairedRequestSupported && !pairedAddressError;
  const pairedAddressesPending = showPairedConsent && !pairedAddresses;
  const grantsPairedAddresses = pairedRequestSupported && Boolean(pairedAddresses);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!address || !walletId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const approval = await getApprovalService().getCurrentApproval();
        if (cancelled) return;
        const identityError = getApprovalIdentityError(
          approval, requestId, address, walletId,
        );
        setApprovalError(identityError);
        if (!identityError && approval) setRequestOrigin(approval.origin);
        const requested = !identityError && approval?.params?.[0]?.capabilities?.pairedAddresses === true;
        setPairedAddressesRequested(requested);
        setApprovalLoading(false);
        if (!requested || !supportsPairedAddresses) return;

        try {
          const pairs = await getWalletService().getPairedAddresses();
          if (cancelled) return;
          // The service derives the currently selected wallet. A late background selection
          // must not turn a valid request for A into displayed consent for B's addresses.
          if (!pairs || (pairs.legacy.address !== address && pairs.segwit.address !== address)) {
            throw new Error(t('connect_approve_paired_addresses_do_not_include'));
          }
          setPairedAddresses(pairs);
        } catch {
          if (cancelled) return;
          setPairedAddressError(true);
        }
      } catch {
        if (cancelled) return;
        setApprovalError(t('connect_approve_unable_to_load_this_connection'));
        setApprovalLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [requestId, address, walletId, supportsPairedAddresses]);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: t('connect_approve_wallet_connect'),
    });
  }, [setHeaderProps]);

  useEffect(() => {
    // Wait for wallet context to finish loading before redirecting
    if (isLoading) return;

    // If no active wallet/address after loading, redirect to unlock
    if (!activeWallet || !activeAddress) {
      navigate("/");
    }
  }, [activeWallet, activeAddress, isLoading, navigate]);

  const handleApprove = async () => {
    if (approvalLoading || pairedAddressesPending || approvalError || isProcessing) return;
    setIsProcessing(true);
    try {
      // Resolve approval via ApprovalService proxy
      const approvalService = getApprovalService();
      const approval = await Promise.resolve(approvalService.getCurrentApproval());
      if (!mounted.current) return;
      const identityError = getApprovalIdentityError(
        approval,
        requestId,
        activeAddress?.address,
        activeWallet?.id,
      );
      if (identityError) {
        setApprovalError(identityError);
        setIsProcessing(false);
        return;
      }
      const resolved = await approvalService.resolveApproval(requestId, {
        approved: true,
        updatedParams: {
          pairedAddresses: grantsPairedAddresses,
        },
      });
      if (!mounted.current) return;
      if (!resolved) {
        // The request is gone and could not be completed without its caller. Say so rather than
        // closing on a click that did nothing.
        setApprovalError(t('connect_approve_this_request_expired_please_connect'));
        setIsProcessing(false);
        return;
      }
      // Close the popup
      window.close();
    } catch (error) {
      if (!mounted.current) return;
      console.error("Failed to approve connection:", error);
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      // Reject approval via ApprovalService proxy
      const approvalService = getApprovalService();
      await approvalService.rejectApproval(requestId, t('connect_approve_user_denied_the_request'));
      if (!mounted.current) return;
      // Close the popup
      window.close();
    } catch (error) {
      if (!mounted.current) return;
      console.error("Failed to reject connection:", error);
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-dvh p-4">
        <div className="text-center">
          <p className="text-gray-500">{t('connect_approve_loading')}</p>
        </div>
      </div>
    );
  }

  if (!activeAddress || !activeWallet) {
    return (
      <div className="flex items-center justify-center h-dvh p-4">
        <div className="text-center">
          <p className="text-gray-500">{t('common_please_unlock_your_wallet_first')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Content */}
      <div data-testid="approval-content" className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto">
          {/* Wallet info - shown at top */}
          <div className="flex items-center justify-between mb-6">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {activeWallet.name}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {activeAddress.address}
              </p>
            </div>
            <div className="ml-3 flex-shrink-0">
              <div className="size-2.5 bg-green-500 rounded-full"></div>
            </div>
          </div>

          {/* Site info card */}
          <div className="bg-gray-50 rounded-xl p-5 text-center">
            <div className="inline-flex items-center justify-center size-14 bg-blue-100 rounded-full mb-3">
              {faviconError || !requestOrigin ? (
                <FiGlobe className="size-7 text-blue-600" aria-hidden="true" />
              ) : (
                <img
                  src={faviconUrl}
                  alt={t('connect_approve_favicon', [String(domain)])}
                  className="size-7 rounded"
                  onError={() => setFaviconError(true)}
                />
              )}
            </div>

            <h2 className="text-lg font-bold text-gray-900 mb-0.5">{domain}</h2>
            <p className="text-xs text-gray-400 break-all">{requestOrigin}</p>

            <div className="mt-4 p-2.5 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm text-yellow-800">
                {showPairedConsent ? (
                  <>
                    
                    {t('connect_approve_this_site_is_requesting_access')}{" "}
                    <span className="font-bold">{t('connect_approve_both_of_your_wallet_addresses')}</span>
                  </>
                ) : (
                  t('connect_approve_this_site_is_requesting_access_2')
                )}
              </p>
              {pairedAddresses && showPairedConsent && (
                <dl className="mt-3 space-y-3 text-left text-yellow-900">
                  <div>
                    <dt className="text-xs">{t('connect_approve_legacy_address')}</dt>
                    <dd className="mt-1"><ApprovalIdentifier value={pairedAddresses.legacy.address} /></dd>
                  </div>
                  <div>
                    <dt className="text-xs">{t('connect_approve_native_segwit_address')}</dt>
                    <dd className="mt-1"><ApprovalIdentifier value={pairedAddresses.segwit.address} /></dd>
                  </div>
                </dl>
              )}
            </div>
          </div>

          {/* Permissions */}
          <div className="mt-4 px-1">
            <p className="text-xs font-medium text-gray-500 mb-2">{t('connect_approve_this_site_will_be_able')}</p>
            <ul className="space-y-1.5">
              <li className="flex items-center">
                <FaCheck className="size-3.5 text-green-500 mr-2 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-gray-600">
                  {showPairedConsent ? t('connect_approve_view_your_wallet_addresses') : t('connect_approve_view_your_wallet_address')}
                </span>
              </li>
              <li className="flex items-center">
                <FaCheck className="size-3.5 text-green-500 mr-2 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-gray-600">
                  {showPairedConsent
                    ? t('connect_approve_request_signatures_from_either_address')
                    : t('connect_approve_request_transaction_signatures')}
                </span>
              </li>
              <li className="flex items-center">
                <FaCheck className="size-3.5 text-green-500 mr-2 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-gray-600">{t('connect_approve_request_message_signatures')}</span>
              </li>
            </ul>
            {pairedAddressError && (
              <p className="mt-2 text-xs font-medium text-red-700">
                {t('connect_approve_paired_addresses_are_unavailable_connecting')}
              </p>
            )}
          </div>

          {approvalError && <ErrorAlert message={approvalError} />}
        </div>
      </div>

      {/* Actions - pinned to bottom */}
      <div data-testid="approval-footer" className="shrink-0 bg-white border-t border-gray-200 p-4">
        <div className="max-w-md mx-auto grid grid-cols-2 gap-3">
          <Button
            color="gray"
            onClick={handleReject}
            disabled={isProcessing}
            fullWidth
          >
            {t('common_cancel')}
          </Button>
          <Button
            color="blue"
            onClick={handleApprove}
            disabled={isProcessing || approvalLoading || Boolean(approvalError) || pairedAddressesPending}
            fullWidth
          >
            {isProcessing ? t('connect_approve_processing') : approvalLoading ? t('connect_approve_loading_request') : pairedAddressesPending ? t('connect_approve_loading_addresses') : approvalError ? t('approval_bitcoin_payment_card_unavailable') : showPairedConsent ? t('connect_approve_connect_both') : t('common_connect')}
          </Button>
        </div>
      </div>
    </div>
  );
}
