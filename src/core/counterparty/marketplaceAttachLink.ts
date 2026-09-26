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
 * The derived evidence is used in place of the ledger lookup for listing input 1 alone, only when
 * the ledger has nothing to say about it (empty, or a failure this attach explains), and only after
 * every attach input's parent is confirmed and indexed (`proveAttachInputsSettled`): Counterparty
 * moves whatever those inputs carry onto the very output the listing sells. A `create_listing`
 * outside this pair never reaches this module and keeps requiring the ledger.
 */

import { apiClient, isApiError } from '@/core/api/client';
import { sameAddress } from '@/core/bitcoin/address';
import { clearApiCacheMatching, fetchServerInfo, fetchUtxoBalances } from '@/core/counterparty/api';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';
import type { InputLike, OutputLike } from '@/core/counterparty/marketplace/intentTypes';
import { isRecord } from '@/core/isRecord';

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

type ListingInputLike = Pick<InputLike, 'txid' | 'vout' | 'address' | 'value'>;

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
  outputs: OutputLike[];
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
  if (!sameAddress(listingInput.address, proved.owner)) {
    return 'listing input 1 is not controlled by the attach asset output owner';
  }
  if (listingInput.value !== proved.valueSats) {
    return 'listing input 1 value differs from the attach asset output';
  }
  return null;
}

/** Linked evidence for one input, and how to judge a failed ledger lookup of it. */
export interface LinkedInputEvidence {
  entry: InputAttachedAssets;
  attachTxid: string;
  attachIsUnbroadcast: () => Promise<boolean>;
}

/**
 * Replace the ledger's answer for one input with linked evidence.
 *
 * - The ledger reports assets on the outpoint: kept. The listing proof then checks it against the
 *   claim like any other listing, so a disagreement still blocks.
 * - The ledger reports it empty: replaced. An unbroadcast attach output reads exactly that way.
 * - The lookup failed: replaced only when the failure is explained by this attach — the lookup
 *   names the attach itself as the pending transaction creating the outpoint, or the network
 *   affirmatively does not know the attach txid (it is not broadcast yet). An outage stays a retry.
 */
export async function withLinkedInputAssets(
  ledger: InputAttachedAssets[],
  linked: InputAttachedAssets,
  attachTxid: string,
  attachIsUnbroadcast: () => Promise<boolean>,
): Promise<InputAttachedAssets[]> {
  const existing = ledger.find(entry => entry.inputIndex === linked.inputIndex);
  if (existing && !existing.lookupFailed && existing.assets.length > 0) return ledger;
  if (existing?.lookupFailed) {
    // A stricter lookup may name the unconfirmed transaction behind an unknown answer.
    const pendingParent = 'pendingParentTxid' in existing ? existing.pendingParentTxid : undefined;
    const explained = typeof pendingParent === 'string'
      && pendingParent.toLowerCase() === attachTxid.toLowerCase();
    if (!explained && !await attachIsUnbroadcast().catch(() => false)) return ledger;
  }
  return [...ledger.filter(entry => entry.inputIndex !== linked.inputIndex), linked];
}

// -------------------------------------------------------------------------------------------
// Chain state the linked evidence depends on
// -------------------------------------------------------------------------------------------

/** A transaction's chain status per the explorer. `missing` is an affirmative "unknown to the
 * network" (HTTP 404); null is an outage or any other unanswerable state. */
export type LinkedTxStatus = { confirmed: boolean; blockHeight?: number } | 'missing' | null;

/** The chain and ledger reads the linked proof needs; injectable so tests never touch the network. */
export interface LinkedAttachChainSource {
  txStatus(txid: string): Promise<LinkedTxStatus>;
  /** The last block the Counterparty ledger has parsed. A stale (lower) value only delays proof. */
  ledgerHeight(): Promise<number>;
  /** How many balances the ledger reports on one outpoint, bypassing any cache. Throws on failure. */
  freshBalanceCount(utxo: string): Promise<number>;
}

export const liveLinkedAttachChainSource: LinkedAttachChainSource = {
  async txStatus(txid) {
    try {
      const response = await apiClient.get<{ confirmed?: unknown; block_height?: unknown }>(
        `https://mempool.space/api/tx/${txid}/status`,
        { retries: 0 },
      );
      const data = response.data;
      if (typeof data?.confirmed !== 'boolean') return null;
      return {
        confirmed: data.confirmed,
        ...(Number.isSafeInteger(data.block_height) ? { blockHeight: Number(data.block_height) } : {}),
      };
    } catch (error) {
      return isApiError(error) && error.status === 404 ? 'missing' : null;
    }
  },
  async ledgerHeight() {
    const height = (await fetchServerInfo()).counterparty_height;
    if (!Number.isSafeInteger(height)) throw new Error('Counterparty reported no parsed height');
    return height;
  },
  async freshBalanceCount(utxo) {
    clearApiCacheMatching(`/v2/utxos/${encodeURIComponent(utxo)}/balances`);
    const balances = (await fetchUtxoBalances(utxo)).result ?? [];
    return balances.filter(balance => balance.asset && balance.quantity_normalized).length;
  },
};

export type AttachInputSettlement =
  | { status: 'settled' }
  | { status: 'retry' | 'blocked'; problem: string };

/**
 * Prove the ledger's view of every attach input is final before the listing relies on it.
 *
 * Counterparty moves every balance attached to an attach's inputs onto the same first
 * non-OP_RETURN output the attach credits — the output the listing sells. The attach proof reads
 * its inputs as asset-free from the ledger, but the ledger reflects only parsed blocks: an input
 * whose parent is unconfirmed (or confirmed above the parsed height) reads empty even when that
 * parent attaches an asset to it. The listing's SINGLE|ANYONECANPAY signature would then sell that
 * extra asset too, for the claimed asset's price. So every parent must be confirmed at or below
 * Counterparty's parsed height, and every input is then re-read uncached. Any unknown is a retry.
 */
export async function proveAttachInputsSettled(
  inputs: Array<{ index: number; txid: string; vout: number }>,
  source: LinkedAttachChainSource,
  /** What the inputs fund, for the problem text. A policy offer's funding inputs need the same
   * proof: confirmed (TRUC allows its parent no unconfirmed ancestor), indexed, and asset-free. */
  subject: 'attach' | 'offer' = 'attach',
): Promise<AttachInputSettlement> {
  const parents = [...new Set(inputs.map(input => input.txid.toLowerCase()))];
  const statuses = await Promise.all(parents.map(txid => source.txStatus(txid).catch(() => null)));
  let highest = -1;
  for (const [index, status] of statuses.entries()) {
    const txid = parents[index]!;
    if (status === null || status === 'missing') {
      return { status: 'retry', problem: `the wallet could not confirm ${subject} funding transaction ${txid}` };
    }
    if (!status.confirmed) {
      return {
        status: 'retry',
        problem: `${subject} funding transaction ${txid} is unconfirmed; retry after it confirms and Counterparty indexes it`,
      };
    }
    if (status.blockHeight === undefined) {
      return { status: 'retry', problem: `the wallet could not place ${subject} funding transaction ${txid} in a block` };
    }
    highest = Math.max(highest, status.blockHeight);
  }
  // Read after the statuses: the parsed height only grows, so the comparison stays conservative.
  let ledgerHeight: number;
  try {
    ledgerHeight = await source.ledgerHeight();
  } catch {
    return { status: 'retry', problem: 'the wallet could not read how far Counterparty has indexed' };
  }
  if (highest > ledgerHeight) {
    return { status: 'retry', problem: `an ${subject} funding transaction is not yet indexed by Counterparty` };
  }
  for (const input of inputs) {
    let count: number;
    try {
      count = await source.freshBalanceCount(`${input.txid}:${input.vout}`);
    } catch {
      return { status: 'retry', problem: `the attached-asset lookup for ${subject} input ${input.index} failed` };
    }
    if (count > 0) {
      return { status: 'blocked', problem: `${subject} input ${input.index} already carries attached assets` };
    }
  }
  return { status: 'settled' };
}
