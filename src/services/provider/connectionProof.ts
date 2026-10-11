/** Connection proofs bound to the approved identity, session, and optional sibling grant. */
import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import type { AddressFormat } from '@/core/bitcoin/addressFormat';
import { type MessageSignatureScheme, softwareMessageSignatureScheme } from '@/core/bitcoin/messageSigner';
import { CONNECTION_PROOF_PREFIX } from '@/core/connectionProof';
import type { AuthorizedRequest } from '@/platform/storage/requestStorage';
import { getConnectionService } from '@/services/connectionService';
import { assertSignDeliveryAuthorized } from '@/services/provider/signDelivery';
import { getWalletService } from '@/services/walletService';

type ProviderConnectionProof = {
  address: string;
  message: string;
  signature: string;
  verification: MessageSignatureScheme;
};

export type ConnectionProofContext = {
  request: AuthorizedRequest;
  sessionGeneration: number;
  hardware: boolean;
  pairedSupported: boolean;
  format: AddressFormat;
};

/**
 * Generate a connection proof: auto-sign a deterministic message proving
 * the user controls the address. No user prompt — they already approved connecting.
 * The message format is locked down so it can't be confused with arbitrary signing.
 */
async function generateConnectionProof(
  context: ConnectionProofContext,
  target: { address: string; format: AddressFormat },
): Promise<ProviderConnectionProof | null> {
  try {
    const walletService = getWalletService();

    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const issued = Math.floor(Date.now() / 1000);

    const message = `${CONNECTION_PROOF_PREFIX}origin:${context.request.origin}\nnonce:${nonce}\nissued:${issued}`;

    const result = await walletService.signMessage(
      message,
      target.address,
      { walletId: context.request.walletId, address: context.request.address },
    );

    if (normalizeAddressForComparison(result.address) !== normalizeAddressForComparison(target.address)) {
      throw new Error('Connection proof signed for a different address');
    }

    return {
      address: target.address,
      message,
      signature: result.signature,
      verification: context.hardware
        ? { method: 'BIP-137', format: 'legacy_recoverable' }
        : softwareMessageSignatureScheme(target.format),
    };
  } catch (error) {
    console.warn('[ProviderService] Failed to generate connection proof:', error);
    return null;
  }
}

/** Sign and deliver only the identity and optional sibling grant approved by this connection. */
export async function buildConnectResponse(accounts: string[], context: ConnectionProofContext) {
  if (accounts.length !== 1
    || normalizeAddressForComparison(accounts[0]!) !== normalizeAddressForComparison(context.request.address)) {
    throw new Error('The connection identity changed before its proof was generated');
  }
  const { request, sessionGeneration } = context;
  // A connection proof is bound to the exact identity approved; it never continues across the pair.
  const authorize = (paired: boolean) => assertSignDeliveryAuthorized(request, paired, sessionGeneration, false);
  let assertCurrent = await authorize(false);
  assertCurrent();
  const paired = context.pairedSupported && await getConnectionService().hasPairedAddressPermission(
    request.origin, request.walletId, request.address,
  );
  assertCurrent();

  const targets = [{ address: request.address, format: context.format }];
  if (paired) {
    assertCurrent = await authorize(true);
    // getPairedAddresses captures the current wallet synchronously. Check the pinned
    // identity immediately before calling it and again before using the derived pair.
    assertCurrent();
    const addresses = await getWalletService().getPairedAddresses();
    assertCurrent();
    for (const target of [addresses.legacy, addresses.segwit]) {
      if (!targets.some(candidate => normalizeAddressForComparison(candidate.address)
        === normalizeAddressForComparison(target.address))) targets.push(target);
    }
  }

  const proofs: ProviderConnectionProof[] = [];
  let proof: ProviderConnectionProof | null = null;
  for (const [index, target] of targets.entries()) {
    assertCurrent();
    const signed = await generateConnectionProof(context, target);
    assertCurrent();
    if (index === 0) proof = signed;
    if (signed) proofs.push(signed);
  }
  // Device refusal may omit a proof. Locking, switching, or revoking a grant
  // invalidates the entire response, including signatures already produced.
  const assertDelivery = await authorize(paired);
  assertDelivery();
  return { accounts, proof, ...(proofs.length > 1 ? { proofs } : {}) };
}
