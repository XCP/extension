/**
 * What one of the wallet's own broadcasts does to its ZELD record (`knownOutpoints.ts`).
 *
 * Apart from `recordReads.ts` because it parses the signed transaction, which pulls in
 * @scure/btc-signer; the reads listener is installed at startup and must stay light.
 */

import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { isLikelyZeldTxid } from '@/core/zeld/api';
import { scriptHexForAddress } from '@/core/zeld/huntTemplate';
import type { KnownZeldOutpoint, ZeldOutpointUpdate } from '@/core/zeld/knownOutpoints';

/** What a composed result says about ZELD, as far as the record needs it. */
export interface ComposedZeldFacts {
  zeld_send?: { spent_outpoints: string[]; remainder_base_units: string; amount_base_units: string; change_vout: number; recipient_vout: number; park?: boolean };
  zeld_protection?: { carried_forward: string[] };
}

/**
 * The record update one of the wallet's own broadcasts amounts to: the ZELD outputs it spent are
 * gone, and its first spendable output holds ZELD when that output is the source's own and the
 * transaction carried ZELD forward, sent or parked it, or earned a hunt's reward. The amount is
 * named only when it is certain (a send or park that earned nothing); otherwise the next indexer
 * read fills it in. Null when the transaction touched no ZELD.
 */
export function zeldRecordAfterBroadcast(
  signedTxHex: string,
  sourceAddress: string,
  facts: ComposedZeldFacts,
): ZeldOutpointUpdate | null {
  const parsed = parseRawTransactionLocally(signedTxHex);
  if (!parsed) return null;
  const txid = parsed.txid.toLowerCase();
  const hunted = isLikelyZeldTxid(txid);
  const send = facts.zeld_send;
  const carried = facts.zeld_protection?.carried_forward ?? [];
  const remove = [...new Set([...(send?.spent_outpoints ?? []), ...carried].map(outpoint => outpoint.toLowerCase()))];
  if (!hunted && remove.length === 0) return null;
  const first = parsed.outputs.find(output => output.type !== 'op_return');
  const own = scriptHexForAddress(sourceAddress);
  const add: KnownZeldOutpoint[] = [];
  if (first && own && first.script?.toLowerCase() === own) {
    const certain = send && !hunted
      ? (send.park ? send.amount_base_units : first.index === send.change_vout ? send.remainder_base_units : undefined)
      : undefined;
    if (certain !== '0') add.push(certain === undefined ? { outpoint: `${txid}:${first.index}` } : { outpoint: `${txid}:${first.index}`, balance: certain });
  }
  return { add, remove };
}
