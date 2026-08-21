/**
 * Where the assets attached to a spent UTXO end up.
 *
 * Spending a UTXO that carries Counterparty balances moves those balances, with no Counterparty
 * message anywhere in the transaction. Core does this for every transaction it parses
 * (`messages/move.py::move_assets`): if any input carries assets they are credited to the
 * destination, and the destination is the **first non-OP_RETURN output**
 * (`parser/gettxinfo.py::get_utxos_info` → `get_first_non_op_return_output`). When there is no such
 * output — a lone OP_RETURN — the assets are **detached** to the source address instead.
 *
 * This is the mechanism behind an atomic swap of an attached UTXO, and it is invisible to every
 * message-based check: no payload to decode, no compose request to compare against, nothing to
 * re-pack. Knowing that assets move is not enough — where they land is the question a swap turns
 * on, so it must be resolved here.
 *
 * It is also the Counterparty form of the risk the ordinals wallets guard against: an asset-bearing
 * UTXO spent as an ordinary coin, its contents landing wherever the first output happens to point.
 * CertiK's PSBT guidance names the same requirement — verify the asset is assigned to a specific
 * output rather than swept into change.
 */

import { normalizeAddressForComparison } from '@/core/bitcoin/address';
import type { InputAttachedAssets } from '@/core/counterparty/inputAssets';

export interface AttachedAssetDestination {
  /** Indices of the signed inputs whose UTXOs carry assets. */
  sourceInputs: number[];
  /**
   * Output index the assets are credited to, or null when the transaction detaches them.
   * Core's rule: the first output that is not an OP_RETURN.
   */
  destinationVout: number | null;
  /** Address of that output, where the script could be attributed. */
  destinationAddress?: string;
  /** True when there is no non-OP_RETURN output, so core detaches to the source address. */
  detaches: boolean;
  /**
   * How Counterparty resolves the movement. A flexible authorization deliberately does not fix
   * whether fulfillment uses an explicit detach or the ordinary first-output rule.
   */
  mode: 'explicit-detach' | 'implicit-output' | 'implicit-source' | 'flexible';
  /**
   * Whether every signature over an attached source input fixes the complete output set.
   * SINGLE|ANYONECANPAY never does: even when it covers the current first output, a holder can add
   * an explicit detach message and change delivery without invalidating that signature.
   */
  destinationCommitted: boolean;
  /**
   * True when the destination is an address the signer does not control.
   *
   * The legitimate case for a swap — the buyer receives the asset — and the dangerous case for an
   * unwitting spend are the same shape, so this is reported rather than judged. The screen says
   * where the assets go and lets the user recognise whether that is what they meant.
   */
  leavesWallet: boolean;
}

interface OutputLike {
  index: number;
  type: string;
  address?: string;
}

interface SignedInputLike {
  index: number;
  sighashType: number;
}

interface CounterpartyMovementMessage {
  messageType?: string;
  data?: unknown;
}

const detachDestination = (message?: CounterpartyMovementMessage): string | undefined | null => {
  if (message?.messageType !== 'detach') return null;
  if (typeof message.data !== 'object' || message.data === null) return undefined;
  const destination = (message.data as Record<string, unknown>).destination;
  return typeof destination === 'string' ? destination : undefined;
};

/**
 * @param attachedAssets - per-input lookup results; only entries with assets count as sources
 * @param signedInputIndices - the inputs this wallet is being asked to sign; assets on inputs it
 *   does not sign are somebody else's contribution to the transaction and are not the user's to lose
 * @returns null when no signed input carries assets, i.e. nothing attached is moving
 */
export function resolveAttachedAssetDestination(
  outputs: OutputLike[],
  attachedAssets: InputAttachedAssets[],
  signedInputIndices: number[],
  signerAddresses: string[],
  signedInputs: SignedInputLike[],
  counterpartyMessage?: CounterpartyMovementMessage
): AttachedAssetDestination | null {
  const signed = new Set(signedInputIndices);
  const sourceInputs = attachedAssets
    .filter((entry) => entry.assets.length > 0 && signed.has(entry.inputIndex))
    .map((entry) => entry.inputIndex)
    .sort((a, b) => a - b);

  if (sourceInputs.length === 0) return null;

  const sighashByInput = new Map(signedInputs.map(input => [input.index, input.sighashType]));
  // ALL and ALL|ANYONECANPAY both bind every output and therefore also bind the absence of an
  // overriding detach message. A missing effective sighash is unknown, never optimistically ALL.
  const destinationCommitted = sourceInputs.every(inputIndex =>
    ((sighashByInput.get(inputIndex) ?? -1) & 0x1f) === 0x01
  );

  const explicitDestination = detachDestination(counterpartyMessage);
  if (explicitDestination !== null) {
    const mine = new Set(signerAddresses.map(normalizeAddressForComparison));
    const leavesWallet = explicitDestination
      ? !mine.has(normalizeAddressForComparison(explicitDestination))
      : false;
    return {
      sourceInputs,
      destinationVout: null,
      ...(explicitDestination ? { destinationAddress: explicitDestination } : {}),
      detaches: true,
      mode: destinationCommitted ? 'explicit-detach' : 'flexible',
      destinationCommitted,
      leavesWallet: destinationCommitted ? leavesWallet : true,
    };
  }

  // Core's destination rule, verbatim: the first output that is not an OP_RETURN.
  const destination = outputs.find((output) => output.type !== 'op_return');

  if (!destination) {
    return {
      sourceInputs,
      destinationVout: null,
      detaches: true,
      mode: destinationCommitted ? 'implicit-source' : 'flexible',
      destinationCommitted,
      leavesWallet: !destinationCommitted,
    };
  }

  const mine = new Set(signerAddresses.map(normalizeAddressForComparison));
  const leavesWallet = destination.address
    ? !mine.has(normalizeAddressForComparison(destination.address))
    // A destination whose script could not be attributed cannot be shown to be the signer's, and
    // assuming it is would be the optimistic reading of an unreadable script.
    : true;

  return {
    sourceInputs,
    destinationVout: destination.index,
    ...(destination.address ? { destinationAddress: destination.address } : {}),
    detaches: false,
    mode: destinationCommitted ? 'implicit-output' : 'flexible',
    destinationCommitted,
    leavesWallet: destinationCommitted ? leavesWallet : true,
  };
}

/**
 * Whether this transaction moves Counterparty value at all.
 *
 * The gate for provider signing: a transaction either carries a Counterparty message or spends an
 * input carrying attached assets. Anything else is a plain Bitcoin transaction, which a site has no
 * Counterparty reason to ask this wallet to sign and which the user can make in the wallet directly.
 *
 * Both halves are required. A message alone is not enough to notice an attached UTXO being spent
 * alongside it, and attached assets alone miss every ordinary Counterparty send.
 */
export function movesCounterpartyValue(
  hasCounterpartyPayload: boolean,
  attachedAssets: InputAttachedAssets[],
  signedInputIndices: number[]
): boolean {
  if (hasCounterpartyPayload) return true;
  const signed = new Set(signedInputIndices);
  return attachedAssets.some(
    (entry) => entry.assets.length > 0 && signed.has(entry.inputIndex)
  );
}
