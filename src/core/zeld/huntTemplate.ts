/**
 * Decide whether a composed transaction can hunt for a ZELD txid, and prepare the bytes it hunts
 * over.
 *
 * The nonce is nLockTime, and every input's nSequence is set final so consensus never reads the
 * locktime at all. Two things make that safe to vary after composition and before signing:
 *
 * 1. A txid is the hash of the transaction without witness data. For a Native SegWit or Taproot
 *    input the scriptSig stays empty after signing, so the txid the hunt computes on the unsigned
 *    bytes is the txid the signed transaction will have. A legacy input puts its signature in the
 *    scriptSig, and a nested SegWit input puts its redeem script there, so either would change
 *    the txid at signing time and waste the hunt. Those formats are refused here.
 * 2. Counterparty never reads nLockTime or nSequence (`counterparty-rs` records both and the
 *    Python parser ignores them), and the ZELD protocol reads only the txid and the outputs.
 *
 * The reward attaches to the first non-OP_RETURN output, so the hunt is also refused when that
 * output pays anyone but the source address: an enhanced send's OP_RETURN-then-change layout
 * qualifies, a BTC send whose first output is the recipient does not.
 */

import { Address, NETWORK, OutScript, TEST_NETWORK } from '@scure/btc-signer';
import { AddressFormat } from '@/core/bitcoin/address';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { decodeRawTransaction, parseConsensusTransaction } from '@/core/bitcoin/rawTransaction';
import { bytesToHex } from '@/core/counterparty/unpack/binary';
import { FINAL_SEQUENCE } from '@/core/zeld/protocol';

export interface HuntTemplate {
  /**
   * Non-witness serialization of the transaction with every input's sequence set final: exactly
   * what the txid of the hunted transaction hashes.
   */
  message: Uint8Array;
  /** Byte offset of nLockTime inside `message`: its last four bytes. */
  nonceOffset: number;
  /** The locktime the composer gave the transaction; the hunt replaces it. */
  originalLockTime: number;
}

export type HuntAssessment =
  | { eligible: true; template: HuntTemplate }
  | { eligible: false; reason: string };

const HUNTABLE_FORMATS: ReadonlySet<AddressFormat> = new Set([
  AddressFormat.P2WPKH,
  AddressFormat.P2TR,
  AddressFormat.CounterwalletSegwit,
  AddressFormat.FreewalletBIP39Segwit,
]);

/** Formats whose signed txid equals their unsigned txid. */
export function isHuntableAddressFormat(format: AddressFormat): boolean {
  return HUNTABLE_FORMATS.has(format);
}

const REGTEST_NETWORK = { ...TEST_NETWORK, bech32: 'bcrt' };

/**
 * The scriptPubKey an address encodes, as lowercase hex, on whichever network it belongs to.
 * Outputs are compared by script rather than by rendered address so the check is exact and does
 * not depend on which network the parser renders addresses for.
 */
export function scriptHexForAddress(address: string): string | null {
  for (const network of [NETWORK, TEST_NETWORK, REGTEST_NETWORK]) {
    try {
      return bytesToHex(OutScript.encode(Address(network).decode(address)));
    } catch {
      // Not this network's encoding; try the next.
    }
  }
  return null;
}

function readVarint(bytes: Uint8Array, position: number): { value: number; size: number } {
  const first = bytes[position];
  if (first === undefined) throw new RangeError('truncated transaction');
  if (first < 0xfd) return { value: first, size: 1 };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (first === 0xfd) return { value: view.getUint16(position + 1, true), size: 3 };
  if (first === 0xfe) return { value: view.getUint32(position + 1, true), size: 5 };
  // A 64-bit count could never describe a transaction this wallet parses.
  throw new RangeError('unsupported varint');
}

interface InputLayout {
  /** Byte offset of every input's nSequence, in input order. */
  sequenceOffsets: number[];
  /** Whether any input carries scriptSig bytes. */
  hasScriptSig: boolean;
}

/**
 * Walk a serialized transaction far enough to find each input's sequence field. Handles both the
 * non-witness serialization (what the txid hashes) and the witness serialization (what the
 * composer returns), which differ only by the two marker bytes after the version.
 */
export function locateInputSequences(bytes: Uint8Array): InputLayout {
  let position = 4;
  if (bytes[4] === 0x00 && bytes[5] === 0x01) position = 6;
  const count = readVarint(bytes, position);
  position += count.size;
  const sequenceOffsets: number[] = [];
  let hasScriptSig = false;
  for (let index = 0; index < count.value; index++) {
    position += 36;
    const scriptLength = readVarint(bytes, position);
    position += scriptLength.size;
    if (scriptLength.value > 0) hasScriptSig = true;
    position += scriptLength.value;
    sequenceOffsets.push(position);
    position += 4;
  }
  if (position > bytes.length) throw new RangeError('truncated transaction');
  return { sequenceOffsets, hasScriptSig };
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

export interface AssessZeldHuntInput {
  rawTxHex: string;
  sourceAddress: string;
  addressFormat: AddressFormat;
}

/** Whether, and over which bytes, this composed transaction can hunt. */
export function assessZeldHunt({ rawTxHex, sourceAddress, addressFormat }: AssessZeldHuntInput): HuntAssessment {
  if (!isHuntableAddressFormat(addressFormat)) {
    return {
      eligible: false,
      reason: 'Only Native SegWit and Taproot addresses can hunt. Signing a legacy or nested '
        + 'SegWit input changes the txid, so a hunt before signing would be wasted.',
    };
  }

  let message: Uint8Array;
  try {
    message = parseConsensusTransaction(rawTxHex).toBytes(true, false);
  } catch {
    return { eligible: false, reason: 'The composed transaction could not be parsed.' };
  }

  let layout: InputLayout;
  try {
    layout = locateInputSequences(message);
  } catch {
    return { eligible: false, reason: 'The composed transaction could not be parsed.' };
  }
  if (layout.sequenceOffsets.length === 0) {
    return { eligible: false, reason: 'The transaction has no inputs.' };
  }
  if (layout.hasScriptSig) {
    return {
      eligible: false,
      reason: 'An input already carries script bytes, so its txid is not settled until signing.',
    };
  }

  const parsed = parseRawTransactionLocally(rawTxHex);
  if (!parsed) {
    return { eligible: false, reason: 'The composed transaction could not be parsed.' };
  }
  const rewardOutput = parsed.outputs.find(output => output.type !== 'op_return');
  if (!rewardOutput) {
    return { eligible: false, reason: 'The transaction has no spendable output for ZELD to land on.' };
  }
  const sourceScript = scriptHexForAddress(sourceAddress);
  if (!sourceScript) {
    return { eligible: false, reason: 'The source address could not be decoded.' };
  }
  if (rewardOutput.script?.toLowerCase() !== sourceScript) {
    return {
      eligible: false,
      reason: 'ZELD lands on the first spendable output, and this transaction pays that output '
        + 'to someone else.',
    };
  }

  const nonceOffset = message.length - 4;
  const originalLockTime = readUint32LE(message, nonceOffset);
  const view = new DataView(message.buffer, message.byteOffset, message.byteLength);
  for (const offset of layout.sequenceOffsets) view.setUint32(offset, FINAL_SEQUENCE, true);
  return { eligible: true, template: { message, nonceOffset, originalLockTime } };
}

/** The template's message with `nonce` written into nLockTime. A copy; the template is untouched. */
export function messageWithNonce(template: HuntTemplate, nonce: number): Uint8Array {
  const bytes = new Uint8Array(template.message);
  new DataView(bytes.buffer).setUint32(template.nonceOffset, nonce >>> 0, true);
  return bytes;
}

/**
 * The composer's raw transaction with nLockTime replaced and every input's sequence set final.
 * Works on the composer's own serialization rather than re-encoding, so every other byte is
 * provably the one that was verified; `assertOnlyNonceChanged` then checks the claim from the
 * parsed side.
 */
export function rawTransactionWithNonce(rawTxHex: string, lockTime: number): string {
  const bytes = new Uint8Array(decodeRawTransaction(rawTxHex));
  const layout = locateInputSequences(bytes);
  if (layout.sequenceOffsets.length === 0) throw new Error('The transaction has no inputs.');
  const view = new DataView(bytes.buffer);
  for (const offset of layout.sequenceOffsets) view.setUint32(offset, FINAL_SEQUENCE, true);
  view.setUint32(bytes.length - 4, lockTime >>> 0, true);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/**
 * Prove a hunted transaction differs from the verified one only in the nonce fields: nLockTime,
 * and every input's sequence now final. Every output, every other input field and the version
 * are compared from independently parsed structures, so a bug in the byte patching cannot pass
 * unnoticed.
 */
export function assertOnlyNonceChanged(originalHex: string, huntedHex: string): void {
  const original = parseConsensusTransaction(originalHex);
  const hunted = parseConsensusTransaction(huntedHex);
  if (original.version !== hunted.version) {
    throw new Error('The hunted transaction changed its version.');
  }
  if (original.inputsLength !== hunted.inputsLength || original.outputsLength !== hunted.outputsLength) {
    throw new Error('The hunted transaction changed its input or output count.');
  }
  const sameBytes = (a: Uint8Array | undefined, b: Uint8Array | undefined): boolean => {
    if (a === undefined || b === undefined) return a === b;
    return a.length === b.length && a.every((byte, index) => byte === b[index]);
  };
  for (let index = 0; index < original.inputsLength; index++) {
    const before = original.getInput(index);
    const after = hunted.getInput(index);
    if (
      !sameBytes(before.txid, after.txid)
      || before.index !== after.index
      || !sameBytes(before.finalScriptSig, after.finalScriptSig)
      || after.sequence !== FINAL_SEQUENCE
    ) {
      throw new Error(`The hunted transaction changed input ${index} beyond making its sequence final.`);
    }
  }
  for (let index = 0; index < original.outputsLength; index++) {
    const before = original.getOutput(index);
    const after = hunted.getOutput(index);
    if (before.amount !== after.amount || !sameBytes(before.script, after.script)) {
      throw new Error(`The hunted transaction changed output ${index}.`);
    }
  }
}
