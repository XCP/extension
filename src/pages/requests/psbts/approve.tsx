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
    setHeaderProps({ title: 'Accept Offer + Fee Bump' });
  }, [setHeaderProps]);

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
    if (decodedInfo.review.status !== 'proved') {
      setError('Both linked transactions must prove before signing begins.');
      return;
    }

    setIsSigning(true);
    setError('');
    try {
      const walletService = getWalletService();
      // Nothing is returned to the site until both signers succeed. A rejection or hardware
      // cancellation on the child discards the in-memory parent result.
      const parent = await walletService.signPsbt(
        request.items[0].psbtHex,
        request.items[0].signInputs,
        request.items[0].sighashTypes,
      );
      const child = await walletService.signPsbt(
        request.items[1].psbtHex,
        request.items[1].signInputs,
        request.items[1].sighashTypes,
      );
      await handleSuccess([parent, child]);
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

  const blocked = decodedInfo.review.status !== 'proved';
  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-4">
          <ApprovalWalletHeader walletName={activeWallet.name} address={activeAddress.address} />
          <ApprovalSiteBar origin={request.origin} />
          <MarketplaceReviewCard review={decodedInfo.review} />
          {error && <ErrorAlert message={error} />}
          {blocked && decodedInfo.review.blockers.length > 0 && (
            <ErrorAlert message={decodedInfo.review.blockers.join('; ')} />
          )}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            Both transactions were reviewed together. The wallet returns neither signature unless
            both signing operations finish successfully.
          </div>
          <Collapsible variant="card" title="Linked Transaction Details">
            <div className="space-y-3 text-xs">
              <div>
                <p className="font-semibold text-gray-900">1. Exact sale parent</p>
                <p className="mt-1 break-all text-gray-500">{decodedInfo.parent.txid}</p>
                <p className="mt-1 text-gray-700">
                  Fee: {decodedInfo.parent.psbtDetails.fee.toLocaleString()} sats
                </p>
              </div>
              <div className="border-t border-gray-200 pt-3">
                <p className="font-semibold text-gray-900">2. Seller CPFP child</p>
                <p className="mt-1 break-all text-gray-500">{decodedInfo.child.transactionId}</p>
                <p className="mt-1 text-gray-700">
                  Fee: {decodedInfo.child.fee.toLocaleString()} sats
                </p>
              </div>
            </div>
          </Collapsible>
        </div>
      </div>
      <ApprovalFooter
        onCancel={handleReject}
        onSign={handleSign}
        busy={isSigning}
        blocked={blocked}
        isHardware={activeWallet.type === 'hardware'}
      />
    </div>
  );
}
