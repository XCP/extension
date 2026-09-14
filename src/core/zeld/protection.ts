/**
 * Keep ZELD from leaving with an ordinary transaction.
 *
 * ZELD carried in by inputs lands on the first non-OP_RETURN output unless a distribution says
 * otherwise. An enhanced send, a broadcast, an order — anything whose first spendable output is
 * the wallet's own change — carries it forward safely. A BTC send, a dispense or a burn puts
 * someone else first and would hand them the ZELD. The composer asks here, after composing,
 * whether that is about to happen, and if so recomposes with the ZELD-bearing outputs excluded.
 *
 * Which outputs carry ZELD comes from the indexer when it answers and from the txid shape always:
 * a spend of an output on a six-zero txid is treated as ZELD-bearing even when the indexer is
 * down, because a hunt is the one way this wallet ever earns ZELD.
 */

import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { fetchZeldUtxos, isLikelyZeldTxid } from '@/core/zeld/api';
import { scriptHexForAddress } from '@/core/zeld/huntTemplate';

export interface ZeldExposure {
  /** Inputs, as `txid:vout`, whose ZELD would leave with this transaction. */
  exposed: string[];
  /** Inputs that carry ZELD but keep it, because the first spendable output is the source's. */
  carriedForward: string[];
  /** The indexer could not be read; only the txid heuristic was applied. */
  apiUnavailable: boolean;
}

export interface AssessZeldExposureOptions {
  /** Consult the indexer. Off means the txid heuristic alone, which never needs the network. */
  useIndexer?: boolean;
  fetchUtxos?: typeof fetchZeldUtxos;
}

/** Whether the first non-OP_RETURN output of `rawTxHex` pays `address`. */
export function firstSpendableOutputPays(rawTxHex: string, address: string): boolean {
  const parsed = parseRawTransactionLocally(rawTxHex);
  const expected = scriptHexForAddress(address);
  if (!parsed || !expected) return false;
  const first = parsed.outputs.find(output => output.type !== 'op_return');
  return first?.script?.toLowerCase() === expected;
}

export async function assessZeldExposure(
  rawTxHex: string,
  sourceAddress: string,
  options: AssessZeldExposureOptions = {},
): Promise<ZeldExposure> {
  const parsed = parseRawTransactionLocally(rawTxHex);
  if (!parsed) return { exposed: [], carriedForward: [], apiUnavailable: false };

  // When the wallet's own change comes first nothing can leave, so the indexer is not consulted:
  // the common enhanced-send shape costs no extra request. The heuristic still names any
  // six-zero outputs so the review can say the ZELD rolled forward.
  const paysSource = firstSpendableOutputPays(rawTxHex, sourceAddress);
  const indexed = new Set<string>();
  let apiUnavailable = false;
  if (options.useIndexer !== false && !paysSource) {
    try {
      for (const utxo of await (options.fetchUtxos ?? fetchZeldUtxos)(sourceAddress)) {
        indexed.add(`${utxo.txid}:${utxo.vout}`);
      }
    } catch {
      apiUnavailable = true;
    }
  }

  const bearing = parsed.inputs
    .map(input => `${input.txid.toLowerCase()}:${input.vout}`)
    .filter(outpoint => indexed.has(outpoint) || isLikelyZeldTxid(outpoint));
  if (bearing.length === 0) return { exposed: [], carriedForward: [], apiUnavailable };

  return paysSource
    ? { exposed: [], carriedForward: bearing, apiUnavailable }
    : { exposed: bearing, carriedForward: [], apiUnavailable };
}
