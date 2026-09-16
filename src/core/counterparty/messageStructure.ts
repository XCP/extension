/**
 * Check a decoded message against the transaction that carries it.
 *
 * A third source of truth, independent of both decoders. Some message bodies name parts of their
 * own transaction — `attach` gives an output index, `utxo` (move) gives the outpoint it spends —
 * and those references are verifiable against the bytes already parsed locally, with no packer and
 * no API call. A missing attach output is invalid in Core. The legacy UTXO source check below is
 * stricter wallet policy: it requires the named UTXO to be among this transaction's inputs.
 *
 * This catches a class neither existing check can. The API comparison reads the same payload
 * through a second decoder and never looks at the transaction. The repack proof shows the decode
 * accounts for every payload byte, and would still pass for a payload that is internally perfect
 * but points at an output that does not exist.
 *
 * Findings keep signing blocked. An invalid Counterparty attachment does not invalidate its Bitcoin
 * transaction: if signed and confirmed, it still pays fees. Do not claim every legacy UTXO source
 * mismatch is invalid in Core; utxo.py checks source-address ownership, not input membership.
 */

import type { AttachData, MoveData } from '@/core/counterparty/unpack/messages/attach';

/** The parts of the parsed transaction these checks need. */
export interface TransactionShape {
  inputs: Array<{ txid: string; vout: number }>;
  outputs: Array<{ index: number }>;
}

interface StructureFindingText {
  title: string;
  message: string;
}

/** Exact local evidence; translation belongs to the approval UI, never this check. */
export type StructureFinding = StructureFindingText & (
  | { code: 'attach_missing_output'; data: { destinationVout: number; outputCount: number } }
  | { code: 'utxo_source_not_spent'; data: { source: string } }
);

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
          code: 'attach_missing_output',
          data: { destinationVout, outputCount: tx.outputs.length },
          title: 'Attaches to an output that does not exist',
          message:
            `This attaches assets to output #${destinationVout}, but the transaction has ` +
            `${tx.outputs.length} output${tx.outputs.length === 1 ? '' : 's'}. The attachment ` +
            'cannot take effect as described. If signed and confirmed, the Bitcoin fee would still be paid.',
        });
      }
      break;
    }

    case 'utxo':
    case 'utxo_move': {
      const { source } = data as MoveData;
      if (!source) break;

      // Preserve this wallet's signed-input policy. Legacy ID100 utxo.py verifies source-address
      // ownership rather than requiring this input; implicit move.py uses the actual spent UTXOs.
      // The observed mismatch is exact, but it is not a universal Core-invalidity claim.
      const [txid, voutText] = source.split(':');
      const vout = Number(voutText);
      const spent = tx.inputs.some(
        (i) => i.txid.toLowerCase() === (txid ?? '').toLowerCase() && i.vout === vout
      );
      if (!spent) {
        findings.push({
          code: 'utxo_source_not_spent',
          data: { source },
          title: 'Source UTXO is not spent by this transaction',
          message:
            `The message names ${source} as its source, but this transaction does not spend that UTXO. ` +
            'Signing is blocked. If signed and confirmed, the Bitcoin fee would still be paid.',
        });
      }
      break;
    }

    default:
      break;
  }

  return findings;
}
