import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { PROVIDER_REVIEW_MESSAGES, type ProviderReviewCode } from '@/core/providerReviewErrors';
import type { AuthorizedRequest } from '@/platform/storage/requestStorage';

/**
 * Returns a diagnostic code if the active signing identity no longer matches the
 * one authorized when the request was created, or null if it still matches.
 * Used by the approve screens to refuse signing after a wallet/address switch.
 */
export function getIdentityMismatchCode(
  request: AuthorizedRequest,
  activeAddress: string | undefined,
  activeWalletId: string | undefined,
): ProviderReviewCode | null {
  const addressChanged = request.address !== activeAddress;
  const walletChanged = Boolean(request.walletId) && request.walletId !== activeWalletId;
  if (addressChanged || walletChanged) {
    return 'identity_changed';
  }
  return null;
}
interface PsbtAuthorizationRequest extends AuthorizedRequest {
  signInputs?: Record<string, number[]>;
}

interface MessageAuthorizationRequest extends AuthorizedRequest {
  signingAddress?: string;
}

interface ProviderPermissionReader {
  hasPermission(origin: string): Promise<boolean>;
  hasPairedAddressPermission(origin: string, walletId: string, address: string): Promise<boolean>;
}

/**
 * Revalidate that the requesting site is still connected, immediately before signing.
 *
 * Identity checks answer "is this still the authorized wallet"; this answers "is this still an
 * authorized site". They are different questions, and an approval flow lives long enough — up to
 * ten minutes — for a user to revoke the site in Settings and then approve a request that was
 * already open. Signing would hand the result to an origin that no longer has permission.
 */
export async function getConnectionRevokedCode(
  request: AuthorizedRequest,
  permissions: Pick<ProviderPermissionReader, 'hasPermission'>,
): Promise<ProviderReviewCode | null> {
  if (!await permissions.hasPermission(request.origin)) {
    return 'connection_revoked';
  }
  return null;
}

/** Revalidate both the ordinary connection and the extra grant used when a
 * message is signed by the active address's Legacy/SegWit sibling. */
export async function getMessagePermissionCode(
  request: MessageAuthorizationRequest,
  permissions: ProviderPermissionReader,
): Promise<ProviderReviewCode | null> {
  if (!await permissions.hasPermission(request.origin)) {
    return 'connection_revoked';
  }

  const signingAddress = request.signingAddress ?? request.address;
  if (
    normalizeAddressForComparison(signingAddress) !== normalizeAddressForComparison(request.address)
    && (
      !request.walletId
      || !await permissions.hasPairedAddressPermission(request.origin, request.walletId, request.address)
    )
  ) {
    return 'paired_revoked';
  }

  return null;
}

/** Revalidate provider grants immediately before a stored PSBT request is signed. */
export async function getPsbtPermissionCode(
  request: PsbtAuthorizationRequest,
  activeAddress: string,
  permissions: ProviderPermissionReader
): Promise<ProviderReviewCode | null> {
  if (!await permissions.hasPermission(request.origin)) {
    return 'connection_revoked';
  }

  const normalizedActiveAddress = normalizeAddressForComparison(activeAddress);
  const usesPairedAddress = Object.keys(request.signInputs ?? {}).some(
    address => normalizeAddressForComparison(address) !== normalizedActiveAddress
  );
  if (usesPairedAddress && (
    !request.walletId ||
    !await permissions.hasPairedAddressPermission(request.origin, request.walletId, request.address)
  )) {
    return 'paired_revoked';
  }

  return null;
}

/** Preserve the existing raw-message API for callers outside the localized review UI. */
export function getIdentityMismatchError(...args: Parameters<typeof getIdentityMismatchCode>): string | null {
  const code = getIdentityMismatchCode(...args);
  return code ? PROVIDER_REVIEW_MESSAGES[code] : null;
}

export async function getConnectionRevokedError(...args: Parameters<typeof getConnectionRevokedCode>): Promise<string | null> {
  const code = await getConnectionRevokedCode(...args);
  return code ? PROVIDER_REVIEW_MESSAGES[code] : null;
}

export async function getMessagePermissionError(...args: Parameters<typeof getMessagePermissionCode>): Promise<string | null> {
  const code = await getMessagePermissionCode(...args);
  return code ? PROVIDER_REVIEW_MESSAGES[code] : null;
}

export async function getPsbtPermissionError(...args: Parameters<typeof getPsbtPermissionCode>): Promise<string | null> {
  const code = await getPsbtPermissionCode(...args);
  return code ? PROVIDER_REVIEW_MESSAGES[code] : null;
}
