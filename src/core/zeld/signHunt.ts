/**
 * Hunt for a ZELD txid while signing a legacy (P2PKH) transaction.
 *
 * SegWit and Taproot transactions hunt before the review, on unsigned bytes, because their txid
 * does not depend on the signature. A legacy txid does, so a legacy wallet hunts after the user
 * approves, at the moment it would sign anyway. Single-input spends vary locktime using fixed
 * signing constants (`legacyHunt.ts`). Multi-input spends can hash combinations of valid
 * signatures over a fixed transaction (`legacySignaturePool.ts`). A find is the fully signed
 * transaction; nothing found means the
 * caller signs the ordinary way. Either way the transaction the user reviewed is what goes out,
 * differing at most in the nonce fields, and that is proved from the parsed bytes before the
 * result is returned.
 *
 * The private key is needed here. Every input must pay the key's own P2PKH script, which is
 * checked against the script derived from the key rather than taken from the API, so the hunt
 * never signs a transaction with an input it does not own and never trusts a scriptCode.
 */

import { hexToBytes } from '@noble/hashes/utils.js';
import * as secp from '@noble/secp256k1';
import * as btc from '@scure/btc-signer';
import { parseConsensusTransaction } from '@/core/bitcoin/rawTransaction';
import { bytesToHex } from '@/core/counterparty/unpack/binary';
import { huntTxid } from '@/core/zeld/hunt';
import { assertOnlyNonceChanged, locateInputSequences } from '@/core/zeld/huntTemplate';
import { legacySignedTransaction, prepareLegacyHunt, unsignedFormOf, verifyLegacySignatures } from '@/core/zeld/legacyHunt';
import { createLegacySignaturePoolJob } from '@/core/zeld/legacySignaturePool';
import { firstSpendableOutputPays } from '@/core/zeld/protection';
import { countLeadingZeroNibbles, MAX_ZELD_HUNT_SECONDS, ZELD_MIN_ZERO_COUNT } from '@/core/zeld/protocol';
import type { ZeldHuntProgress } from '@/core/zeld/types';

export interface SignHuntContext {
  rawTxHex: string;
  sourceAddress: string;
  /** Previous scriptPubKeys of the inputs, as the composer reports them; checked against the key. */
  lockScripts: string[];
  privateKeyHex: string;
  compressed: boolean;
  /** The configured budget; clamped to the protocol cap. Zero or less means no hunt. */
  seconds: number;
  targetZeros?: number;
  stopZeros?: number;
  signal?: AbortSignal;
  acceptEarly?: AbortSignal;
  onProgress?: (progress: ZeldHuntProgress) => void;
  /** Background signer guard, checked during the hunt and before releasing any signature. */
  assertStillAuthorized?: () => void;
  /** Test seam for the hunt itself. */
  hunt?: typeof huntTxid;
}

export interface SignHuntResult {
  signedTxHex: string;
  txid: string;
  zeroCount: number;
  nonce: number;
  attempts: number;
  elapsedMs: number;
}

/**
 * The signed transaction with a rare txid, or null when the transaction cannot hunt, nothing was
 * found in the budget. Cancellation throws: it must never fall through to ordinary signing.
 */
export async function huntZeldWhileSigning(context: SignHuntContext): Promise<SignHuntResult | null> {
  context.signal?.throwIfAborted();
  context.assertStillAuthorized?.();
  const seconds = Math.min(MAX_ZELD_HUNT_SECONDS, Math.floor(context.seconds));
  if (!(seconds > 0)) return null;
  const targetZeros = context.targetZeros ?? ZELD_MIN_ZERO_COUNT;
  // Finish an approved legacy payment as soon as a qualifying txid is found.
  const stopZeros = context.stopZeros ?? targetZeros;

  const unsigned = parseConsensusTransaction(context.rawTxHex).toBytes(true, false);
  const layout = locateInputSequences(unsigned);
  if (layout.hasScriptSig || layout.sequenceOffsets.length === 0) return null;
  if (layout.sequenceOffsets.length !== context.lockScripts.length) return null;
  if (!firstSpendableOutputPays(context.rawTxHex, context.sourceAddress)) return null;

  const privateKey = hexToBytes(context.privateKeyHex);
  try {
    // Every input must be the key's own P2PKH output; a scriptCode that is not is not signed.
    const ownScript = bytesToHex(btc.p2pkh(secp.getPublicKey(privateKey, context.compressed)).script);
    if (context.lockScripts.some(script => script.toLowerCase() !== ownScript)) return null;
    const scriptCodes = context.lockScripts.map(hexToBytes);
    const template = prepareLegacyHunt(unsigned, scriptCodes, privateKey, context.compressed);
    // Optimize inline runtimes (Chrome MV3); retain the existing parallel pool where supported.
    // Amortize signature preparation only when the user allows a useful hunting window.
    const job = typeof Worker === 'undefined' && template.inputs.length >= 2 && seconds >= 5
      ? createLegacySignaturePoolJob(template, privateKey) : template;

    const hunt = context.hunt ?? huntTxid;
    const cancelled = new AbortController();
    const signal = context.signal ? AbortSignal.any([context.signal, cancelled.signal]) : cancelled.signal;
    const outcome = await hunt(job, {
      seconds,
      targetZeros,
      stopZeros,
      signal,
      acceptEarly: context.acceptEarly,
      onProgress: (progress) => {
        try {
          context.assertStillAuthorized?.();
        } catch {
          cancelled.abort();
          return;
        }
        context.onProgress?.(progress);
      },
    });
    context.signal?.throwIfAborted();
    context.assertStillAuthorized?.();
    if (outcome.status === 'aborted') throw new DOMException('The hunt was cancelled.', 'AbortError');
    if (outcome.status !== 'found') return null;

    if (!Number.isInteger(outcome.nonce) || outcome.nonce < 0 || outcome.nonce > 0xffff_ffff) {
      throw new Error('The hunted locktime is outside the nonce range.');
    }

    const signed = job.kind === 'legacy-signature-pool'
      ? outcome.signedTx : legacySignedTransaction(template, outcome.nonce);
    if (!signed) throw new Error('The hunted locktime cannot be signed.');
    verifyLegacySignatures(template, signed, outcome.nonce);
    const parsed = parseConsensusTransaction(bytesToHex(signed));
    if (parsed.id !== outcome.txid) throw new Error('The hunted transaction does not hash to the txid found.');
    if (countLeadingZeroNibbles(parsed.id) !== outcome.zeroCount || outcome.zeroCount < targetZeros) {
      throw new Error('The hunted transaction does not meet the requested rarity.');
    }
    // What was reviewed, plus the nonce fields, is what was signed: nothing else moved.
    assertOnlyNonceChanged(context.rawTxHex, bytesToHex(unsignedFormOf(signed)));

    return {
      signedTxHex: bytesToHex(signed),
      txid: outcome.txid,
      zeroCount: outcome.zeroCount,
      nonce: outcome.nonce,
      attempts: outcome.attempts,
      elapsedMs: outcome.elapsedMs,
    };
  } finally {
    privateKey.fill(0);
  }
}
