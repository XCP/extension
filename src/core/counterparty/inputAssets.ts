/**
 * Per-input Counterparty asset lookups for transaction/PSBT approval screens.
 *
 * A transaction input can spend a UTXO that carries attached Counterparty
 * assets; signing moves those assets, which the input's BTC value alone hides.
 * These helpers resolve the assets on each input's UTXO so the approval UI can
 * surface them (and distinguish a failed lookup from a confirmed-empty one).
 */

import { noTrustedPrevout, type TrustedPrevoutResolver } from '@/core/bitcoin/trustedPrevout';
import type { UtxoBalance } from '@/core/counterparty/api';
import { MAX_ASSET_LOOKUP_INPUTS } from '@/core/counterparty/inputAssetLimits';
import {
  type AttachmentEvidenceSource,
  createPendingEvidenceContext,
  liveAttachmentEvidenceSource,
  resolveEmptyLedgerOutpoint,
} from '@/core/counterparty/pendingAttachments';

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
  /**
   * Set with `lookupFailed` when the ledger's empty answer cannot be trusted yet: this unconfirmed
   * (or not yet parsed) transaction may attach Counterparty balances to the input's outpoint.
   * Retrying after it confirms resolves it.
   */
  pendingParentTxid?: string;
  /**
   * Set with `lookupFailed` when the input was never checked because the transaction has more
   * inputs than MAX_ASSET_LOOKUP_INPUTS. Unlike a failed lookup, retrying cannot clear it.
   */
  overLimit?: true;
  assets: Array<{
    asset: string;
    /** Exact Counterparty base-unit quantity, preserved as decimal text when the API supplies it. */
    quantity?: string;
    quantity_normalized: string;
    asset_longname?: string | null;
  }>;
}


/**
 * Look up the Counterparty assets attached to each input's UTXO. Returns an entry for every input
 * that carries assets, whose lookup failed, or that the cap displaced; inputs confirmed empty are
 * omitted, so absence of an entry means "checked, carries nothing". Never blocks signing.
 *
 * Signed inputs are looked up first. Their asset status is what the user is agreeing to, so the cap
 * must not let input ordering decide which of them gets checked.
 *
 * The ledger only reflects parsed blocks, so an empty answer for a signed input is accepted only
 * once the transaction that created the outpoint is shown unable to have attached anything to it,
 * or already parsed (`pendingAttachments.ts`). Otherwise the input is reported as unknown, with
 * `pendingParentTxid` naming the unconfirmed transaction when that is the reason.
 *
 * @param signedInputIndices - the inputs being signed; omitted means every input is signed
 */
export async function fetchInputsAttachedAssets(
  inputs: Array<{ index: number; txid: string; vout: number }>,
  signedInputIndices?: number[],
  resolveTrustedPrevout: TrustedPrevoutResolver = noTrustedPrevout,
  evidenceSource: AttachmentEvidenceSource = liveAttachmentEvidenceSource
): Promise<InputAttachedAssets[]> {
  // Stable sort, so inputs keep their order within the signed and unsigned groups.
  const signed = new Set(signedInputIndices ?? inputs.map(input => input.index));
  const pendingContext = createPendingEvidenceContext(evidenceSource);
  const byPriority = [...inputs].sort(
    (a, b) => Number(signed.has(b.index)) - Number(signed.has(a.index))
  );
  const checked = byPriority.slice(0, MAX_ASSET_LOOKUP_INPUTS);
  const unchecked = byPriority.slice(MAX_ASSET_LOOKUP_INPUTS);
  const holding = await ledgerMembership(evidenceSource, checked.map(input => `${input.txid}:${input.vout}`));

  const results = await Promise.all(
    checked.map(async (input): Promise<InputAttachedAssets | null> => {
      const utxo = `${input.txid}:${input.vout}`;
      try {
        // A journal entry is inductively attachment-free: it came from a transaction whose
        // signed inputs were all checked clean, and whose own payload does not bind an asset to
        // this output. Do not turn Counterparty's indexing lag into an "unknown asset" blocker.
        if (await resolveTrustedPrevout(input.txid, input.vout)) return null;
        // The batched membership answer stands in for this input's own balance read when it says
        // the ledger holds nothing there; an empty answer is then checked exactly as before.
        const assets = holding && !holding.has(utxo)
          ? []
          : toAttachedAssets(await evidenceSource.balances(utxo, false));
        if (assets.length > 0) return { inputIndex: input.index, utxo, assets };
        // Someone else's inputs are theirs to lose; only a signed input's emptiness is load-bearing.
        if (!signed.has(input.index)) return null;
        const evidence = await resolveEmptyLedgerOutpoint(pendingContext, input.txid, input.vout);
        switch (evidence.kind) {
          case 'clean':
            return null;
          case 'assets':
            return { inputIndex: input.index, utxo, assets: toAttachedAssets(evidence.balances) };
          case 'pending':
            return { inputIndex: input.index, utxo, assets: [], lookupFailed: true, pendingParentTxid: evidence.parentTxid };
          case 'unknown':
            return { inputIndex: input.index, utxo, assets: [], lookupFailed: true };
        }
      } catch (err) {
        console.warn(`Failed to fetch attached assets for ${utxo}:`, err);
        return { inputIndex: input.index, utxo, assets: [], lookupFailed: true };
      }
    })
  );

  // Never queried, so unknown rather than empty — and marked, since retrying cannot clear it.
  const displaced = unchecked.map((input): InputAttachedAssets => ({
    inputIndex: input.index,
    utxo: `${input.txid}:${input.vout}`,
    assets: [],
    lookupFailed: true,
    overLimit: true,
  }));

  return [...results.filter((r): r is InputAttachedAssets => r !== null), ...displaced];
}

/**
 * Which of these outpoints the ledger says hold any balance, asked in batches rather than one
 * request per input. Null when the source cannot answer, so each input is read on its own.
 */
async function ledgerMembership(source: AttachmentEvidenceSource, utxos: string[]): Promise<Set<string> | null> {
  if (!source.withBalances || utxos.length === 0) return null;
  try {
    const result = await source.withBalances(utxos);
    return result instanceof Set ? result : null;
  } catch {
    return null;
  }
}

function toAttachedAssets(balances: UtxoBalance[]): InputAttachedAssets['assets'] {
  return balances
    .filter((b) => b.asset && b.quantity_normalized)
    .map((b) => ({
      asset: b.asset,
      ...(b.quantity !== undefined ? { quantity: String(b.quantity) } : {}),
      quantity_normalized: b.quantity_normalized,
      asset_longname: b.asset_info?.asset_longname ?? null,
    }));
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
