import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import { parseCancelOffersIntent } from '@/core/bitcoin/offerCancellation';
import { signerScope } from '@/core/bitcoin/providerSignerScope';
import { CONNECTION_PROOF_PREFIX } from '@/core/connectionProof';
import { isRecord } from '@/core/isRecord';
import { PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { beginSignFlow } from '@/platform/provider/signFlow';
import type { ConnectionService } from '@/services/connectionService';
import { invalidParams } from '@/services/provider/requestIntake';
import { runSignFlow } from '@/services/provider/signApproval';
import { assertPairedAddressGrant, loadPairedAddresses, walletLocked } from '@/services/provider/signingIdentity';
import type { WalletService } from '@/services/walletService';

export async function signProviderMessage(
  origin: string,
  params: unknown[],
  connectionService: Pick<ConnectionService, 'hasPermission' | 'hasPairedAddressPermission'>,
  walletService: Pick<WalletService, 'getActiveAddress' | 'getActiveWallet' | 'getPairedAddresses'>,
) {
  const method = 'xcp_signMessage';
  const message = params?.[0];
  const address = params?.[1];
  const options = params?.[2];
  const cancelOffersIntent = parseCancelOffersIntent(isRecord(options) && 'intent' in options ? options.intent : options);

  if (!message) {
    throw invalidParams('Message is required');
  }
  if (typeof message !== 'string') {
    throw invalidParams('Message must be a string');
  }
  if (message.startsWith(CONNECTION_PROOF_PREFIX)) {
    throw invalidParams('Messages in the connection-proof namespace are reserved');
  }

  if (address !== undefined && typeof address !== 'string') {
    throw invalidParams('Address must be a string');
  }

  if (!await connectionService.hasPermission(origin)) {
    throw new ProviderError(PROVIDER_ERROR_CODES.UNAUTHORIZED, 'Unauthorized - not connected to wallet');
  }

  const activeAddress = await walletService.getActiveAddress();
  const activeWallet = await walletService.getActiveWallet();
  if (!activeAddress || !activeWallet) {
    throw walletLocked();
  }

  let signingAddress = activeAddress.address;
  if (
    address
    && normalizeAddressForComparison(address) !== normalizeAddressForComparison(activeAddress.address)
  ) {
    const paired = await loadPairedAddresses(walletService, activeWallet);
    const target = signerScope(activeAddress.address, paired).findPairedTarget(address);
    if (!target) {
      throw invalidParams('Specified address is not the active address or its paired sibling');
    }
    await assertPairedAddressGrant(
      connectionService, origin, { walletId: activeWallet.id, address: activeAddress.address });
    signingAddress = target.address;
  }

  return await runSignFlow({
    origin,
    method,
    params: { message, signingAddress, ...(cancelOffersIntent ? { cancelOffersIntent } : {}) },
    identity: { walletId: activeWallet.id, address: activeAddress.address },
    pairedAddresses: signingAddress !== activeAddress.address,
    approval: {
      kind: 'sign-message',
      analyticsEvent: 'message_signed',
      cancelMessage: 'User cancelled sign message request',
      timeoutMessage: 'Sign message request timeout',
      mapResult: (result) => result.signature,
    },
    create: async (requestId, requestKey) => {
      // Binds the request to the authorized address/wallet so signing
      // can't later use a different identity.
      await beginSignFlow({
        id: requestId,
        origin,
        requestKey,
        kind: 'sign-message',
        message,
        ...(cancelOffersIntent ? { cancelOffersIntent } : {}),
        address: activeAddress.address,
        signingAddress,
        walletId: activeWallet.id,
        timestamp: Date.now(),
      });
    },
    approvalRoute: '#/requests/message/approve',
  });
}
