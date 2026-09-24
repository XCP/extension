/**
 * Linked evidence for the one-review attach-and-list pair.
 *
 * The listing half of `[attach_for_listing, create_listing]` spends the attach's asset output
 * before the attach has been broadcast. No ledger can know that outpoint yet —
 * `/v2/utxos/<outpoint>/balances` answers `[]` — so the standalone listing proof, which requires
 * the ledger to resolve seller input 1 to exactly one attached asset, can never pass on mainnet.
 *
 * The attach in the same bundle is stronger evidence than a ledger lookup would be: its exact bytes
 * are in hand and are proved first. This module derives, from those bytes only, what the attach
 * creates — the outpoint, the asset and raw quantity its locally decoded message attaches, and the
 * script and value of the output that receives them — and then admits the listing's input 1 only
 * when it is exactly that output. Nothing here reads the website's intent claims.
 *
 * The derived evidence is used in place of the ledger lookup for listing input 1 alone, and only
 * when the ledger has nothing to say about it (empty or unreachable). A `create_listing` outside
 * this pair never reaches this module and keeps requiring the ledger.
 */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';

/** What a proved attach transaction, read from its own bytes, creates. */
export interface ProvedAttachOutput {
  /** Unsigned transaction id of the attach PSBT. For a Legacy source this is provisional until
   * signing; `signAttachAndListingForDelivery` rebinds the listing to the final id. */
  txid: string;
  vout: number;
  asset: string;
  quantityRaw: string;
  /** Address of the output that receives the attached asset, from its script. */
  owner: string;
  valueSats: number;
}

interface AttachOutputLike {
  index: number;
  type: string;
  address?: string;
  value: number;
}

interface ListingInputLike {
  txid: string;
  vout: number;
  address?: string;
  value?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Derive the created asset UTXO from the attach's own bytes.
 *
 * The asset lands on the explicit `destination_vout` when the message carries one, otherwise on
 * the first non-OP_RETURN output. The marketplace always attaches onto that first non-OP_RETURN
 * output, and this link requires both rules to agree, so no reading of the message can move the
 * asset anywhere the listing is not spending.
 */
export function deriveProvedAttachOutput(attach: {
  transactionId: string | undefined;
  outputs: AttachOutputLike[];
  localMessage: { messageType?: string; data?: unknown } | undefined;
}): { output: ProvedAttachOutput } | { problem: string } {
  const txid = attach.transactionId?.toLowerCase();
  if (!txid || !/^[0-9a-f]{64}$/.test(txid)) {
    return { problem: 'the attach transaction id could not be established locally' };
  }
  const data = attach.localMessage?.messageType === 'attach' && isRecord(attach.localMessage.data)
    ? attach.localMessage.data
    : undefined;
  if (!data) return { problem: 'the attach payload is not a locally decoded attach' };
  if (typeof data.asset !== 'string' || data.asset.length === 0) {
    return { problem: 'the locally decoded attach names no asset' };
  }
  if (typeof data.quantity !== 'bigint' || data.quantity <= 0n) {
    return { problem: 'the locally decoded attach has no positive raw quantity' };
  }
  const firstSpendable = attach.outputs.find(output => output.type !== 'op_return');
  if (!firstSpendable) return { problem: 'the attach has no output to receive the asset' };
  if (data.destinationVout !== undefined && data.destinationVout !== firstSpendable.index) {
    return { problem: 'the attach destination is not its first non-OP_RETURN output' };
  }
  if (!firstSpendable.address) {
    return { problem: 'the attach asset output script has no recognizable owner' };
  }
  return {
    output: {
      txid,
      vout: firstSpendable.index,
      asset: data.asset,
      quantityRaw: data.quantity.toString(),
      owner: firstSpendable.address,
      valueSats: firstSpendable.value,
    },
  };
}

/**
 * Admit listing input 1 only when it is exactly the proved attach output: same outpoint, same
 * owner script, same value. Any difference is a problem to block on, never a reason to fall back.
 */
export function listingSpendsProvedAttach(
  listingInput: ListingInputLike | undefined,
  proved: ProvedAttachOutput,
): string | null {
  if (!listingInput) return 'the listing has no asset input 1';
  if (listingInput.txid.toLowerCase() !== proved.txid || listingInput.vout !== proved.vout) {
    return 'listing input 1 is not the asset output the attach creates';
  }
  if (
    !listingInput.address
    || normalizeAddressForComparison(listingInput.address)
      !== normalizeAddressForComparison(proved.owner)
  ) {
    return 'listing input 1 is not controlled by the attach asset output owner';
  }
  if (listingInput.value !== proved.valueSats) {
    return 'listing input 1 value differs from the attach asset output';
  }
  return null;
}

/**
 * Replace the ledger's answer for one input with linked evidence when the ledger has nothing to
 * say about it. A ledger that does report assets on that outpoint is kept: the listing proof then
 * checks it against the claim like any other listing, so a disagreement still blocks.
 */
export function withLinkedInputAssets(
  ledger: InputAttachedAssets[],
  linked: InputAttachedAssets,
): InputAttachedAssets[] {
  const existing = ledger.find(entry => entry.inputIndex === linked.inputIndex);
  if (existing && !existing.lookupFailed && existing.assets.length > 0) return ledger;
  return [...ledger.filter(entry => entry.inputIndex !== linked.inputIndex), linked];
}
