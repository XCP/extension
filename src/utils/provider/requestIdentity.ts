import type { AuthorizedRequest } from '@/utils/storage/requestStorage';

/**
 * Returns an error message if the active signing identity no longer matches the
 * one authorized when the request was created, or null if it still matches.
 * Used by the approve screens to refuse signing after a wallet/address switch.
 */
export function getIdentityMismatchError(
  request: AuthorizedRequest,
  activeAddress: string | undefined,
  activeWalletId: string | undefined,
): string | null {
  const addressChanged = request.address !== activeAddress;
  const walletChanged = Boolean(request.walletId) && request.walletId !== activeWalletId;
  if (addressChanged || walletChanged) {
    return 'The active address changed after this request was made. Switch back to the authorized address, or reconnect the site.';
  }
  return null;
}
