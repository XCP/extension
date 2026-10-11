import type { AddressFormat } from '@/core/bitcoin/addressFormat';
import { walletSupportsPair } from '@/core/bitcoin/providerSignerScope';
import { PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import type { ConnectionService } from '@/services/connectionService';
import type { WalletService } from '@/services/walletService';
import type { PairedAddresses } from '@/types/wallet';

/** 4100 lets sites request unlock instead of treating absent identity as an internal failure. */
export const walletLocked = () => new ProviderError(
  PROVIDER_ERROR_CODES.UNAUTHORIZED,
  'Wallet is locked or not set up. Unlock XCP Wallet and try again.',
);

/** The active address's Legacy/SegWit pair, loaded only for a wallet that can derive one. */
export async function loadPairedAddresses(
  walletService: Pick<WalletService, 'getPairedAddresses'>,
  wallet: { type: string; addressFormat: AddressFormat },
): Promise<PairedAddresses | null> {
  return walletSupportsPair(wallet) ? await walletService.getPairedAddresses() : null;
}

/** Refuse (4100) a request that signs with a paired sibling the site was never granted. */
export async function assertPairedAddressGrant(
  connectionService: Pick<ConnectionService, 'hasPairedAddressPermission'>,
  origin: string,
  identity: { walletId: string; address: string },
): Promise<void> {
  if (!await connectionService.hasPairedAddressPermission(origin, identity.walletId, identity.address)) {
    throw new ProviderError(
      PROVIDER_ERROR_CODES.UNAUTHORIZED,
      'Paired Legacy/SegWit address access has not been granted',
    );
  }
}

