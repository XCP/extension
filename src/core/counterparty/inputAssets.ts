/**
 * Per-input Counterparty asset lookups for transaction/PSBT approval screens.
 *
 * A transaction input can spend a UTXO that carries attached Counterparty
 * assets; signing moves those assets, which the input's BTC value alone hides.
 * These helpers resolve the assets on each input's UTXO so the approval UI can
 * surface them (and distinguish a failed lookup from a confirmed-empty one).
 */

import { noTrustedPrevout, type TrustedPrevoutResolver } from '@/core/bitcoin/trustedPrevout';
import { fetchUtxoBalances } from '@/core/counterparty/api';

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
    /** Exact Counterparty base-unit quantity, preserved as decimal text when the API supplies it. */
    quantity?: string;
    quantity_normalized: string;
    asset_longname?: string | null;
  }>;
}

/** Cap on per-input asset lookups. Inputs past it are reported unknown, never assumed empty. */
export const MAX_ASSET_LOOKUP_INPUTS = 30;

/**
 * Look up the Counterparty assets attached to each input's UTXO. Returns an entry for every input
 * that carries assets, whose lookup failed, or that the cap displaced; inputs confirmed empty are
 * omitted, so absence of an entry means "checked, carries nothing". Never blocks signing.
 *
 * Signed inputs are looked up first. Their asset status is what the user is agreeing to, so the cap
 * must not let input ordering decide which of them gets checked.
 */
export async function fetchInputsAttachedAssets(
  inputs: Array<{ index: number; txid: string; vout: number }>,
  signedInputIndices?: number[],
  resolveTrustedPrevout: TrustedPrevoutResolver = noTrustedPrevout
): Promise<InputAttachedAssets[]> {
  // Stable sort, so inputs keep their order within the signed and unsigned groups.
  const signed = new Set(signedInputIndices ?? []);
  const byPriority = [...inputs].sort(
    (a, b) => Number(signed.has(b.index)) - Number(signed.has(a.index))
  );
  const checked = byPriority.slice(0, MAX_ASSET_LOOKUP_INPUTS);
  const unchecked = byPriority.slice(MAX_ASSET_LOOKUP_INPUTS);

  const results = await Promise.all(
    checked.map(async (input): Promise<InputAttachedAssets | null> => {
      const utxo = `${input.txid}:${input.vout}`;
      try {
        // A journal entry is inductively attachment-free: it came from a transaction whose
        // signed inputs were all checked clean, and whose own payload does not bind an asset to
        // this output. Do not turn Counterparty's indexing lag into an "unknown asset" blocker.
        if (await resolveTrustedPrevout(input.txid, input.vout)) return null;
        const res = await fetchUtxoBalances(utxo);
        const assets = (res.result ?? [])
          .filter((b) => b.asset && b.quantity_normalized)
          .map((b) => ({
            asset: b.asset,
            ...(b.quantity !== undefined ? { quantity: String(b.quantity) } : {}),
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

  // Never queried, so unknown rather than empty.
  const displaced = unchecked.map((input) => ({
    inputIndex: input.index,
    utxo: `${input.txid}:${input.vout}`,
    assets: [],
    lookupFailed: true,
  }));

  return [...results.filter((r): r is InputAttachedAssets => r !== null), ...displaced];
}

export interface SignedInputAssetSummary {
  /** Signed inputs whose UTXOs carry assets — signing moves them. */
  withAssets: InputAttachedAssets[];
  /** Signed inputs whose lookup failed — asset status unknown, not confirmed clean. */
  unknownStatus: InputAttachedAssets[];
}

/**
 * From the attached-asset entries and the indices of the inputs the wallet is about to sign, split
 * out the signed inputs that carry assets from those whose status is unknown. Inputs the user isn't
 * signing, or confirmed empty, are ignored.
 *
 * Absence of an entry means the input was checked and carries nothing; `fetchInputsAttachedAssets`
 * emits an entry for every input it did not check.
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
