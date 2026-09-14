/**
 * Where ZELD meets the Counterparty composer.
 *
 * The composer in `core/counterparty/compose.ts` calls three things from here and nothing else
 * ZELD-related, so the protocol's rules stay in this module:
 *
 * - `withComposedChangeFirst` puts the wallet's change first on shapes that allow it;
 * - `guardZeldExposure` keeps a payment from carrying ZELD to its recipient, recomposing without
 *   the ZELD-bearing outputs when it must. It does not depend on the hunt setting: ZELD earned
 *   while hunting was on stays protected after it is turned off;
 * - `assertUtxoCarriesNoZeld` refuses a detach or move of an output that holds ZELD.
 */

import type { ApiResponse } from '@/core/counterparty/compose';
import { CounterpartyApiError } from '@/core/errors';
import { fetchZeldOutpointBalance, isLikelyZeldTxid } from '@/core/zeld/api';
import { assessZeldExposure } from '@/core/zeld/protection';
import { psbtWithChangeFirst, type ReorderOptions, withChangeFirst } from '@/core/zeld/reorder';
import type { ZeldProtectionMetadata } from '@/core/zeld/types';

/** Refuse a UTXO-sourced compose whose source output carries ZELD; see `composeUtxoTransaction`. */
export async function assertUtxoCarriesNoZeld(sourceUtxo: string, endpoint: string): Promise<void> {
  const [txid, vout] = sourceUtxo.split(':');
  let carries = isLikelyZeldTxid(txid ?? '');
  if (!carries && txid && vout !== undefined) {
    try {
      carries = (await fetchZeldOutpointBalance(txid, Number(vout))) > 0n;
    } catch {
      // Indexer down: the heuristic above is the only check, as everywhere else.
    }
  }
  if (carries) {
    throw new CounterpartyApiError(
      'This output also holds ZELD, which would follow the assets to the destination. Send the '
      + 'ZELD from the ZELD page first.',
      endpoint,
    );
  }
}

/**
 * Recompose when the composed transaction would carry ZELD to someone else.
 *
 * ZELD rides on the first spendable output, so a transaction that pays a stranger first must not
 * spend a ZELD-bearing output. The guard runs after every compose because the shape is only
 * known then: an enhanced send keeps ZELD on its change and is left alone, a BTC send to the
 * same recipient is recomposed without those outputs. The indexer is consulted whenever the
 * shape could leak, whatever the hunt setting; the six-zero txid heuristic applies as well.
 */
export async function guardZeldExposure(
  composed: ApiResponse,
  sourceAddress: string,
  endpoint: string,
  recompose: (excludeUtxos: string[]) => Promise<ApiResponse>,
): Promise<ApiResponse> {
  const rawTransaction = composed.result?.rawtransaction ?? '';
  const first = await assessZeldExposure(rawTransaction, sourceAddress);
  // Annotated only when a ZELD-bearing input was involved. An indexer outage on its own is not
  // worth a line on every review; it matters when the heuristic found something the indexer
  // could not confirm or deny, and then it is reported alongside.
  const annotate = (response: ApiResponse, protection: ZeldProtectionMetadata): ApiResponse => {
    const changeFirst = response.result?.zeld_protection?.change_first;
    if (protection.excluded.length === 0 && protection.carried_forward.length === 0 && !changeFirst) return response;
    return {
      ...response,
      result: { ...response.result, zeld_protection: { ...protection, ...(changeFirst ? { change_first: true } : {}) } },
    };
  };
  if (first.exposed.length === 0) {
    return annotate(composed, {
      excluded: [],
      carried_forward: first.carriedForward,
      api_unavailable: first.apiUnavailable,
    });
  }

  // Nothing clean to fund from, or still exposed after recomposing: say what to do about it
  // rather than surfacing the composer's insufficient-funds error.
  const stuck = (cause?: unknown) => new CounterpartyApiError(
    'This transaction has to pay the recipient first, and every output it could spend from here '
    + 'carries ZELD, which would go with it. On the ZELD page, move your ZELD to a small output, '
    + 'then try again.',
    endpoint,
    cause instanceof Error ? { cause } : {},
  );
  let recomposed: ApiResponse;
  try {
    recomposed = await recompose(first.exposed);
  } catch (cause) {
    throw stuck(cause);
  }
  const second = await assessZeldExposure(recomposed.result?.rawtransaction ?? '', sourceAddress);
  if (second.exposed.length > 0) throw stuck();
  return annotate(recomposed, {
    excluded: first.exposed,
    carried_forward: second.carriedForward,
    api_unavailable: first.apiUnavailable || second.apiUnavailable,
  });
}


/**
 * Apply `withChangeFirst` to a compose result: raw transaction and PSBT together, so the hardware
 * path's check that the PSBT describes the reviewed bytes still holds. Value fields are unaffected:
 * nothing moves value, only position.
 */
export function withComposedChangeFirst(
  composed: ApiResponse,
  sourceAddress: string,
  options: ReorderOptions = {},
): ApiResponse {
  const rawtransaction = composed.result?.rawtransaction;
  if (!rawtransaction) return composed;
  const reordered = withChangeFirst(rawtransaction, sourceAddress, options);
  if (reordered.movedFrom === undefined) return composed;
  let psbt = composed.result.psbt;
  try {
    psbt = psbtWithChangeFirst(psbt, sourceAddress, options);
  } catch {
    // A PSBT the wallet cannot read is left as it was; software signing never reads it, and the
    // hardware path refuses a PSBT that does not match the reviewed bytes rather than guessing.
  }
  return {
    ...composed,
    result: {
      ...composed.result,
      rawtransaction: reordered.rawtransaction,
      psbt,
      zeld_protection: {
        excluded: [], carried_forward: [], api_unavailable: false, ...composed.result.zeld_protection, change_first: true,
      },
    },
  };
}
