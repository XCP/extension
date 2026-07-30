import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FiClock, FiGlobe } from '@/components/icons';

/*
 * Shared chrome for the provider approval screens (PSBT and raw transaction),
 * which are otherwise near-duplicates. These are the identical, self-contained
 * pieces: the three gate states, the wallet-identity header, the requesting-site
 * bar, and the Cancel/Sign footer. Page-specific content (action/fee card,
 * warnings, details) stays in each page.
 */

/** Full-screen loading gate. */
export function ApprovalLoading() {
  return (
    <div className="flex items-center justify-center h-dvh p-4">
      <div className="text-center">
        <div className="animate-spin rounded-full size-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-500">Loading transaction details…</p>
      </div>
    </div>
  );
}

/** Full-screen "request no longer available" gate. */
export function ApprovalExpired({ message }: { message?: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center h-dvh p-6">
      <div className="bg-gray-100 rounded-full p-4 mb-4">
        <FiClock className="size-8 text-gray-400" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-gray-700 mb-1">Request Expired</p>
      <p className="text-xs text-gray-500 mb-6 text-center max-w-[240px]">
        {message || 'This signing request is no longer available.'}
      </p>
      <Button color="gray" onClick={() => window.close()} className="min-w-[160px]">
        Close Window
      </Button>
    </div>
  );
}

/** Full-screen "unlock first" gate. */
export function ApprovalNoWallet() {
  return (
    <div className="flex items-center justify-center h-dvh p-4">
      <div className="text-center">
        <p className="text-gray-500">Please unlock your wallet first</p>
      </div>
    </div>
  );
}

/** Active wallet name + address with a connected dot. */
export function ApprovalWalletHeader({ walletName, address }: { walletName: string; address: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{walletName}</p>
        <p className="text-xs text-gray-500 truncate">{address}</p>
      </div>
      <div className="ml-3 flex-shrink-0">
        <div className="size-2.5 bg-green-500 rounded-full"></div>
      </div>
    </div>
  );
}

/** Requesting-site bar: favicon (with fallback), hostname, and full origin. */
export function ApprovalSiteBar({ origin }: { origin: string }) {
  const [faviconError, setFaviconError] = useState(false);
  let domain = origin;
  try {
    domain = new URL(origin).hostname;
  } catch {
    // keep the raw origin as the display domain
  }
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  return (
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
        <p className="text-xs text-gray-400 truncate">{origin}</p>
      </div>
    </div>
  );
}

/** Cancel / Sign footer. `blocked` disables signing; `isHardware` changes the busy label. */
export function ApprovalFooter({
  onCancel,
  onSign,
  busy,
  blocked,
  isHardware,
}: {
  onCancel: () => void;
  onSign: () => void;
  busy: boolean;
  blocked: boolean;
  isHardware: boolean;
}) {
  return (
    <div className="bg-white border-t border-gray-200 p-4">
      <div className="max-w-md mx-auto grid grid-cols-2 gap-3">
        <Button color="gray" onClick={onCancel} disabled={busy} fullWidth>
          Cancel
        </Button>
        <Button color="blue" onClick={onSign} disabled={busy || blocked} fullWidth>
          {busy ? (isHardware ? 'Confirm on device…' : 'Signing…') : blocked ? 'Blocked' : 'Sign'}
        </Button>
      </div>
    </div>
  );
}
