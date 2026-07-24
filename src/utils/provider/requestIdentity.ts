import { normalizeAddressForComparison } from '@/utils/blockchain/bitcoin/address';
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
interface PsbtAuthorizationRequest extends AuthorizedRequest {
  signInputs?: Record<string, number[]>;
}

interface ProviderPermissionReader {
  hasPermission(origin: string): Promise<boolean>;
  hasPairedAddressPermission(origin: string, walletId: string, address: string): Promise<boolean>;
}

/** Revalidate provider grants immediately before a stored PSBT request is signed. */
export async function getPsbtPermissionError(
  request: PsbtAuthorizationRequest,
  activeAddress: string,
  permissions: ProviderPermissionReader
): Promise<string | null> {
  if (!await permissions.hasPermission(request.origin)) {
    return 'This site is no longer connected. Reconnect it before signing.';
  }

  const normalizedActiveAddress = normalizeAddressForComparison(activeAddress);
  const usesPairedAddress = Object.keys(request.signInputs ?? {}).some(
    address => normalizeAddressForComparison(address) !== normalizedActiveAddress
  );
  if (usesPairedAddress && (
    !request.walletId ||
    !await permissions.hasPairedAddressPermission(request.origin, request.walletId, request.address)
  )) {
    return 'Paired address access was revoked. Reconnect the site before signing.';
  }

  return null;
}
