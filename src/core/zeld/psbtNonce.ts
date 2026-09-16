import { hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';
import { normalizePsbtToHex } from '@/core/bitcoin/psbt';
import { bytesToHex } from '@/core/counterparty/unpack/binary';
import { FINAL_SEQUENCE } from '@/core/zeld/protocol';

/**
 * The composer's PSBT carrying the hunt's nonce, as hex: nLockTime replaced, every input's
 * sequence final.
 *
 * Hardware signing verifies that the PSBT describes the same bytes as the reviewed raw
 * transaction, so a hunted raw transaction needs a PSBT carrying the same nonce. The locktime is
 * global, so the document is rebuilt around it with every input field the composer supplied
 * (witness UTXOs, redeem scripts) carried across. Parsed with the options
 * `completePsbtWithInputValues` uses on the same document, so anything that document accepts
 * round-trips here.
 */
export function psbtWithNonce(psbt: string, lockTime: number): string {
  const tx = Transaction.fromPSBT(hexToBytes(normalizePsbtToHex(psbt)), {
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
    allowLegacyWitnessUtxo: true,
    unknown: 'strip',
    proprietary: 'strip',
  });
  if (tx.inputsLength === 0) throw new RangeError('PSBT has no inputs');
  const hunted = new Transaction({
    version: tx.version,
    lockTime: lockTime >>> 0,
    allowUnknownOutputs: true,
    allowUnknownInputs: true,
    allowLegacyWitnessUtxo: true,
  });
  for (let index = 0; index < tx.inputsLength; index++) {
    hunted.addInput({ ...tx.getInput(index), sequence: FINAL_SEQUENCE });
  }
  for (let index = 0; index < tx.outputsLength; index++) hunted.addOutput(tx.getOutput(index));
  return bytesToHex(hunted.toPSBT());
}
