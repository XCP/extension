/**
 * What a legacy (P2PKH) hunt would cost per attempt, on one thread, on this machine. Off by default:
 *
 *   ZELD_BENCH=1 ZELD_BENCH_OUT=legacy.json npx vitest run src/core/zeld/__tests__/legacy.bench.test.ts
 *
 * A legacy txid covers the scriptSig, which holds the signature, so the txid does not exist
 * until the input is signed and every nonce needs a fresh signature. The cheap way to sign per
 * attempt: fix the ECDSA nonce k for the hunt and vary nLockTime. Then r is fixed, the sighash z
 * changes with the locktime, and s = k^-1 (z + r d) = a z + b for constants a and b, one modular
 * multiply-add per attempt. Only the winning signature is ever published, so no two signatures
 * sharing k ever leave the hunt.
 *
 * Per attempt: sighash preimage rehashed from a midstate (the locktime sits eight bytes from its
 * end), one multiply-add mod n, the DER s bytes patched into the scriptSig, and the whole
 * transaction hashed for the txid.
 */

import { writeFileSync } from 'node:fs';
import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes } from '@noble/hashes/utils.js';
import * as secp from '@noble/secp256k1';
import * as btc from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { legacySighashPreimage, preimageLockTimeOffset } from '@/core/zeld/legacySighash';
import { MutableSha256d } from '@/core/zeld/sha256d';
import { PREV_TXID } from './fixtures';

const enabled = process.env.ZELD_BENCH === '1';
const ATTEMPTS = Number(process.env.ZELD_BENCH_ATTEMPTS ?? 500_000);

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_N = N >> 1n;

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

/** 32 big-endian bytes to a bigint in four 64-bit reads rather than thirty-two shifts. */
function digestToBigInt(bytes: Uint8Array): bigint {
  const view = new DataView(bytes.buffer, bytes.byteOffset, 32);
  return (view.getBigUint64(0) << 192n) | (view.getBigUint64(8) << 128n) | (view.getBigUint64(16) << 64n) | view.getBigUint64(24);
}

const MASK64 = 0xffff_ffff_ffff_ffffn;
function bigIntTo32Bytes(value: bigint, out: Uint8Array): void {
  const view = new DataView(out.buffer, out.byteOffset, 32);
  view.setBigUint64(24, value & MASK64);
  view.setBigUint64(16, (value >> 64n) & MASK64);
  view.setBigUint64(8, (value >> 128n) & MASK64);
  view.setBigUint64(0, value >> 192n);
}

describe.runIf(enabled)('legacy hunt cost', () => {
  it('signs per attempt with a fixed k and reports hashes per second', () => {
    secp.hashes.sha256 = sha256;
    const d = secp.utils.randomSecretKey();
    const pubkey = secp.getPublicKey(d, true);
    const p2pkh = btc.p2pkh(pubkey);

    // A one-input P2PKH spend: data output then change, like an enhanced send.
    const tx = new btc.Transaction({ allowUnknownOutputs: true, allowUnknownInputs: true });
    tx.addInput({ txid: hexToBytes(PREV_TXID), index: 0, sequence: 0xffffffff });
    tx.addOutput({ script: new Uint8Array([0x6a, 0x04, 1, 2, 3, 4]), amount: 0n });
    tx.addOutput({ script: p2pkh.script, amount: 95_000n });

    const unsigned = tx.toBytes(true, false);
    // Legacy SIGHASH_ALL preimage for input 0 with the P2PKH scriptCode.
    const preimage = legacySighashPreimage(unsigned, 0, p2pkh.script);
    const lockTimeInPreimage = preimageLockTimeOffset(preimage);

    // Fixed nonce for the hunt, and the constants that make s a multiply-add.
    const k = bytesToBigInt(secp.utils.randomSecretKey());
    const R = secp.Point.BASE.multiply(k);
    const r = secp.etc.mod(R.x, N);
    const a = secp.etc.invert(k, N);
    const b = secp.etc.mod(a * secp.etc.mod(r * bytesToBigInt(d), N), N);

    // The signed transaction's bytes with a placeholder signature, so the s window and the
    // locktime window can be patched in place. DER: 30 len 02 rlen r 02 20 s, then hashtype.
    const rBytes = secp.etc.numberToBytesBE(r);
    const rDer = rBytes[0]! & 0x80 ? new Uint8Array([0, ...rBytes]) : rBytes;
    const sigLength = 2 + 2 + rDer.length + 2 + 32 + 1;
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
    const sOffsetInScriptSig = cursor;
    cursor += 32;
    scriptSig[cursor++] = btc.SigHash.ALL;
    scriptSig[cursor++] = pubkey.length;
    scriptSig.set(pubkey, cursor);

    // Input 0's scriptSig length byte sits at 4 + 1 + 36; the empty script follows it.
    const scriptSigLengthOffset = 4 + 1 + 36;
    const signed = new Uint8Array(unsigned.length + scriptSig.length);
    signed.set(unsigned.subarray(0, scriptSigLengthOffset));
    signed[scriptSigLengthOffset] = scriptSig.length;
    signed.set(scriptSig, scriptSigLengthOffset + 1);
    signed.set(unsigned.subarray(scriptSigLengthOffset + 1), scriptSigLengthOffset + 1 + scriptSig.length);
    const sOffset = scriptSigLengthOffset + 1 + sOffsetInScriptSig;
    const lockTimeInTx = signed.length - 4;

    const sighash = new MutableSha256d(preimage, lockTimeInPreimage);
    const txid = new MutableSha256d(signed);
    const sBytes = new Uint8Array(32);

    const grind = (attempts: number) => {
      let zeros = 0;
      for (let nonce = 1; nonce <= attempts; nonce++) {
        sighash.setUint32LE(lockTimeInPreimage, nonce);
        sighash.hashLeadingZeroNibbles();
        const z = digestToBigInt(sighash.digest());
        let s = (a * z + b) % N;
        if (s > HALF_N) s = N - s;
        bigIntTo32Bytes(s, sBytes);
        txid.setBytes(sOffset, sBytes);
        txid.setUint32LE(lockTimeInTx, nonce);
        if (txid.hashLeadingZeroNibbles() >= 2) zeros++;
      }
      return zeros;
    };

    grind(20_000);
    const started = performance.now();
    const zerosSeen = grind(ATTEMPTS);
    const elapsed = (performance.now() - started) / 1000;

    // The last attempt is a real signature: the library must verify it against the pubkey and
    // the sighash of the transaction exactly as patched.
    const last = ATTEMPTS;
    const finalBytes = new Uint8Array(signed);
    finalBytes.set(sBytes, sOffset);
    new DataView(finalBytes.buffer).setUint32(lockTimeInTx, last, true);
    const finalTx = btc.Transaction.fromRaw(finalBytes, { allowUnknownOutputs: true, allowUnknownInputs: true });
    expect(finalTx.lockTime).toBe(last);
    expect(finalTx.id).toBe(txid.txid());
    const patchedPreimage = new Uint8Array(preimage);
    new DataView(patchedPreimage.buffer).setUint32(lockTimeInPreimage, last, true);
    const z = sha256(sha256(patchedPreimage));
    // The library's own sighash for the same transaction at that locktime must agree.
    const atLockTime = new btc.Transaction({ allowUnknownOutputs: true, allowUnknownInputs: true, lockTime: last });
    atLockTime.addInput({ txid: hexToBytes(PREV_TXID), index: 0, sequence: 0xffffffff });
    atLockTime.addOutput({ script: new Uint8Array([0x6a, 0x04, 1, 2, 3, 4]), amount: 0n });
    atLockTime.addOutput({ script: p2pkh.script, amount: 95_000n });
    const libraryHash = (atLockTime as unknown as { preimageLegacy: (idx: number, script: Uint8Array, hashType: number) => Uint8Array })
      .preimageLegacy(0, p2pkh.script, btc.SigHash.ALL);
    expect(Buffer.from(libraryHash).toString('hex')).toBe(Buffer.from(z).toString('hex'));
    const sig = new secp.Signature(r, bytesToBigInt(sBytes));
    expect(secp.verify(sig.toBytes('compact'), z, pubkey, { lowS: true, prehash: false })).toBe(true);

    const report = JSON.stringify({
      attempts: ATTEMPTS,
      hashesPerSecond: Math.round(ATTEMPTS / elapsed),
      zerosSeen,
      preimageBytes: preimage.length,
      signedTxBytes: signed.length,
    }, null, 2);
    console.log(report);
    if (process.env.ZELD_BENCH_OUT) writeFileSync(process.env.ZELD_BENCH_OUT, report);
    expect(zerosSeen).toBeGreaterThan(0);
  }, 600_000);
});
