/**
 * Attach a ZELD hunt to a composed, verified transaction.
 *
 * Runs after every compose-time check has passed, changes only the nonce fields (nLockTime, and
 * every input's sequence made final), proves that from the parsed bytes, and records what
 * happened on the result as `zeld_hunt` for the review screen. A hunt that finds nothing leaves the transaction untouched, so the user's
 * transaction always proceeds; the setting buys a chance at ZELD, never a delay past its budget.
 */

import type { AddressFormat } from '@/core/bitcoin/address';
import type { ApiResponse } from '@/core/counterparty/compose';
import { huntTxid } from '@/core/zeld/hunt';
import { assertOnlyNonceChanged, assessZeldHunt, rawTransactionWithNonce } from '@/core/zeld/huntTemplate';
import { MAX_ZELD_HUNT_SECONDS, ZELD_MIN_ZERO_COUNT } from '@/core/zeld/protocol';
import { psbtWithNonce } from '@/core/zeld/psbtNonce';
import type { ZeldHuntMetadata, ZeldHuntProgress } from '@/core/zeld/types';

export interface ComposeHuntContext {
  sourceAddress: string;
  addressFormat: AddressFormat;
  walletType: 'mnemonic' | 'privateKey' | 'hardware';
  /** The configured budget; clamped to the protocol cap. Zero or less means no hunt. */
  seconds: number;
  targetZeros?: number;
  signal?: AbortSignal;
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
  const base = { target_zeros: targetZeros, seconds };

  const rawTxHex = response.result.rawtransaction;
  const assessment = assessZeldHunt({
    rawTxHex,
    sourceAddress: context.sourceAddress,
    addressFormat: context.addressFormat,
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
  const outcome = await hunt(assessment.template, {
    seconds,
    targetZeros,
    signal: context.signal,
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
