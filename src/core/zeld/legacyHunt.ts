/**
 * Hunt for a ZELD txid on a legacy (P2PKH) transaction.
 *
 * A legacy txid covers the scriptSig, which holds the signature, so the transaction has no txid
 * until it is signed and every nonce needs a fresh signature. Signing per attempt the ordinary
 * way (a new ECDSA nonce, a scalar multiplication) would be a hundred times slower than hashing.
 * Instead the ECDSA nonce k is fixed for the hunt and nLockTime moves:
 *
 *   r = (k·G).x is then constant, the sighash z changes with the locktime, and
 *   s = k⁻¹ (z + r·d) = a·z + b   with a = k⁻¹ and b = k⁻¹·r·d fixed for the hunt,
 *
 * one modular multiply-add per input per attempt. Each input gets its own k, since two published
 * signatures sharing k and a key would reveal the key; and of the millions of candidate
 * signatures only the winning transaction's are ever published, so no two signatures sharing k
 * ever leave the hunt. The candidates are discarded with the hunt.
 *
 * `a` and `b` are as secret as the private key (together with the public r they determine it), so
 * a template is handled like key material: it lives in the signer's own workers for the length of
 * the hunt and nowhere else. The transaction the hunt produces is verified afterwards with the
 * audited library, signature by signature, before anything is broadcast.
 *
 * DER encodes r and s as minimal signed integers, so a value whose top byte is zero would be one
 * byte shorter and shift every later byte. k is drawn until r's top byte is non-zero and low-R, and an
 * attempt whose s has a zero top byte is skipped, so every candidate transaction has the same
 * length and the same fee. A low-R nonce also avoids adding a DER padding byte per input,
 * matching the ordinary wallet signer's low-R policy.
 */

import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as secp from '@noble/secp256k1';
import { locateInputSequences } from '@/core/zeld/huntTemplate';
import { legacySighashPreimage, preimageLockTimeOffset, SIGHASH_ALL } from '@/core/zeld/legacySighash';
import type { MineRangeFound, MineRangeResult } from '@/core/zeld/mineRange';
import { FINAL_SEQUENCE } from '@/core/zeld/protocol';
import { MutableSha256d } from '@/core/zeld/sha256d';

// The synchronous noble API needs its hashes wired once; bip322.ts does the same.
if (!secp.hashes.sha256) secp.hashes.sha256 = (message) => new Uint8Array(sha256(message));
if (!secp.hashes.hmacSha256) secp.hashes.hmacSha256 = (key, message) => new Uint8Array(hmac(sha256, key, message));

/** secp256k1 group order. */
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_N = N >> 1n;
const MASK64 = 0xffff_ffff_ffff_ffffn;
/** An s below 2^248 has a zero top byte, which DER would drop. */
const MIN_FULL_LENGTH_S = 1n << 248n;

export interface LegacyHuntInput {
  /** SIGHASH_ALL preimage for this input, with the locktime window open. */
  preimage: Uint8Array;
  preimageLockTimeOffset: number;
  /** Where this input's 32 signature `s` bytes sit inside `signed`. */
  sOffset: number;
  r: bigint;
  a: bigint;
  b: bigint;
}

export interface LegacyHuntTemplate {
  kind: 'legacy';
  /** The transaction with every scriptSig in place, every sequence final, and the `s` values and locktime to fill. */
  signed: Uint8Array;
  lockTimeOffset: number;
  inputs: LegacyHuntInput[];
  pubkey: Uint8Array;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

/** 32 big-endian bytes to a bigint in four 64-bit reads. */
function digestToBigInt(view: DataView): bigint {
  return (view.getBigUint64(0) << 192n) | (view.getBigUint64(8) << 128n) | (view.getBigUint64(16) << 64n) | view.getBigUint64(24);
}

function bigIntTo32Bytes(value: bigint, view: DataView): void {
  view.setBigUint64(24, value & MASK64);
  view.setBigUint64(16, (value >> 64n) & MASK64);
  view.setBigUint64(8, (value >> 128n) & MASK64);
  view.setBigUint64(0, value >> 192n);
}

/** Low-S normalized `s` for the sighash `z`, or null when DER would shorten it. */
function signatureS(input: LegacyHuntInput, z: bigint): bigint | null {
  let s = (input.a * z + input.b) % N;
  if (s === 0n) return null;
  if (s > HALF_N) s = N - s;
  return s < MIN_FULL_LENGTH_S ? null : s;
}

/**
 * Build the hunt template for an unsigned, non-witness legacy transaction whose inputs all pay
 * the key's own P2PKH script. `scriptCodes[i]` is input i's previous scriptPubKey. The private
 * key bytes are read once and are the caller's to zero.
 */
export function prepareLegacyHunt(
  unsignedTx: Uint8Array,
  scriptCodes: Uint8Array[],
  privateKey: Uint8Array,
  compressed: boolean,
): LegacyHuntTemplate {
  const layout = locateInputSequences(unsignedTx);
  if (layout.hasScriptSig) throw new RangeError('the transaction must not be signed yet');
  if (layout.sequenceOffsets.length !== scriptCodes.length) {
    throw new RangeError('one scriptCode per input is required');
  }
  const unsigned = new Uint8Array(unsignedTx);
  const unsignedView = new DataView(unsigned.buffer);
  for (const offset of layout.sequenceOffsets) unsignedView.setUint32(offset, FINAL_SEQUENCE, true);

  const pubkey = secp.getPublicKey(privateKey, compressed);
  const d = bytesToBigInt(privateKey);

  const scriptSigs: Uint8Array[] = [];
  const sOffsetsInScriptSig: number[] = [];
  const constants: Array<{ r: bigint; a: bigint; b: bigint }> = [];
  for (let index = 0; index < scriptCodes.length; index++) {
    let k: bigint;
    let r: bigint;
    let rBytes: Uint8Array;
    do {
      k = bytesToBigInt(secp.utils.randomSecretKey());
      r = secp.etc.mod(secp.Point.BASE.multiply(k).x, N);
      rBytes = secp.etc.numberToBytesBE(r);
    } while (r === 0n || rBytes[0] === 0 || (rBytes[0]! & 0x80) !== 0);
    const a = secp.etc.invert(k, N);
    const b = secp.etc.mod(a * secp.etc.mod(r * d, N), N);
    constants.push({ r, a, b });

    // DER: 30 len 02 20 r 02 20 s, then the hash type. Low-R needs no leading padding byte.
    const rDer = rBytes;
    const sigLength = 6 + rDer.length + 32 + 1;
    const scriptSig = new Uint8Array(1 + sigLength + 1 + pubkey.length);
    let cursor = 0;
    scriptSig[cursor++] = sigLength;
    scriptSig[cursor++] = 0x30;
    scriptSig[cursor++] = sigLength - 3;
    scriptSig[cursor++] = 0x02;
    scriptSig[cursor++] = rDer.length;
    scriptSig.set(rDer, cursor);
    cursor += rDer.length;
    scriptSig[cursor++] = 0x02;
    scriptSig[cursor++] = 32;
    sOffsetsInScriptSig.push(cursor);
    cursor += 32;
    scriptSig[cursor++] = SIGHASH_ALL;
    scriptSig[cursor++] = pubkey.length;
    scriptSig.set(pubkey, cursor);
    scriptSigs.push(scriptSig);
  }

  // Splice every scriptSig into the unsigned bytes, front to back, noting where each `s` lands.
  const total = unsigned.length + scriptSigs.reduce((sum, script) => sum + script.length, 0);
  const signed = new Uint8Array(total);
  const inputs: LegacyHuntInput[] = [];
  let from = 0;
  let to = 0;
  for (let index = 0; index < scriptSigs.length; index++) {
    const at = layout.scriptSigOffsets[index]!;
    signed.set(unsigned.subarray(from, at), to);
    to += at - from;
    const scriptSig = scriptSigs[index]!;
    signed[to] = scriptSig.length;
    signed.set(scriptSig, to + 1);
    const preimage = legacySighashPreimage(unsigned, index, scriptCodes[index]!);
    inputs.push({
      preimage,
      preimageLockTimeOffset: preimageLockTimeOffset(preimage),
      sOffset: to + 1 + sOffsetsInScriptSig[index]!,
      ...constants[index]!,
    });
    to += 1 + scriptSig.length;
    from = at + 1;
  }
  signed.set(unsigned.subarray(from), to);

  return { kind: 'legacy', signed, lockTimeOffset: signed.length - 4, inputs, pubkey };
}

/** Hashers reused across batches over one template. */
export interface LegacyMinerState {
  txid: MutableSha256d;
  sighashes: MutableSha256d[];
  s: Uint8Array;
  digest: Uint8Array;
  sView: DataView;
  digestView: DataView;
}

export function createLegacyMinerState(template: LegacyHuntTemplate): LegacyMinerState {
  const s = new Uint8Array(32);
  const digest = new Uint8Array(32);
  return {
    // Version, outpoint and the first signature's r are fixed. Reuse every complete block
    // before its s; all mutable signatures and locktime remain in the unhashed suffix.
    txid: new MutableSha256d(template.signed, template.inputs[0]?.sOffset),
    sighashes: template.inputs.map(input => new MutableSha256d(input.preimage, input.preimageLockTimeOffset)),
    s,
    digest,
    sView: new DataView(s.buffer),
    digestView: new DataView(digest.buffer),
  };
}

/**
 * Sign-and-hash `count` consecutive locktimes from `startNonce`, with the same qualify-and-stop
 * rules as `mineRange`. Attempts DER would shorten are skipped and not counted.
 */
export function mineLegacyRange(
  template: LegacyHuntTemplate,
  startNonce: number,
  count: number,
  targetZeros: number,
  stopZeros: number = targetZeros,
  state: LegacyMinerState = createLegacyMinerState(template),
): MineRangeResult {
  const end = startNonce + count;
  if (startNonce < 0 || end > 0x1_0000_0000) throw new RangeError('nonce range must fit in 32 bits');
  const { txid, sighashes, s, digest, sView, digestView } = state;
  let attempts = 0;
  let best: MineRangeFound | undefined;
  nonces: for (let nonce = startNonce; nonce < end; nonce++) {
    for (let index = 0; index < template.inputs.length; index++) {
      const input = template.inputs[index]!;
      const sighash = sighashes[index]!;
      sighash.setUint32LE(input.preimageLockTimeOffset, nonce);
      sighash.hashLeadingZeroNibbles();
      sighash.digestInto(digest);
      const value = signatureS(input, digestToBigInt(digestView));
      if (value === null) continue nonces;
      bigIntTo32Bytes(value, sView);
      txid.setBytes(input.sOffset, s);
    }
    txid.setUint32LE(template.lockTimeOffset, nonce);
    attempts++;
    const zeros = txid.hashLeadingZeroNibbles();
    if (zeros < targetZeros || (best && zeros <= best.zeroCount)) continue;
    const hex = txid.txid();
    let zeroCount = 0;
    while (zeroCount < hex.length && hex[zeroCount] === '0') zeroCount++;
    best = { nonce, txid: hex, zeroCount };
    if (zeroCount >= stopZeros) return { attempts, best, stopped: true };
  }
  return { attempts, best, stopped: false };
}

/** The fully signed transaction for one locktime, or null when that locktime was a skipped attempt. */
export function legacySignedTransaction(template: LegacyHuntTemplate, nonce: number): Uint8Array | null {
  const signed = new Uint8Array(template.signed);
  const s = new Uint8Array(32);
  for (const input of template.inputs) {
    const preimage = new Uint8Array(input.preimage);
    new DataView(preimage.buffer).setUint32(input.preimageLockTimeOffset, nonce >>> 0, true);
    const value = signatureS(input, bytesToBigInt(sha256(sha256(preimage))));
    if (value === null) return null;
    bigIntTo32Bytes(value, new DataView(s.buffer, s.byteOffset, 32));
    signed.set(s, input.sOffset);
  }
  new DataView(signed.buffer).setUint32(template.lockTimeOffset, nonce >>> 0, true);
  return signed;
}

/**
 * Check every signature in a hunted transaction with the audited library against the sighash
 * recomputed from the template's preimages at that locktime. Throws on the first failure.
 */
export function verifyLegacySignatures(template: LegacyHuntTemplate, signed: Uint8Array, nonce: number): void {
  if (signed.length !== template.signed.length) throw new Error('The hunted transaction has the wrong length.');
  const expected = template.signed.slice();
  new DataView(expected.buffer).setUint32(template.lockTimeOffset, nonce >>> 0, true);
  for (const [index, input] of template.inputs.entries()) {
    const preimage = new Uint8Array(input.preimage);
    new DataView(preimage.buffer).setUint32(input.preimageLockTimeOffset, nonce >>> 0, true);
    const z = sha256(sha256(preimage));
    const r = signed.subarray(input.sOffset - 34, input.sOffset - 2);
    const s = signed.subarray(input.sOffset, input.sOffset + 32);
    if (!r[0] || r[0] >= 128 || !s[0] || s[0] >= 128) throw new Error('The hunted signature has non-canonical integers.');
    expected.set(r, input.sOffset - 34);
    expected.set(s, input.sOffset);
    const signature = new secp.Signature(bytesToBigInt(r), bytesToBigInt(s));
    if (!secp.verify(signature.toBytes('compact'), z, template.pubkey, { lowS: true, prehash: false })) {
      throw new Error(`Input ${index} of the hunted transaction does not verify.`);
    }
  }
  // Also bind the actual DER headers, sighash flags and public keys to the approved template.
  if (signed.some((byte, index) => byte !== expected[index])) throw new Error('The hunted transaction changed outside its signatures or locktime.');
}

/** The signed transaction with every scriptSig emptied: the form the review verified, plus the nonce. */
export function unsignedFormOf(signed: Uint8Array): Uint8Array {
  const layout = locateInputSequences(signed);
  const parts: Uint8Array[] = [];
  let from = 0;
  for (const at of layout.scriptSigOffsets) {
    parts.push(signed.subarray(from, at), Uint8Array.of(0));
    const length = signed[at]!;
    if (length >= 0xfd) throw new RangeError('unexpected scriptSig length');
    from = at + 1 + length;
  }
  parts.push(signed.subarray(from));
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let to = 0;
  for (const part of parts) {
    out.set(part, to);
    to += part.length;
  }
  return out;
}
