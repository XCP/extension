/**
 * Signatures that leave an attached asset's destination open.
 *
 * SIGHASH_SINGLE and SIGHASH_NONE commit at most the output paired with the signed input. Over a
 * UTXO that carries Counterparty assets, that is a durable authorization to sell those assets:
 * whoever holds the signature can add inputs, pay the one committed output, and choose where the
 * assets go (Core's first non-OP_RETURN output, or an explicit detach message they add) — at any
 * time until the UTXO is spent. The marketplace listing (`create_listing`) is exactly that offer,
 * made on purpose, and its proof checks the asset, quantity, price and seller output byte for byte.
 * Nothing else earns it: a generic review screen with an acknowledgement is how a phishing page
 * would collect one.
 *
 * ALL|ANYONECANPAY is not included. It commits every output, so the destination the screen shows
 * is the destination the transaction delivers to; the attached-asset destination warning still
 * says where the assets land.
 *
 * `analyzeSignRequest` raises the warning from this, and the execution policy blocks from the same
 * function, so the screen and the signer cannot disagree.
 */

import { SigHash } from '@scure/btc-signer';
import { sighashBase } from '@/core/bitcoin/psbt';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';
import type { MarketplaceApprovalReview } from '@/core/counterparty/marketplaceIntent';

/** True when the sighash does not commit every output. Taproot's 0x00 default is ALL. */
export function leavesOutputsUncommitted(sighashType: number): boolean {
  const base = sighashBase(sighashType);
  return base !== SigHash.DEFAULT && base !== SigHash.ALL;
}

/**
 * The signed inputs whose signature would leave attached (or possibly attached) assets free to go
 * anywhere, excluding only the seller input of a proved marketplace listing.
 *
 * An input whose asset status is unknown counts: the point of the lookup failing is that the
 * wallet cannot rule out that it is exactly such an asset.
 */
export function findUncommittedAssetSignatures(
  attachedAssets: InputAttachedAssets[],
  signedInputs: Array<{ index: number; sighashType: number }>,
  marketplaceReview: Pick<MarketplaceApprovalReview, 'status' | 'family'> | undefined,
): number[] {
  // The listing proof requires exactly one signed input, input 1, signed 0x83, and independently
  // resolves that input to the claimed asset and quantity. It exempts that input and no other.
  const provedListingInput = marketplaceReview?.family === 'create_listing'
    && marketplaceReview.status === 'proved' ? 1 : undefined;
  const byIndex = new Map(attachedAssets.map(entry => [entry.inputIndex, entry]));
  return signedInputs
    .filter(input => leavesOutputsUncommitted(input.sighashType))
    .filter(input => input.index !== provedListingInput)
    .filter(input => {
      const entry = byIndex.get(input.index);
      return !!entry && (entry.assets.length > 0 || !!entry.lookupFailed);
    })
    .map(input => input.index)
    .sort((a, b) => a - b);
}
