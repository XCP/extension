import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { fetchInputsAttachedAssets } from '@/core/counterparty/inputAssets';
import { type AttachmentEvidenceSource, liveAttachmentEvidenceSource } from '@/core/counterparty/pendingAttachments';

/** Attach may spend only proven plain-BTC inputs, including before the ledger catches up. */
export async function assertAttachFundingIsAssetFree(
  rawTxHex: string,
  evidenceSource: AttachmentEvidenceSource = liveAttachmentEvidenceSource,
): Promise<void> {
  const parsed = parseRawTransactionLocally(rawTxHex);
  if (!parsed || parsed.inputs.length === 0) throw new Error('Unable to verify attach funding inputs.');
  // Do not trust the composition-time selection or a cached change claim here. Recheck the
  // actual inputs immediately before signing, including inputs chosen by Core's fallback.
  const assets = await fetchInputsAttachedAssets(parsed.inputs, undefined, async () => null, evidenceSource);
  if (assets.some(entry => entry.assets.length > 0 || entry.lookupFailed)) {
    throw new Error('Attach funding contains assets or cannot yet be proven asset-free. Wait for pending transactions to confirm and be indexed, or add clean BTC.');
  }
}
