/**
 * Fixture builders and independent wire-format helpers for bare multisig
 * signing tests.
 *
 * The serializer, parser, and legacy sighash here are written from the
 * Bitcoin wire format directly, on purpose: they share no code with
 * @scure/btc-signer, so the signing tests cryptographically verify what the
 * signer produced against an independent implementation. That is the
 * regression net for the signer's use of the library's private preimage API.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes, bytesToHex, concatBytes } from '@noble/hashes/utils.js';

export interface WireInput {
  txidLE: Uint8Array;
  vout: number;
  script: Uint8Array;
  sequence: number;
}

export interface WireOutput {
  amount: bigint;
  script: Uint8Array;
}

export interface WireTx {
  version: number;
  inputs: WireInput[];
  outputs: WireOutput[];
  locktime: number;
}

function varint(n: number): Uint8Array {
  if (n < 0xfd) return Uint8Array.of(n);
  if (n <= 0xffff) return Uint8Array.of(0xfd, n & 0xff, n >> 8);
  throw new Error('varint too large for test fixtures');
}

function u32le(n: number): Uint8Array {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
}

function u64le(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) out[i] = Number((n >> BigInt(8 * i)) & 0xffn);
  return out;
}

/** Serialize a legacy (pre-segwit) transaction to wire bytes. */
export function serializeWireTx(tx: WireTx): Uint8Array {
  const parts: Uint8Array[] = [u32le(tx.version), varint(tx.inputs.length)];
  for (const input of tx.inputs) {
    parts.push(input.txidLE, u32le(input.vout), varint(input.script.length), input.script, u32le(input.sequence));
  }
  parts.push(varint(tx.outputs.length));
  for (const output of tx.outputs) {
    parts.push(u64le(output.amount), varint(output.script.length), output.script);
  }
  parts.push(u32le(tx.locktime));
  return concatBytes(...parts);
}

/** Parse legacy (pre-segwit) transaction wire bytes. */
export function parseWireTx(bytes: Uint8Array): WireTx {
  let offset = 0;
  const readVarint = (): number => {
    const first = bytes[offset++];
    if (first < 0xfd) return first;
    if (first === 0xfd) {
      const value = bytes[offset] | (bytes[offset + 1] << 8);
      offset += 2;
      return value;
    }
    throw new Error('varint too large for test fixtures');
  };
  const readU32 = (): number => {
    const value = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | ((bytes[offset + 3] << 24) >>> 0);
    offset += 4;
    return value >>> 0;
  };

  const version = readU32();
  const inputCount = readVarint();
  if (inputCount === 0) throw new Error('segwit marker encountered: expected legacy serialization');
  const inputs: WireInput[] = [];
  for (let i = 0; i < inputCount; i++) {
    const txidLE = bytes.slice(offset, offset + 32);
    offset += 32;
    const vout = readU32();
    const scriptLength = readVarint();
    const script = bytes.slice(offset, offset + scriptLength);
    offset += scriptLength;
    inputs.push({ txidLE, vout, script, sequence: readU32() });
  }
  const outputCount = readVarint();
  const outputs: WireOutput[] = [];
  for (let i = 0; i < outputCount; i++) {
    let amount = 0n;
    for (let b = 7; b >= 0; b--) amount = (amount << 8n) | BigInt(bytes[offset + b]);
    offset += 8;
    const scriptLength = readVarint();
    outputs.push({ amount, script: bytes.slice(offset, offset + scriptLength) });
    offset += scriptLength;
  }
  const locktime = readU32();
  if (offset !== bytes.length) throw new Error('trailing bytes after transaction');
  return { version, inputs, outputs, locktime };
}

/** Display-order txid of wire bytes. */
export function txidOf(txBytes: Uint8Array): string {
  return bytesToHex(sha256(sha256(txBytes)).reverse());
}

/**
 * BIP-unaware, from-scratch legacy SIGHASH_ALL digest: scriptSig of the
 * signed input replaced with the previous scriptPubKey, all other scriptSigs
 * emptied, 4-byte hash type appended, double SHA-256.
 */
export function legacySighashAll(tx: WireTx, inputIndex: number, scriptPubKey: Uint8Array): Uint8Array {
  const substituted: WireTx = {
    ...tx,
    inputs: tx.inputs.map((input, index) => ({
      ...input,
      script: index === inputIndex ? scriptPubKey : new Uint8Array(0),
    })),
  };
  return sha256(sha256(concatBytes(serializeWireTx(substituted), u32le(1))));
}

/** Convert a DER-encoded ECDSA signature to 64-byte compact form. */
export function derToCompact(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30 || der[1] !== der.length - 2) throw new Error('invalid DER sequence');
  let offset = 2;
  const readInt = (): Uint8Array => {
    if (der[offset++] !== 0x02) throw new Error('invalid DER integer');
    const length = der[offset++];
    let value = der.slice(offset, offset + length);
    offset += length;
    while (value.length > 32 && value[0] === 0x00) value = value.slice(1);
    if (value.length > 32) throw new Error('DER integer too large');
    const padded = new Uint8Array(32);
    padded.set(value, 32 - value.length);
    return padded;
  };
  const r = readInt();
  const s = readInt();
  if (offset !== der.length) throw new Error('trailing bytes in DER signature');
  return concatBytes(r, s);
}

/** m-of-n bare multisig script from raw key-slot bytes (no validity checks). */
export function bareMultisigScript(m: number, keys: Uint8Array[]): Uint8Array {
  return concatBytes(
    Uint8Array.of(0x50 + m),
    ...keys.map((key) => concatBytes(Uint8Array.of(key.length), key)),
    Uint8Array.of(0x50 + keys.length),
    Uint8Array.of(0xae)
  );
}

/**
 * Counterparty historical 1-of-2 data slot: length-prefixed CNTRPRTY
 * plaintext padded to 33 bytes. Starts with a length byte, so it can never
 * parse as a pubkey (which is exactly the case the signer must handle).
 */
export function counterpartyDataKey(): Uint8Array {
  const slot = new Uint8Array(33);
  const payload = new TextEncoder().encode('CNTRPRTYTESTDATA');
  slot[0] = payload.length;
  slot.set(payload, 1);
  return slot;
}

/**
 * Counterparty current 1-of-3 style fake key: valid 02/03 prefix but an
 * x coordinate above the field prime, so it is never on the curve.
 */
export function offCurveFakeKey(prefix: 0x02 | 0x03): Uint8Array {
  return concatBytes(Uint8Array.of(prefix), new Uint8Array(32).fill(0xff));
}

/**
 * Build a previous transaction paying the given outputs, with a fake outpoint
 * varied by `seed` so otherwise-identical fixtures get distinct txids.
 */
export function buildPrevTx(outputs: WireOutput[], seed: number): Uint8Array {
  return serializeWireTx({
    version: 2,
    inputs: [{
      txidLE: hexToBytes(seed.toString(16).padStart(64, '0')),
      vout: 0,
      script: new Uint8Array(0),
      sequence: 0xffffffff,
    }],
    outputs,
    locktime: 0,
  });
}
