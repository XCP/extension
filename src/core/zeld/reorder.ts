/**
 * Put the wallet's own change first, so ZELD carried in by the inputs, and any new reward, lands
 * on it rather than on the recipient.
 *
 * Only for shapes Counterparty reads without regard to which address output comes first:
 *
 * - a plain BTC send carries no Counterparty message at all;
 * - a dispense credits every output that pays a dispenser, wherever it sits (`dispense.parse`
 *   walks all vouts once `multiple_dispenses` is on), so an extra own output ahead of the
 *   dispenser output changes nothing.
 *
 * A BTCPay, a burn and an ownership transfer each read one positional destination and are left
 * alone; the spend guard handles those. Enhanced sends and other OP_RETURN-first messages already
 * have change first among their spendable outputs.
 *
 * Moving an output moves no value and adds no bytes, so the fee and the verification of every
 * output are unchanged; the composer's own checks still run on the reordered bytes afterwards.
 */

import { hexToBytes } from '@noble/hashes/utils.js';
import { Transaction } from '@scure/btc-signer';
import { normalizePsbtToHex } from '@/core/bitcoin/psbt';
import { parseConsensusTransaction } from '@/core/bitcoin/rawTransaction';
import { bytesToHex } from '@/core/counterparty/unpack/binary';
import { scriptHexForAddress } from '@/core/zeld/huntTemplate';

export interface ReorderResult {
  rawtransaction: string;
  /** Index the change output was moved from; undefined when nothing moved. */
  movedFrom?: number;
}

/**
 * The transaction with its first change output (paying `sourceAddress`) moved to output 0.
 * Returns the input unchanged when there is no change, when change is already first, or when the
 * bytes cannot be parsed.
 */
export function withChangeFirst(rawTxHex: string, sourceAddress: string): ReorderResult {
  const sourceScript = scriptHexForAddress(sourceAddress);
  if (!sourceScript) return { rawtransaction: rawTxHex };
  let tx: Transaction;
  try {
    tx = parseConsensusTransaction(rawTxHex);
  } catch {
    return { rawtransaction: rawTxHex };
  }

  let changeIndex = -1;
  for (let index = 0; index < tx.outputsLength; index++) {
    const output = tx.getOutput(index);
    if (output.script && bytesToHex(output.script).toLowerCase() === sourceScript) {
      changeIndex = index;
      break;
    }
  }
  if (changeIndex <= 0) return { rawtransaction: rawTxHex };

  const reordered = new Transaction({
    version: tx.version,
    lockTime: tx.lockTime,
    allowUnknownOutputs: true,
    allowUnknownInputs: true,
  });
  for (let index = 0; index < tx.inputsLength; index++) {
    const input = tx.getInput(index);
    if (!input.txid || input.index === undefined) return { rawtransaction: rawTxHex };
    reordered.addInput({
      txid: input.txid,
      index: input.index,
      sequence: input.sequence,
      ...(input.finalScriptSig ? { finalScriptSig: input.finalScriptSig } : {}),
    });
  }
  const order = [changeIndex, ...Array.from({ length: tx.outputsLength }, (_, i) => i).filter(i => i !== changeIndex)];
  for (const index of order) {
    const output = tx.getOutput(index);
    if (!output.script || output.amount === undefined) return { rawtransaction: rawTxHex };
    reordered.addOutput({ script: output.script, amount: output.amount });
  }
  const rawtransaction = bytesToHex(reordered.toBytes(true, false));
  assertOnlyOutputOrderChanged(rawTxHex, rawtransaction);
  return { rawtransaction, movedFrom: changeIndex };
}

/**
 * The composer's PSBT with its outputs in the same order as `withChangeFirst` produced, so the
 * hardware path's byte-identity check between PSBT and reviewed transaction still holds. Input
 * fields the composer supplied (witness UTXOs, redeem scripts) are carried across untouched.
 */
export function psbtWithChangeFirst(psbt: string, sourceAddress: string): string {
  const sourceScript = scriptHexForAddress(sourceAddress);
  if (!sourceScript) return psbt;
  const tx = Transaction.fromPSBT(hexToBytes(normalizePsbtToHex(psbt)), {
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
    allowLegacyWitnessUtxo: true,
    unknown: 'strip',
    proprietary: 'strip',
  });
  let changeIndex = -1;
  for (let index = 0; index < tx.outputsLength; index++) {
    const output = tx.getOutput(index);
    if (output.script && bytesToHex(output.script).toLowerCase() === sourceScript) {
      changeIndex = index;
      break;
    }
  }
  if (changeIndex <= 0) return psbt;
  const reordered = new Transaction({
    version: tx.version,
    lockTime: tx.lockTime,
    allowUnknownOutputs: true,
    allowUnknownInputs: true,
    allowLegacyWitnessUtxo: true,
  });
  for (let index = 0; index < tx.inputsLength; index++) reordered.addInput(tx.getInput(index));
  const order = [changeIndex, ...Array.from({ length: tx.outputsLength }, (_, i) => i).filter(i => i !== changeIndex)];
  for (const index of order) reordered.addOutput(tx.getOutput(index));
  return bytesToHex(reordered.toPSBT());
}

/** Prove two transactions share inputs, version, locktime and the same multiset of outputs. */
export function assertOnlyOutputOrderChanged(originalHex: string, reorderedHex: string): void {
  const original = parseConsensusTransaction(originalHex);
  const reordered = parseConsensusTransaction(reorderedHex);
  if (original.version !== reordered.version || original.lockTime !== reordered.lockTime) {
    throw new Error('Reordering changed the version or locktime.');
  }
  if (original.inputsLength !== reordered.inputsLength || original.outputsLength !== reordered.outputsLength) {
    throw new Error('Reordering changed the input or output count.');
  }
  for (let index = 0; index < original.inputsLength; index++) {
    const before = original.getInput(index);
    const after = reordered.getInput(index);
    if (
      bytesToHex(before.txid ?? new Uint8Array()) !== bytesToHex(after.txid ?? new Uint8Array())
      || before.index !== after.index
      || before.sequence !== after.sequence
      || bytesToHex(before.finalScriptSig ?? new Uint8Array()) !== bytesToHex(after.finalScriptSig ?? new Uint8Array())
    ) {
      throw new Error(`Reordering changed input ${index}.`);
    }
  }
  const describe = (tx: Transaction) => Array.from({ length: tx.outputsLength }, (_, i) => {
    const output = tx.getOutput(i);
    return `${output.amount}:${bytesToHex(output.script ?? new Uint8Array())}`;
  }).sort();
  const before = describe(original);
  const after = describe(reordered);
  if (before.some((entry, index) => entry !== after[index])) {
    throw new Error('Reordering changed an output.');
  }
}

