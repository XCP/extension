import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { fetchWalletInputsAttachedAssets } from '@/core/counterparty/inputAssets';
import { type AttachmentEvidenceSource, liveAttachmentEvidenceSource } from '@/core/counterparty/pendingAttachments';

export interface FundingIntent {
  composeType: string;
  /** The source selected in the user's form, never an echoed composer parameter. */
  sourceUtxo?: unknown;
}

/** Every fee input must be proven plain BTC. Move/Detach may spend only their named asset source. */
export async function assertFundingIsAssetFree(
  rawTxHex: string,
  intent: FundingIntent,
  evidenceSource: AttachmentEvidenceSource = liveAttachmentEvidenceSource,
): Promise<void> {
  const parsed = parseRawTransactionLocally(rawTxHex);
  if (!parsed || parsed.inputs.length === 0) throw new Error('Unable to verify transaction funding inputs.');
  const inputs = parsed.inputs.map((input, index) => ({ ...input, index }));
  let intentionalSource: string | undefined;
  if (intent.composeType === 'move' || intent.composeType === 'detach') {
    if (typeof intent.sourceUtxo !== 'string' || !/^[0-9a-f]{64}:\d+$/i.test(intent.sourceUtxo)) {
      throw new Error('Select the asset UTXO to move or detach before signing.');
    }
    intentionalSource = intent.sourceUtxo.toLowerCase();
    if (!inputs.some(input => `${input.txid}:${input.vout}`.toLowerCase() === intentionalSource)) {
      throw new Error('The transaction does not spend the asset UTXO you selected.');
    }
  }
  const funding = inputs.filter(input => `${input.txid}:${input.vout}`.toLowerCase() !== intentionalSource);
  if (funding.length === 0) return;
  // Recheck actual inputs, including Core-selected fallback inputs. Do not treat a local
  // change-cache entry as proof: an implicit asset move can also pay the wallet itself.
  const assets = await fetchWalletInputsAttachedAssets(funding, evidenceSource);
  if (assets.some(entry => entry.assets.length > 0 || entry.lookupFailed)) {
    throw new Error('Transaction funding contains assets or cannot yet be proven asset-free. Wait for pending transactions to confirm and be indexed, or add clean BTC.');
  }
}
