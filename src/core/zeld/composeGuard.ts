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
 * - `assertUtxoCarriesNoZeld` refuses a move of an output that holds ZELD;
 * - `withDetachZeldKept` gives a detach an output of the wallet's own when the fee ate the change;
 * - `zeldAttachParams` and `attachLayoutHolds` keep an attach's ZELD on the change output.
 */

import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import type { ApiResponse } from '@/core/counterparty/compose';
import { CounterpartyApiError } from '@/core/errors';
import { fetchZeldOutpointBalance } from '@/core/zeld/api';
import { scriptHexForAddress } from '@/core/zeld/huntTemplate';
import { assessZeldExposure, firstSpendableOutputPays, isHuntedOutpoint } from '@/core/zeld/protection';
import { psbtWithChangeFirst, type ReorderOptions, withChangeFirst } from '@/core/zeld/reorder';
import { zeldRecipientDustSats } from '@/core/zeld/sendCompose';
import type { ZeldProtectionMetadata } from '@/core/zeld/types';

/** Whether `txid:vout` carries ZELD, by the hunt's txid shape or by the indexer's word. */
export async function utxoCarriesZeld(sourceUtxo: string): Promise<boolean> {
  const [txid, vout] = sourceUtxo.split(':');
  if (!txid || vout === undefined) return false;
  if (await isHuntedOutpoint(txid, Number(vout))) return true;
  try {
    return (await fetchZeldOutpointBalance(txid, Number(vout))) > 0n;
  } catch {
    // Indexer down: the heuristic above is the only check, as everywhere else.
    return false;
  }
}

/**
 * Refuse a move whose source output carries ZELD. A move pays the destination first, so the ZELD
 * would go with the assets, and there is no other output to steer it to.
 */
export async function assertUtxoCarriesNoZeld(sourceUtxo: string, endpoint: string): Promise<void> {
  if (await utxoCarriesZeld(sourceUtxo)) {
    throw new CounterpartyApiError(
      'This output also holds ZELD, which would follow the assets to the destination. Detach the '
      + 'assets first: the ZELD stays with your address, and attaching them again puts them on a '
      + 'clean output.',
      endpoint,
    );
  }
}

/**
 * A detach's only spendable output is the wallet's own change, so ZELD on the detached output
 * lands there. When the output's own value covers the fee Counterparty makes no change at all,
 * and ZELD on it would have nowhere to go; then the detach is composed again with a small output
 * of the wallet's own for it to land on, funded by a fee input. A clean output is left as it was.
 */
export async function withDetachZeldKept(
  composed: ApiResponse,
  sourceUtxo: string,
  sourceAddress: string,
  recompose: (params: { more_outputs: string }) => Promise<ApiResponse>,
): Promise<ApiResponse> {
  if (firstSpendableOutputPays(composed.result?.rawtransaction ?? '', sourceAddress)) return composed;
  if (!(await utxoCarriesZeld(sourceUtxo))) return composed;
  const kept = await recompose({ more_outputs: `${zeldRecipientDustSats(sourceAddress)}:${sourceAddress}` });
  if (!firstSpendableOutputPays(kept.result?.rawtransaction ?? '', sourceAddress)) {
    throw new CounterpartyApiError(
      'This output also holds ZELD, and the detach leaves no output of yours for it to land on.',
      'detach',
    );
  }
  return {
    ...kept,
    result: { ...kept.result, zeld_protection: { excluded: [], carried_forward: [sourceUtxo], api_unavailable: false } },
  };
}

/** Counterparty's value for a new attach output (`config.DEFAULT_UTXO_VALUE`). */
export const ATTACH_OUTPUT_SATS = 546;
/** Output index the wallet asks Counterparty to attach to: data, then change, then this one. */
export const ZELD_ATTACH_VOUT = 2;

/**
 * Compose parameters that keep an attach's ZELD off the attached output.
 *
 * Counterparty's default attach builds `attach output, data, change`, and the first spendable
 * output is where ZELD lands: every ZELD the inputs carry in, plus any reward from a hunt, would
 * sit on the asset's UTXO and leave with it on a later move. Naming the output instead gives the
 * same three outputs as `data, change, attach output`, with the ZELD on the change. The data
 * grows by the one character of the index.
 */
export function zeldAttachParams(sourceAddress: string): { destination_vout: string; more_outputs: string } {
  return { destination_vout: String(ZELD_ATTACH_VOUT), more_outputs: `${ATTACH_OUTPUT_SATS}:${sourceAddress}` };
}

/**
 * Whether a compose made with `zeldAttachParams` came out as intended: change is the first
 * spendable output, and the attach output at `ZELD_ATTACH_VOUT` pays the source. A compose
 * without change (an exact spend) has no third output and the caller falls back to Counterparty's
 * default layout rather than attach to an output that does not exist.
 */
export function attachLayoutHolds(composed: ApiResponse, sourceAddress: string): boolean {
  const rawtransaction = composed.result?.rawtransaction;
  const expected = scriptHexForAddress(sourceAddress);
  if (!rawtransaction || !expected) return false;
  const parsed = parseRawTransactionLocally(rawtransaction);
  const attachOutput = parsed?.outputs.find(output => output.index === ZELD_ATTACH_VOUT);
  if (!attachOutput || attachOutput.type === 'op_return' || attachOutput.script?.toLowerCase() !== expected) return false;
  const first = parsed?.outputs.find(output => output.type !== 'op_return');
  return first?.index !== ZELD_ATTACH_VOUT && firstSpendableOutputPays(rawtransaction, sourceAddress);
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
