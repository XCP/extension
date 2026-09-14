/**
 * Where ZELD meets the Counterparty composer.
 *
 * The composer in `core/counterparty/compose.ts` calls three things from here and nothing else
 * ZELD-related, so the protocol's rules stay in this module:
 *
 * - `withComposedChangeFirst` puts the wallet's change first on shapes that allow it;
 * - `guardZeldExposure` keeps a payment from carrying ZELD to its recipient, recomposing without
 *   the ZELD-bearing outputs when it must;
 * - `assertUtxoCarriesNoZeld` refuses a detach or move of an output that holds ZELD.
 */

import type { ApiResponse } from '@/core/counterparty/compose';
import { CounterpartyApiError } from '@/core/errors';
import { getActiveSettings } from '@/core/settings';
import { fetchZeldOutpointBalance, isLikelyZeldTxid } from '@/core/zeld/api';
import { assessZeldExposure } from '@/core/zeld/protection';
import { psbtWithChangeFirst, withChangeFirst } from '@/core/zeld/reorder';
import type { ZeldProtectionMetadata } from '@/core/zeld/types';

/** Refuse a UTXO-sourced compose whose source output carries ZELD; see `composeUtxoTransaction`. */
export async function assertUtxoCarriesNoZeld(sourceUtxo: string, endpoint: string): Promise<void> {
  const [txid, vout] = sourceUtxo.split(':');
  let carries = isLikelyZeldTxid(txid ?? '');
  if (!carries && (getActiveSettings().zeldHuntSeconds ?? 0) > 0 && txid && vout !== undefined) {
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
 * same recipient is recomposed without those outputs. The indexer is consulted only when the
 * user has ZELD hunting on; the six-zero txid heuristic applies regardless.
 */
export async function guardZeldExposure(
  composed: ApiResponse,
  sourceAddress: string,
  endpoint: string,
  recompose: (excludeUtxos: string[]) => Promise<ApiResponse>,
): Promise<ApiResponse> {
  const useIndexer = (getActiveSettings().zeldHuntSeconds ?? 0) > 0;
  const rawTransaction = composed.result?.rawtransaction ?? '';
  const first = await assessZeldExposure(rawTransaction, sourceAddress, { useIndexer });
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

  const recomposed = await recompose(first.exposed);
  const second = await assessZeldExposure(recomposed.result?.rawtransaction ?? '', sourceAddress, { useIndexer });
  if (second.exposed.length > 0) {
    throw new CounterpartyApiError(
      'This transaction would send your ZELD to the recipient, because it has to spend an output '
      + 'that carries ZELD and pays the recipient first. Free up BTC first: on the ZELD page, '
      + 'move your ZELD to a small output, or add BTC to this address.',
      endpoint,
    );
  }
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
export function withComposedChangeFirst(composed: ApiResponse, sourceAddress: string): ApiResponse {
  const rawtransaction = composed.result?.rawtransaction;
  if (!rawtransaction) return composed;
  const reordered = withChangeFirst(rawtransaction, sourceAddress);
  if (reordered.movedFrom === undefined) return composed;
  let psbt = composed.result.psbt;
  try {
    psbt = psbtWithChangeFirst(psbt, sourceAddress);
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
