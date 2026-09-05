/**
 * The provider path's reading of inscription reveals and commits.
 *
 * A site-driven inscription reaches the wallet as two signPsbt requests. The *reveal* carries its
 * Counterparty message in the tapleaf it will publish; the *commit* carries nothing readable at
 * all — it pays BTC to a P2TR address derived from an envelope the transaction never shows. The
 * provider gate rightly refuses BTC that moves for reasons the bytes cannot prove, so each half
 * gets its own proof here.
 *
 * The reveal is recognized only under the conditions core's indexer applies
 * (`bitcoin_client.rs`): the envelope is read from input 0's witness alone, and only when the
 * transaction also carries the plaintext CNTRPRTY marker OP_RETURN. Recognizing more than core
 * does would bless a "message" the chain will never execute.
 *
 * The commit is verifiable only when the site names the envelope it committed to. Everything is
 * then recomputed, never trusted: the commit address is re-derived from the declared leaf and
 * internal key, the message is decoded from the leaf, and — the load-bearing rule — the keys must
 * be the signer's own. The internal key must be the BIP-341 unspendable point (no key-path spend
 * for anyone) and the leaf's OP_CHECKSIG key must be the signer's taproot output key, so the
 * committed coins remain spendable by this wallet alone. A site that controls either key could
 * present a perfectly genuine envelope whose commit output it can sweep; the envelope proves what
 * the BTC is *for*, the key rule proves who can *take* it.
 */

import { hexToBytes } from '@noble/hashes/utils.js';
import { Address, p2tr, taprootNumsKey } from '@scure/btc-signer';
import { unpackCounterpartyMessage } from '@/core/counterparty/unpack';
import { COUNTERPARTY_PREFIX_HEX } from '@/core/counterparty/unpack/messageTypes';
import { extractOpReturnPayload } from '@/core/counterparty/unpack/opReturn';
import {
  extractEnvelopeMessage,
  type OrdEnvelopeMessage,
} from '@/core/counterparty/unpack/ordEnvelope';

const TAPROOT_NUMS_KEY = taprootNumsKey();

/** The inscription context a site may pass alongside a commit signPsbt request. */
export interface InscriptionCommitContext {
  /** The reveal's tapleaf script, hex — the envelope the commit output commits to. */
  revealScript: string;
  /** The taproot internal key behind the commit address, hex, 32 bytes. */
  tapInternalKey: string;
}

interface RevealInputLike {
  index: number;
  tapLeafScripts?: string[];
}

interface RevealOutputLike {
  type: string;
  script?: string;
}

/**
 * Read the Counterparty message a reveal PSBT would publish, under core's own conditions.
 *
 * Null means "no message here", and the ordinary gate treats the transaction as it always has.
 * The conditions are core's, not looser: envelope on input 0 (the only witness the indexer
 * reads), exactly one leaf (a single-leaf commit is the only construction whose revealed script
 * is knowable before signing), and the plaintext CNTRPRTY marker among the outputs (without it
 * the indexer never looks at the witness at all).
 */
export function resolveRevealMessage(
  inputs: RevealInputLike[],
  outputs: RevealOutputLike[]
): OrdEnvelopeMessage | null {
  const firstInput = inputs.find((input) => input.index === 0);
  const leaves = firstInput?.tapLeafScripts;
  if (!leaves || leaves.length !== 1) return null;

  const hasMarker = outputs.some(
    (output) =>
      output.type === 'op_return' &&
      output.script !== undefined &&
      extractOpReturnPayload(output.script) === COUNTERPARTY_PREFIX_HEX
  );
  if (!hasMarker) return null;

  let leafBytes: Uint8Array;
  try {
    leafBytes = hexToBytes(leaves[0]!);
  } catch {
    return null;
  }
  const envelope = extractEnvelopeMessage(leafBytes);
  if (!envelope) return null;

  // Only a message the wallet can decode is worth passing to the gate — an undecodable one cannot
  // be described to the user, and unverifiable means unsigned on this path.
  const unpacked = unpackCounterpartyMessage(envelope.messageHex);
  if (!unpacked.success) return null;

  return envelope;
}

export interface CommitVerification {
  ok: boolean;
  /** Why the commit was refused; set exactly when ok is false. */
  error?: string;
  /** The decoded envelope, when the commit verified. */
  envelope?: OrdEnvelopeMessage;
  /** The commit address the declared envelope derives to. */
  commitAddress?: string;
  /** Satoshis the PSBT pays into the commit output. */
  commitValue?: number;
}

interface CommitOutputLike {
  index: number;
  value: number;
  address?: string;
}

/**
 * Verify a commit PSBT against the envelope the site declared for it.
 *
 * Refusals name their reason — each one is rendered on the approval screen as the block message,
 * and "the site passed a context that did not verify" is precisely the situation the user needs
 * described. Nothing here trusts the context: it is treated as a claim, and every field of it is
 * recomputed against the PSBT and the signer's own address.
 */
export function verifyInscriptionCommit(
  context: InscriptionCommitContext,
  outputs: CommitOutputLike[],
  signerAddress: string
): CommitVerification {
  let signerKey: Uint8Array;
  try {
    const decoded = Address().decode(signerAddress);
    if (decoded.type !== 'tr') {
      return { ok: false, error: 'Inscription commits can only be signed from a taproot address.' };
    }
    signerKey = decoded.pubkey;
  } catch {
    return { ok: false, error: 'The signing address could not be read.' };
  }

  let leafBytes: Uint8Array;
  let internalKey: Uint8Array;
  try {
    leafBytes = hexToBytes(context.revealScript);
    internalKey = hexToBytes(context.tapInternalKey);
  } catch {
    return { ok: false, error: 'The inscription context could not be read as hex.' };
  }

  // No key-path spend for anyone: the internal key must be the BIP-341 unspendable point. A real
  // key here — anyone's — would let its holder sweep the commit without revealing anything.
  if (
    internalKey.length !== 32 ||
    !internalKey.every((byte, index) => byte === TAPROOT_NUMS_KEY[index])
  ) {
    return {
      ok: false,
      error: 'The commit does not use the standard unspendable internal key, so someone could take its coins without revealing the inscription.',
    };
  }

  const envelope = extractEnvelopeMessage(leafBytes);
  if (!envelope) {
    return { ok: false, error: 'The declared reveal script is not a readable inscription envelope.' };
  }

  const unpacked = unpackCounterpartyMessage(envelope.messageHex);
  if (!unpacked.success) {
    return { ok: false, error: 'The inscription does not decode to a Counterparty message.' };
  }

  // The load-bearing rule: the envelope's spending key must be this signer's own taproot output
  // key. With the internal key unspendable, this makes the commit output spendable by this wallet
  // alone — a lying site can at worst make the user inscribe something they control anyway.
  if (
    envelope.checksigPubkey.length !== signerKey.length ||
    !envelope.checksigPubkey.every((byte, index) => byte === signerKey[index])
  ) {
    return {
      ok: false,
      error: 'The inscription is not spendable by your key, so its coins would belong to someone else.',
    };
  }

  let commitAddress: string | undefined;
  try {
    commitAddress = p2tr(
      internalKey,
      { script: leafBytes, leafVersion: 0xc0 },
      undefined,
      true
    ).address;
  } catch {
    commitAddress = undefined;
  }
  if (!commitAddress) {
    return { ok: false, error: 'The commit address could not be derived from the declared envelope.' };
  }

  // Every output must be accounted for: the commit itself, or change back to the signer. An
  // output to anywhere else is exactly the drain the provider gate exists to refuse.
  let commitValue = 0;
  let commitOutputs = 0;
  for (const output of outputs) {
    if (output.address === commitAddress) {
      commitOutputs += 1;
      commitValue += output.value;
      continue;
    }
    if (output.address === signerAddress) continue;
    return {
      ok: false,
      error: `The commit pays an output that is neither the inscription commit nor your change${output.address ? ` (${output.address})` : ''}.`,
    };
  }
  if (commitOutputs !== 1) {
    return {
      ok: false,
      error: commitOutputs === 0
        ? 'The transaction does not pay the commit address the declared envelope derives to.'
        : 'The transaction pays the commit address more than once.',
    };
  }

  return { ok: true, envelope, commitAddress, commitValue };
}
