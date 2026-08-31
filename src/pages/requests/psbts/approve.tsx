import { useEffect, useState } from 'react';
import {
  ApprovalExpired,
  ApprovalFooter,
  ApprovalLoading,
  ApprovalNoWallet,
  ApprovalSiteBar,
  ApprovalWalletHeader,
} from '@/components/domain/approval/approval-chrome';
import { MarketplaceReviewCard } from '@/components/domain/approval/marketplace-review-card';
import { Collapsible } from '@/components/ui/collapsible';
import { ErrorAlert } from '@/components/ui/error-alert';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import { usePopupLifecycle } from '@/hooks/usePopupLifecycle';
import { useSignPsbtsRequest } from '@/hooks/useSignPsbtsRequest';
import {
  getIdentityMismatchError,
  getPsbtPermissionError,
} from '@/platform/provider/requestIdentity';
import { signPsbtPhaseForDelivery } from '@/platform/provider/signPsbtPhase';
import { getConnectionService } from '@/services/connectionService';
import { getWalletService } from '@/services/walletService';

export default function ApprovePsbtsPage() {
  const { activeAddress, activeWallet } = useWallet();
  const { setHeaderProps } = useHeader();
  const { request, decodedInfo, isLoading, error: loadError, handleSuccess, handleCancel } =
    useSignPsbtsRequest();
  usePopupLifecycle(request?.id, 'sign-psbts');
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // "Accept Offer", not "Accept Offer + Fee Bump": the longer form truncates at popup width,
    // and the fee bump is a line item of the acceptance rather than a second act.
    const title = request?.bundleKind === 'acceptance-cpfp'
      ? 'Accept Offer'
      : request?.bundleKind === 'bulk-fanout'
        ? 'Prepare Listing Funds'
        : request?.bundleKind === 'bulk-attach'
          ? 'Attach Collectibles'
          : request?.bundleKind === 'bulk-listing'
            ? 'Authorize Listings'
            : 'Review Transaction Batch';
    setHeaderProps({ title });
  }, [request?.bundleKind, setHeaderProps]);

  const handleSign = async () => {
    if (!request || !decodedInfo || !activeAddress || !activeWallet) return;
    const identityError = getIdentityMismatchError(
      request,
      activeAddress.address,
      activeWallet.id,
    );
    if (identityError) {
      setError(identityError);
      return;
    }
    const combinedSignInputs = request.items.reduce<Record<string, number[]>>(
      (combined, item) => {
        for (const [address, indices] of Object.entries(item.signInputs)) {
          combined[address] = [...new Set([...(combined[address] ?? []), ...indices])];
        }
        return combined;
      },
      {},
    );
    const permissionError = await getPsbtPermissionError(
      { ...request, signInputs: combinedSignInputs },
      activeAddress.address,
      getConnectionService(),
    );
    if (permissionError) {
      setError(permissionError);
      return;
    }
    if (decodedInfo.review.status === 'blocked' || decodedInfo.review.status === 'retry') {
      setError('Every transaction in this phase must verify before signing begins.');
      return;
    }

    setIsSigning(true);
    setError('');
    try {
      const walletService = getWalletService();
      // Nothing is returned to the site until every signer succeeds. A rejection or hardware
      // cancellation on a later item discards every earlier in-memory result.
      const results = await signPsbtPhaseForDelivery(request.items, item =>
        walletService.signPsbt(
          item.psbtHex,
          item.signInputs,
          item.sighashTypes,
        ));
      await handleSuccess(results);
      window.close();
    } catch (signError) {
      console.error('Failed to sign PSBT bundle:', signError);
      setError(signError instanceof Error ? signError.message : 'Failed to sign PSBT bundle');
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
  if (loadError || !request || !decodedInfo) return <ApprovalExpired message={loadError} />;
  if (!activeAddress || !activeWallet) return <ApprovalNoWallet />;

  const blocked = decodedInfo.review.status === 'blocked' || decodedInfo.review.status === 'retry';
  // A proved bulk-listing batch is a one-screen decision like the single listing: the review
  // facts carry the durable-signature boundary, and the footer names what signing authorizes.
  const signLabel = request.bundleKind === 'bulk-listing'
    ? `Authorize ${request.items.length} listing${request.items.length === 1 ? '' : 's'}`
    : 'Sign';
  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-4">
          <ApprovalWalletHeader walletName={activeWallet.name} address={activeAddress.address} />
          <ApprovalSiteBar origin={request.origin} />
          {/* One voice for failures: the review card itself carries the blockers. */}
          <MarketplaceReviewCard review={decodedInfo.review} />
          {error && <ErrorAlert message={error} />}
          <Collapsible variant="card" title="Linked Transaction Details">
            <div className="space-y-3 text-xs">
              {decodedInfo.items.map((item, index) => (
                <div key={`${item.txid ?? 'transaction'}-${index}`} className={index > 0 ? 'border-t border-gray-200 pt-3' : ''}>
                  <p className="font-semibold text-gray-900">
                    {index + 1}. {item.marketplaceReview?.title
                      ?? request.items[index]?.marketplaceIntent.action
                        .replaceAll('_', ' ')
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
        </div>
      </div>
      <ApprovalFooter
        onCancel={handleReject}
        onSign={() => void handleSign()}
        busy={isSigning}
        blocked={blocked}
        isHardware={activeWallet.type === 'hardware'}
        signLabel={signLabel}
      />
    </div>
  );
}
