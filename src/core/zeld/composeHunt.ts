/**
 * Attach a ZELD hunt to a composed, verified transaction.
 *
 * Runs after every compose-time check has passed, changes only the nonce fields (nLockTime, and
 * every input's sequence made final), proves that from the parsed bytes, and records what
 * happened on the result as `zeld_hunt` for the review screen. A hunt that finds nothing leaves
 * the transaction untouched; the budget bounds time spent searching, not the chance of a reward.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { AddressFormat } from '@/core/bitcoin/address';
import type { ApiResponse } from '@/core/counterparty/compose';
import { HUNTS_WHILE_SIGNING, huntsWhileSigning } from '@/core/zeld/eligibility';
import { huntTxid } from '@/core/zeld/hunt';
import { assertOnlyNonceChanged, assessZeldHunt, messageWithNonce, rawTransactionWithNonce } from '@/core/zeld/huntTemplate';
import { countLeadingZeroNibbles, MAX_ZELD_HUNT_SECONDS, ZELD_MIN_ZERO_COUNT, ZELD_STOP_ZERO_COUNT } from '@/core/zeld/protocol';
import { psbtWithNonce } from '@/core/zeld/psbtNonce';
import type { ZeldHuntMetadata, ZeldHuntProgress } from '@/core/zeld/types';

export interface ComposeHuntContext {
  sourceAddress: string;
  addressFormat: AddressFormat;
  /** The source's public key; a nested SegWit hunt needs it. */
  publicKeyHex?: string;
  walletType: 'mnemonic' | 'privateKey' | 'hardware';
  /** The configured budget; clamped to the protocol cap. Zero or less means no hunt. */
  seconds: number;
  /** Leading zeros worth keeping; the protocol minimum unless a test says otherwise. */
  targetZeros?: number;
  /**
   * Leading zeros that end the hunt at once. Defaults to the protocol's stop count for a real
   * hunt, and to `targetZeros` when a caller names one, so tests and regtest runs stop at their
   * first find.
   */
  stopZeros?: number;
  signal?: AbortSignal;
  /** Ends hunting early, retaining the best qualifying txid if one was found. */
  acceptEarly?: AbortSignal;
  onProgress?: (progress: ZeldHuntProgress) => void;
  /** Test seam for the hunt itself. */
  hunt?: typeof huntTxid;
}

function withMetadata(response: ApiResponse, zeld_hunt: ZeldHuntMetadata): ApiResponse {
  return { ...response, result: { ...response.result, zeld_hunt } };
}

/**
 * Hunt on behalf of a compose. Returns the response to review: hunted when a txid was found,
 * otherwise the original response with the outcome recorded, or the untouched response when the
 * hunt was aborted (the compose is being discarded anyway) or the budget is zero.
 */
export async function huntZeldForCompose(response: ApiResponse, context: ComposeHuntContext): Promise<ApiResponse> {
  const seconds = Math.min(MAX_ZELD_HUNT_SECONDS, Math.floor(context.seconds));
  if (!(seconds > 0)) return response;
  const targetZeros = context.targetZeros ?? ZELD_MIN_ZERO_COUNT;
  const stopZeros = context.stopZeros ?? (context.targetZeros === undefined ? ZELD_STOP_ZERO_COUNT : targetZeros);
  const base = { target_zeros: targetZeros, seconds };

  const rawTxHex = response.result.rawtransaction;
  if (response.result.signed_reveal_rawtransaction) {
    return withMetadata(response, { ...base, status: 'skipped', elapsed_ms: 0, attempts: 0,
      reason: 'A signed inscription reveal already spends this transaction ID.' });
  }
  if (huntsWhileSigning(context.addressFormat, context.walletType)) {
    return withMetadata(response, { ...base, status: 'skipped', elapsed_ms: 0, attempts: 0, reason: HUNTS_WHILE_SIGNING });
  }
  const assessment = assessZeldHunt({
    rawTxHex,
    sourceAddress: context.sourceAddress,
    addressFormat: context.addressFormat,
    publicKeyHex: context.publicKeyHex,
  });
  if (!assessment.eligible) {
    return withMetadata(response, { ...base, status: 'skipped', elapsed_ms: 0, attempts: 0, reason: assessment.reason });
  }

  // A hardware wallet signs from the PSBT, so it must be able to carry the nonce. Prove that
  // before spending the budget rather than after.
  const psbt = response.result.psbt;
  if (context.walletType === 'hardware') {
    try {
      psbtWithNonce(psbt, assessment.template.originalLockTime);
    } catch {
      return withMetadata(response, {
        ...base,
        status: 'skipped',
        elapsed_ms: 0,
        attempts: 0,
        reason: 'The PSBT for hardware signing could not carry a nonce.',
      });
    }
  }

  const hunt = context.hunt ?? huntTxid;
  const { message, nonceOffset } = assessment.template;
  const outcome = await hunt({ kind: 'locktime', message, nonceOffset }, {
    seconds,
    targetZeros,
    stopZeros,
    signal: context.signal,
    acceptEarly: context.acceptEarly,
    onProgress: context.onProgress,
  });

  if (outcome.status === 'aborted') return response;
  if (outcome.status === 'not_found') {
    return withMetadata(response, {
      ...base,
      status: 'not_found',
      elapsed_ms: outcome.elapsedMs,
      attempts: outcome.attempts,
    });
  }

  // Independently verify the worker's custom SHA-256 result, including nested SegWit scriptSigs.
  const txid = bytesToHex(sha256(sha256(messageWithNonce(assessment.template, outcome.nonce))).reverse());
  const zeroCount = countLeadingZeroNibbles(txid);
  if (!Number.isInteger(outcome.nonce) || outcome.nonce < 0 || outcome.nonce > 0xffff_ffff
    || txid !== outcome.txid || zeroCount !== outcome.zeroCount || zeroCount < targetZeros) {
    throw new Error('The hunted transaction does not match the claimed rare txid.');
  }
  const rawtransaction = rawTransactionWithNonce(rawTxHex, outcome.nonce);
  assertOnlyNonceChanged(rawTxHex, rawtransaction);

  let huntedPsbt = psbt;
  try {
    huntedPsbt = psbtWithNonce(psbt, outcome.nonce);
  } catch (error) {
    // Software signing never reads the PSBT; hardware signing proved it updatable above.
    if (context.walletType === 'hardware') throw error;
  }

  return {
    ...response,
    result: {
      ...response.result,
      rawtransaction,
      psbt: huntedPsbt,
      zeld_hunt: {
        ...base,
        status: 'found',
        elapsed_ms: outcome.elapsedMs,
        attempts: outcome.attempts,
        nonce: outcome.nonce,
        txid: outcome.txid,
        zero_count: outcome.zeroCount,
      },
    },
  };
}
