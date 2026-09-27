/**
 * Keep ZELD from leaving with an ordinary transaction.
 *
 * ZELD carried in by inputs lands on the first non-OP_RETURN output unless a distribution says
 * otherwise. An enhanced send, a broadcast, an order — anything whose first spendable output is
 * the wallet's own change — carries it forward safely. A BTCPay, a burn or an ownership transfer
 * puts someone else first and would hand them the ZELD. The composer asks here, after composing,
 * whether that is about to happen, and if so recomposes with the ZELD-bearing outputs excluded.
 *
 * Which outputs carry ZELD comes from the indexer when it answers and from the txid shape always:
 * an output on a six-zero txid is treated as ZELD-bearing when it is that transaction's first
 * spendable output, which is the only one a reward can land on. The parent is read to tell the
 * two apart, because a hunted transaction's other outputs (the clean change left by a park, the
 * recipient of a BTC send) carry nothing; when the parent cannot be read, the output is treated
 * as ZELD-bearing rather than guessed clean.
 */

import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { fetchPreviousRawTransaction } from '@/core/bitcoin/utxo';
import { fetchZeldUtxos, isLikelyZeldTxid } from '@/core/zeld/api';
import { scriptHexForAddress } from '@/core/zeld/huntTemplate';
import type { KnownZeldOutpoint } from '@/core/zeld/knownOutpoints';

export interface ZeldExposure {
  /** Inputs, as `txid:vout`, whose ZELD would leave with this transaction. */
  exposed: string[];
  /** Inputs that carry ZELD but keep it, because the first spendable output is the source's. */
  carriedForward: string[];
  /** The indexer could not be read; only the txid heuristic was applied. */
  apiUnavailable: boolean;
}

export interface AssessZeldExposureOptions {
  /** Consult the indexer. Off means the txid heuristic alone, which never needs the indexer. */
  useIndexer?: boolean;
  fetchUtxos?: typeof fetchZeldUtxos;
  /** Parent transaction bytes for the six-zero heuristic; defaults to the wallet's own fetch. */
  fetchParent?: (txid: string) => Promise<string | null>;
  /** Test seam: which txids count as hunted. Defaults to six leading zeros. */
  isZeldTxid?: (txid: string) => boolean;
  /** The wallet's own record of its ZELD outputs, consulted only when the indexer cannot be read. */
  knownOutpoints?: (address: string) => KnownZeldOutpoint[] | Promise<KnownZeldOutpoint[]>;
}

/** Whether the first non-OP_RETURN output of `rawTxHex` pays `address`. */
export function firstSpendableOutputPays(rawTxHex: string, address: string): boolean {
  const parsed = parseRawTransactionLocally(rawTxHex);
  const expected = scriptHexForAddress(address);
  if (!parsed || !expected) return false;
  const first = parsed.outputs.find(output => output.type !== 'op_return');
  return first?.script?.toLowerCase() === expected;
}

/**
 * Whether `vout` is where a reward to `txid` would have landed: its first non-OP_RETURN output.
 * An unreadable parent counts as yes, so a lookup failure can only over-protect.
 */
async function isRewardOutput(
  txid: string,
  vout: number,
  fetchParent: (txid: string) => Promise<string | null>,
): Promise<boolean> {
  let raw: string | null;
  try {
    raw = await fetchParent(txid);
  } catch {
    raw = null;
  }
  if (!raw) return true;
  const parent = parseRawTransactionLocally(raw);
  if (!parent || parent.txid.toLowerCase() !== txid.toLowerCase()) return true;
  const first = parent.outputs.find(output => output.type !== 'op_return');
  return first?.index === vout;
}

/**
 * Whether `txid:vout` holds a hunt's reward by shape alone: a six-zero txid whose first spendable
 * output this is. The other outputs of a hunted transaction are clean.
 */
export async function isHuntedOutpoint(
  txid: string,
  vout: number,
  options: Pick<AssessZeldExposureOptions, 'fetchParent' | 'isZeldTxid'> = {},
): Promise<boolean> {
  const lower = txid.toLowerCase();
  if (!(options.isZeldTxid ?? isLikelyZeldTxid)(lower)) return false;
  return isRewardOutput(lower, vout, options.fetchParent ?? fetchPreviousRawTransaction);
}

export interface ZeldOutpointClassification {
  /** Outpoints, as `txid:vout`, that carry ZELD by the indexer's word, the wallet's record, or the txid heuristic. */
  bearing: string[];
  apiUnavailable: boolean;
  /** ZELD base units per bearing outpoint, where the indexer or the record names an amount. */
  amounts?: Record<string, string>;
  /**
   * Outpoints that could not be classified: the indexer was down, the wallet's record shows this
   * address has held ZELD, and neither the record nor the heuristic names them. Never set for an
   * address the wallet has no record of holding ZELD.
   */
  unchecked?: string[];
}

/**
 * Which of `inputs` carry ZELD: those the indexer lists for `address` (or, while it cannot be
 * read, those the wallet's own record lists, see `knownOutpoints.ts`), plus those on a six-zero
 * txid whose parent shows them to be its first spendable output.
 */
export async function classifyZeldOutpoints(
  inputs: ReadonlyArray<{ txid: string; vout: number }>,
  address: string,
  options: AssessZeldExposureOptions = {},
): Promise<ZeldOutpointClassification> {
  const indexed = new Map<string, bigint | undefined>();
  let apiUnavailable = false;
  let knownHolder = false;
  if (options.useIndexer !== false) {
    try {
      for (const utxo of await (options.fetchUtxos ?? fetchZeldUtxos)(address)) {
        indexed.set(`${utxo.txid}:${utxo.vout}`, utxo.balance);
      }
    } catch {
      apiUnavailable = true;
      let known: KnownZeldOutpoint[] = [];
      try {
        known = await options.knownOutpoints?.(address) ?? [];
      } catch {
        known = [];
      }
      knownHolder = known.length > 0;
      for (const item of known) {
        indexed.set(item.outpoint.toLowerCase(), item.balance === undefined ? undefined : BigInt(item.balance));
      }
    }
  }
  const fetchParent = options.fetchParent ?? fetchPreviousRawTransaction;
  const isHunted = options.isZeldTxid ?? isLikelyZeldTxid;
  const bearing: string[] = [];
  const amounts: Record<string, string> = {};
  const unchecked: string[] = [];
  for (const input of inputs) {
    const txid = input.txid.toLowerCase();
    const outpoint = `${txid}:${input.vout}`;
    if (indexed.has(outpoint)) {
      bearing.push(outpoint);
      const amount = indexed.get(outpoint);
      if (amount !== undefined) amounts[outpoint] = amount.toString();
    } else if (isHunted(txid) && await isRewardOutput(txid, input.vout, fetchParent)) {
      bearing.push(outpoint);
    } else if (knownHolder) {
      unchecked.push(outpoint);
    }
  }
  return {
    bearing,
    apiUnavailable,
    ...(Object.keys(amounts).length > 0 ? { amounts } : {}),
    ...(unchecked.length > 0 ? { unchecked } : {}),
  };
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
  const { bearing, apiUnavailable } = await classifyZeldOutpoints(parsed.inputs, sourceAddress, {
    ...options,
    useIndexer: options.useIndexer !== false && !paysSource,
  });
  if (bearing.length === 0) return { exposed: [], carriedForward: [], apiUnavailable };

  return paysSource
    ? { exposed: [], carriedForward: bearing, apiUnavailable }
    : { exposed: bearing, carriedForward: [], apiUnavailable };
}
