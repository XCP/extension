import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { assertSessionGeneration } from '@/platform/auth/sessionManager';
import { getIdentityMismatchError } from '@/platform/provider/requestIdentity';
import { type ProviderSigningRequest, SIGN_FLOW_TTL_MS } from '@/platform/provider/signFlow';
import type { AuthorizedRequest } from '@/platform/storage/requestStorage';
import { walletManager } from '@/platform/walletManager';
import { getConnectionService } from '@/services/connectionService';
import { getWalletService } from '@/services/walletService';

export function needsPairedAddressGrant(request: ProviderSigningRequest): boolean {
  const active = normalizeAddressForComparison(request.address);
  const signers = request.kind === 'sign-message' ? [request.signingAddress ?? request.address]
    : request.kind === 'sign-transaction' ? [request.address]
    : request.kind === 'sign-psbt' ? Object.keys(request.signInputs ?? {})
    : request.items.flatMap(item => Object.keys(item.signInputs));
  return signers.some(address => normalizeAddressForComparison(address) !== active);
}

export type SignDeliveryGuard = () => void;

/**
 * Signing and delivery are separate authorization points: persisting a successful
 * signature can yield while the user locks the wallet or revokes a connection.
 * Call after the last storage read, then invoke the returned synchronous guard
 * immediately before exposing the result. It checks the current background-owned
 * grant and identity even if a queued mutation runs during the final await or
 * the caller's continuation. Refusal leaves completed results intact.
 */
export async function assertSignDeliveryAuthorized(
  request: AuthorizedRequest,
  pairedAddresses: boolean,
  sessionGeneration: number,
): Promise<SignDeliveryGuard> {
  const wallet = getWalletService();
  const permissions = getConnectionService();
  if (!await wallet.isKeychainUnlocked()) throw new Error('Wallet is locked');
  if (!await permissions.hasPermission(request.origin)) {
    throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'This site is no longer connected. Reconnect it before signing.');
  }
  if (pairedAddresses && !await permissions.hasPairedAddressPermission(
    request.origin, request.walletId, request.address,
  )) throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Paired address access was revoked');
  const activeAddress = await wallet.getActiveAddress();
  const activeWallet = await wallet.getActiveWallet();
  const mismatch = getIdentityMismatchError(request, activeAddress?.address, activeWallet?.id);
  if (mismatch) throw new Error(mismatch);
  const assertCurrentAuthorization = () => {
    // These are immediate in-memory reads from the background owner, not RPCs.
    // A ConnectionService cache or an earlier async snapshot cannot authorize
    // delivery after a settings mutation has removed the actual grant.
    assertSessionGeneration(sessionGeneration);
    const settings = walletManager.getSettings();
    if (!settings.connectedWebsites.includes(request.origin)) {
      throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'This site is no longer connected. Reconnect it before signing.');
    }
    const capability = settings.providerCapabilities?.[request.origin];
    if (pairedAddresses && (capability?.pairedAddresses !== true
      || capability.walletId !== request.walletId || capability.address !== request.address)) {
      throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Paired address access was revoked');
    }
    const currentWallet = walletManager.getActiveWallet();
    const currentAddress = currentWallet?.addresses.find(address => address.address === settings.lastActiveAddress)
      ?? currentWallet?.addresses[0];
    const currentMismatch = getIdentityMismatchError(request, currentAddress?.address, currentWallet?.id);
    if (currentMismatch) throw new Error(currentMismatch);
    if (Date.now() >= request.timestamp + SIGN_FLOW_TTL_MS) throw new Error('Signing request expired before delivery');
  };
  assertCurrentAuthorization();
  return assertCurrentAuthorization;
}
