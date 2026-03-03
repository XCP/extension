import { useState, useEffect } from 'react';
import { FiGlobe, FiClock } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from '@/components/ui/error-alert';
import { useWallet } from '@/contexts/wallet-context';
import { useHeader } from '@/contexts/header-context';
import { useSignMessageRequest } from '@/hooks/useSignMessageRequest';
import { signMessage } from '@/utils/blockchain/bitcoin/messageSigner';
import type { AddressFormat } from '@/utils/blockchain/bitcoin/address';

export default function ApproveMessagePage() {
  const { activeAddress, activeWallet, getPrivateKey } = useWallet();
  const { setHeaderProps } = useHeader();
  const {
    request,
    isLoading,
    error: loadError,
    handleSuccess,
    handleCancel,
    isProviderRequest
  } = useSignMessageRequest();

  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string>('');
  const [faviconError, setFaviconError] = useState(false);

  // Parse origin to get domain name
  const getDomain = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  };

  const domain = request ? getDomain(request.origin) : '';
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Sign Message",
    });
  }, [setHeaderProps]);

  const handleSign = async () => {
    if (!request || !activeWallet || !activeAddress) return;

    setIsSigning(true);
    setError('');

    try {
      const addressFormat = activeWallet.addressFormat as AddressFormat;

      let resultSignature: string;

      if (activeWallet.type === 'hardware') {
        // Use TrezorAdapter for hardware wallet signing
        const { getTrezorAdapter } = await import('@/utils/hardware/trezorAdapter');
        const { DerivationPaths } = await import('@/utils/hardware/types');
        const trezor = getTrezorAdapter();
        await trezor.init();

        const hwResult = await trezor.signMessage({
          path: DerivationPaths.stringToPath(activeAddress.path),
          message: request.message,
          coin: 'Bitcoin',
        });

        resultSignature = hwResult.signature;
      } else {
        // Software wallet - get private key and sign locally
        const privateKeyResult = await getPrivateKey(
          activeWallet.id,
          activeAddress.path
        );

        const result = await signMessage(
          request.message,
          privateKeyResult.hex,
          addressFormat,
          privateKeyResult.compressed
        );

        resultSignature = result.signature;
      }

      await handleSuccess({ signature: resultSignature });
      window.close();
    } catch (err) {
      console.error('Failed to sign message:', err);
      setError(err instanceof Error ? err.message : 'Failed to sign message');
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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-dvh p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full size-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading request…</p>
        </div>
      </div>
    );
  }

  // Error state
  if (loadError || !request) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh p-6">
        <div className="bg-gray-100 rounded-full p-4 mb-4">
          <FiClock className="size-8 text-gray-400" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-gray-700 mb-1">Request Expired</p>
        <p className="text-xs text-gray-500 mb-6 text-center max-w-[240px]">
          {loadError || 'This signing request is no longer available.'}
        </p>
        <Button color="gray" onClick={() => window.close()} className="min-w-[160px]">
          Close Window
        </Button>
      </div>
    );
  }

  // No wallet state
  if (!activeAddress || !activeWallet) {
    return (
      <div className="flex items-center justify-center h-dvh p-4">
        <div className="text-center">
          <p className="text-gray-500">Please unlock your wallet first</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-4">
          {/* Wallet info - shown at top */}
          <div className="flex items-center justify-between">
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

          {/* Site info - slim bar */}
          <div className="bg-white rounded-lg shadow-sm px-4 py-3 flex items-center gap-3">
            <div className="flex-shrink-0 inline-flex items-center justify-center size-8 bg-blue-100 rounded-full">
              {faviconError ? (
                <FiGlobe className="size-4 text-blue-600" aria-hidden="true" />
              ) : (
                <img
                  src={faviconUrl}
                  alt={`${domain} favicon`}
                  className="size-4 rounded-sm"
                  onError={() => setFaviconError(true)}
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{domain}</p>
              <p className="text-xs text-gray-400 truncate">{request.origin}</p>
            </div>
          </div>

          {error && <ErrorAlert message={error} />}

          {/* Message content */}
          <div className="bg-white rounded-lg shadow-sm p-5">
            <p className="text-xs text-gray-500 mb-2">Message to sign</p>
            <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
              <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                {request.message}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="max-w-md mx-auto grid grid-cols-2 gap-3">
          <Button
            color="gray"
            onClick={handleReject}
            disabled={isSigning}
            fullWidth
          >
            Cancel
          </Button>
          <Button
            color="blue"
            onClick={handleSign}
            disabled={isSigning}
            fullWidth
          >
            {isSigning ? (activeWallet.type === 'hardware' ? 'Confirm on device…' : 'Signing…') : 'Sign'}
          </Button>
        </div>
      </div>
    </div>
  );
}
