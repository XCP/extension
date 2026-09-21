/**
 * The legacy (pre-SegWit) SIGHASH_ALL preimage of one input of an unsigned transaction.
 *
 * Bitcoin's original signature hash serializes the transaction with the signed input's scriptSig
 * replaced by the scriptCode (for P2PKH, the previous output's scriptPubKey), every other
 * scriptSig emptied, and the four-byte hash type appended; the sighash is the double SHA-256 of
 * that. The wallet's composed transactions carry no scriptSig at all, so the preimage is the
 * composed bytes with one script spliced in.
 *
 * Only SIGHASH_ALL and only the non-witness serialization are handled: that is the one shape a
 * legacy hunt signs. The result is pinned against `@scure/btc-signer`'s own sighash in the tests.
 */

import { locateInputSequences } from '@/core/zeld/huntTemplate';

export const SIGHASH_ALL = 1;

/** Byte offset of nLockTime inside a preimage: it precedes the trailing hash type. */
export function preimageLockTimeOffset(preimage: Uint8Array): number {
  return preimage.length - 8;
}

function varint(value: number): Uint8Array {
  if (value < 0xfd) return Uint8Array.of(value);
  if (value <= 0xffff) return Uint8Array.of(0xfd, value & 0xff, value >> 8);
  throw new RangeError('scriptCode too long');
}

export function legacySighashPreimage(unsignedTx: Uint8Array, inputIndex: number, scriptCode: Uint8Array): Uint8Array {
  if (unsignedTx[4] === 0x00 && unsignedTx[5] === 0x01) {
    throw new RangeError('legacy preimages are built from the non-witness serialization');
  }
  const layout = locateInputSequences(unsignedTx);
  if (layout.hasScriptSig) throw new RangeError('the transaction must not be signed yet');
  const at = layout.scriptSigOffsets[inputIndex];
  if (at === undefined) throw new RangeError('no such input');
  const length = varint(scriptCode.length);
  const out = new Uint8Array(unsignedTx.length - 1 + length.length + scriptCode.length + 4);
  out.set(unsignedTx.subarray(0, at), 0);
  out.set(length, at);
  out.set(scriptCode, at + length.length);
  out.set(unsignedTx.subarray(at + 1), at + length.length + scriptCode.length);
  new DataView(out.buffer).setUint32(out.length - 4, SIGHASH_ALL, true);
  return out;
}
