/**
 * Check a decoded message against the transaction that carries it.
 *
 * A third source of truth, independent of both decoders. Some message bodies name parts of their
 * own transaction — `attach` gives an output index, `utxo` (move) gives the outpoint it spends —
 * and those references are verifiable against the bytes already parsed locally, with no packer and
 * no API call. Where they disagree, the message cannot mean what it appears to: core resolves the
 * same references against the same transaction and would reject or credit elsewhere.
 *
 * This catches a class neither existing check can. The API comparison reads the same payload
 * through a second decoder and never looks at the transaction. The repack proof shows the decode
 * accounts for every payload byte, and would still pass for a payload that is internally perfect
 * but points at an output that does not exist.
 *
 * Findings block signing. A reference that does not resolve makes the transaction ineffective —
 * core rejects the message — but the Bitcoin transaction still confirms and still spends real
 * fees, and no honest composer produces one. There is nothing legitimate to acknowledge through.
 */

import type { AttachData, MoveData } from '@/core/counterparty/unpack/messages/attach';

/** The parts of the parsed transaction these checks need. */
export interface TransactionShape {
  inputs: Array<{ txid: string; vout: number }>;
  outputs: Array<{ index: number }>;
}

export interface StructureFinding {
  title: string;
  message: string;
}

/**
 * @param messageType - the locally decoded type
 * @param data - the locally decoded payload; the API's shape is not accepted here, because these
 *   checks exist to test the bytes against the transaction rather than a remote reading of them
 */
export function checkMessageStructure(
  messageType: string | undefined,
  data: unknown,
  tx: TransactionShape
): StructureFinding[] {
  if (!messageType || data == null) return [];
  const findings: StructureFinding[] = [];

  switch (messageType) {
    case 'attach': {
      const { destinationVout } = data as AttachData;
      if (destinationVout === undefined) break;

      // core attach.py builds the destination as `${tx_hash}:${destination_vout}`, so the index
      // must name an output of this transaction. Out of range, and the assets are attached to a
      // UTXO that will never exist.
      const exists = tx.outputs.some((o) => o.index === destinationVout);
      if (!exists) {
        findings.push({
          title: 'Attaches to an output that does not exist',
          message:
            `This attaches assets to output #${destinationVout}, but the transaction has ` +
            `${tx.outputs.length} output${tx.outputs.length === 1 ? '' : 's'}. The attachment ` +
            'cannot take effect as described.',
        });
      }
      break;
    }

    case 'utxo':
    case 'utxo_move': {
      const { source } = data as MoveData;
      if (!source) break;

      // The source names the outpoint whose balances move. Core moves assets from that UTXO, so
      // it has to be one this transaction actually spends — otherwise the message describes a
      // movement out of a UTXO untouched by the bytes being signed.
      const [txid, voutText] = source.split(':');
      const vout = Number(voutText);
      const spent = tx.inputs.some(
        (i) => i.txid.toLowerCase() === (txid ?? '').toLowerCase() && i.vout === vout
      );
      if (!spent) {
        findings.push({
          title: 'Moves a UTXO this transaction does not spend',
          message:
            `This moves assets from ${source}, which is not among the inputs being signed. ` +
            'The move cannot take effect as described.',
        });
      }
      break;
    }

    default:
      break;
  }

  return findings;
}
