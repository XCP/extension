import { hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';
import { normalizePsbtToHex } from '@/core/bitcoin/psbt';
import { bytesToHex } from '@/core/counterparty/unpack/binary';

/**
 * The composer's PSBT with one input's sequence replaced, as hex.
 *
 * Hardware signing verifies that the PSBT describes the same bytes as the reviewed raw
 * transaction, so a hunted raw transaction needs a PSBT carrying the same nonce. Parsed with the
 * options `completePsbtWithInputValues` uses on the same document, so anything that document
 * accepts round-trips here.
 */
export function psbtWithInputSequence(psbt: string, inputIndex: number, sequence: number): string {
  const tx = Transaction.fromPSBT(hexToBytes(normalizePsbtToHex(psbt)), {
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
    allowLegacyWitnessUtxo: true,
    unknown: 'strip',
    proprietary: 'strip',
  });
  if (inputIndex >= tx.inputsLength) throw new RangeError('PSBT has no such input');
  tx.updateInput(inputIndex, { sequence: sequence >>> 0 });
  return bytesToHex(tx.toPSBT());
}
