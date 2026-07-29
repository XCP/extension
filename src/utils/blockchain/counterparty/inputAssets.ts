/**
 * Per-input Counterparty asset lookups for transaction/PSBT approval screens.
 *
 * A transaction input can spend a UTXO that carries attached Counterparty
 * assets; signing moves those assets, which the input's BTC value alone hides.
 * These helpers resolve the assets on each input's UTXO so the approval UI can
 * surface them (and distinguish a failed lookup from a confirmed-empty one).
 */

import { fetchUtxoBalances } from '@/utils/blockchain/counterparty/api';

/**
 * Counterparty assets attached to a single input's UTXO.
 */
export interface InputAttachedAssets {
  inputIndex: number;
  /** UTXO identifier (txid:vout). */
  utxo: string;
  /**
   * True when the balance lookup itself failed, so the asset status is unknown
   * rather than a confirmed empty. Surfaced separately in the UI so a network
   * or rate-limit failure is not shown as "no assets."
   */
  lookupFailed?: boolean;
  assets: Array<{
    asset: string;
    quantity_normalized: string;
    asset_longname?: string | null;
  }>;
}

/** Cap on per-input asset lookups; truncation past this is logged, not silent. */
export const MAX_ASSET_LOOKUP_INPUTS = 30;

/**
 * Look up the Counterparty assets attached to each input's UTXO. Returns an
 * entry for every input that carries assets or whose lookup failed; inputs
 * confirmed empty are omitted. A failed lookup is reported (lookupFailed) rather
 * than silently treated as empty, and never blocks signing.
 */
export async function fetchInputsAttachedAssets(
  inputs: Array<{ index: number; txid: string; vout: number }>
): Promise<InputAttachedAssets[]> {
  const checked = inputs.slice(0, MAX_ASSET_LOOKUP_INPUTS);
  if (inputs.length > MAX_ASSET_LOOKUP_INPUTS) {
    console.warn(
      `Transaction has ${inputs.length} inputs; only the first ${MAX_ASSET_LOOKUP_INPUTS} were checked for attached Counterparty assets.`
    );
  }

  const results = await Promise.all(
    checked.map(async (input): Promise<InputAttachedAssets | null> => {
      const utxo = `${input.txid}:${input.vout}`;
      try {
        const res = await fetchUtxoBalances(utxo);
        const assets = (res.result ?? [])
          .filter((b) => b.asset && b.quantity_normalized)
          .map((b) => ({
            asset: b.asset,
            quantity_normalized: b.quantity_normalized,
            asset_longname: b.asset_info?.asset_longname ?? null,
          }));
        return assets.length > 0 ? { inputIndex: input.index, utxo, assets } : null;
      } catch (err) {
        console.warn(`Failed to fetch attached assets for ${utxo}:`, err);
        return { inputIndex: input.index, utxo, assets: [], lookupFailed: true };
      }
    })
  );

  return results.filter((r): r is InputAttachedAssets => r !== null);
}

export interface SignedInputAssetSummary {
  /** Signed inputs whose UTXOs carry assets — signing moves them. */
  withAssets: InputAttachedAssets[];
  /** Signed inputs whose lookup failed — asset status unknown, not confirmed clean. */
  unknownStatus: InputAttachedAssets[];
}

/**
 * From the attached-asset entries and the indices of the inputs the wallet is
 * about to sign, split out the signed inputs that carry assets from those whose
 * lookup failed. Inputs the user isn't signing, or confirmed empty, are ignored.
 */
export function classifySignedInputAssets(
  attachedAssets: InputAttachedAssets[],
  signedInputIndices: number[]
): SignedInputAssetSummary {
  const byIndex = new Map(attachedAssets.map((entry) => [entry.inputIndex, entry]));
  const signed = signedInputIndices
    .map((index) => byIndex.get(index))
    .filter((entry): entry is InputAttachedAssets => entry !== undefined);
  return {
    withAssets: signed.filter((entry) => entry.assets.length > 0),
    unknownStatus: signed.filter((entry) => !!entry.lookupFailed),
  };
}
