import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { type PairedGrant, pairedGrantCovers } from '@/core/pairedGrant';
import type { ProviderReviewCode } from '@/core/providerReviewErrors';

/**
 * The part of a stored provider request these checks read: which site asked, and the signing
 * identity it was authorized for. platform/storage's AuthorizedRequest satisfies it structurally.
 */
export interface AuthorizedIdentity {
  origin: string;
  address: string;
  walletId: string;
}

/**
 * Returns a diagnostic code if the active signing identity no longer matches the
 * one authorized when the request was created, or null if it still matches.
 * Used by the approve screens to refuse signing after a wallet/address switch.
 *
 * Switching to the same-index Legacy/SegWit sibling is not a different identity for a site whose
 * paired grant covers both halves: the user approved that pair together at connect time, so a
 * pending request continues. Pass `pairedGrant` only for a request whose signers the wallet can
 * resolve across the pair, and only with the origin's current grant. This keeps the request open;
 * it authorizes no signer — each signer is still checked against the grant at execution.
 */
export function getIdentityMismatchCode(
  request: AuthorizedIdentity,
  activeAddress: string | undefined,
  activeWalletId: string | undefined,
  pairedGrant?: PairedGrant,
): ProviderReviewCode | null {
  const walletChanged = Boolean(request.walletId) && request.walletId !== activeWalletId;
  if (walletChanged) return 'identity_changed';
  if (request.address === activeAddress) return null;
  return isGrantedPairedSibling(request, activeAddress, pairedGrant) ? null : 'identity_changed';
}

/** True when the active address is the request address's sibling under the origin's paired grant. */
export function isGrantedPairedSibling(
  request: AuthorizedIdentity,
  activeAddress: string | undefined,
  pairedGrant: PairedGrant | undefined,
): boolean {
  // A grant names one wallet and one derivation index: covering two different addresses means
  // they are that index's two halves. A grant recorded before the sibling was stored covers one.
  if (!request.walletId || !activeAddress || !pairedGrant) return false;
  return normalizeAddressForComparison(request.address) !== normalizeAddressForComparison(activeAddress)
    && pairedGrantCovers(pairedGrant, request.walletId, request.address)
    && pairedGrantCovers(pairedGrant, request.walletId, activeAddress);
}

/** Raw transactions are signed only by the wallet's own addresses, never across the pair. */
export function supportsPairedContinuity(kind: string): boolean {
  return kind === 'sign-message' || kind === 'sign-psbt' || kind === 'sign-psbts';
}
interface PsbtAuthorizationRequest extends AuthorizedIdentity {
  signInputs?: Record<string, number[]>;
}

interface MessageAuthorizationRequest extends AuthorizedIdentity {
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
  request: AuthorizedIdentity,
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
