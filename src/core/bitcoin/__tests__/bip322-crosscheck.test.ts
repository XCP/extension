/**
 * The two BIP-322 paths nobody publishes a vector for, checked against a second implementation.
 *
 * `bip-0322/basic-test-vectors.json` covers p2wpkh, p2wsh-multisig and p2tr. It does not cover
 * P2PKH — the spec directs legacy addresses to the legacy signed-message format instead — and it
 * does not cover P2SH-P2WPKH. Both nonetheless go through `calculateLegacySighashManual` and
 * `calculateWitnessV0SighashManual`, the two helpers that were wrong until 0.8.2: the segwit path
 * was broken in two ways at once and stayed that way for months behind a test asserting only
 * `typeof result === 'boolean'`.
 *
 * With no vector to compare against, the next best evidence is a *different* implementation
 * agreeing. `@scure/btc-signer` computes both sighashes itself, from a transaction it builds, with
 * no code shared with `bip322.ts`. Checking both directions is the point:
 *
 *   - outbound — a signature this wallet produces verifies under scure's sighash, so what it emits
 *     is readable elsewhere;
 *   - inbound — a signature made over scure's sighash verifies in this wallet, so what others emit
 *     is readable here.
 *
 * Segwit failed both of those while its round-trip test passed, which is exactly why agreeing with
 * ourselves is not evidence.
 */

import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as secp256k1 from '@noble/secp256k1';
import { hashes } from '@noble/secp256k1';
import { base64, hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import {
  bip322MessageHash,
  createToSpendTransaction,
  signBIP322P2PKH,
  signBIP322P2SH_P2WPKH,
  verifyBIP322Signature,
} from '../bip322';

if (!hashes.sha256) hashes.sha256 = (m) => new Uint8Array(sha256(m));
if (!hashes.hmacSha256) hashes.hmacSha256 = (k, m) => new Uint8Array(hmac(sha256, k, m));

const PRIV = hex.decode('55d7c5a9ce3d2b15a62434d01205f3e59077d51316f5c20628b3a4b8b2a76f4c');
const PUBKEY = secp256k1.getPublicKey(PRIV, true);
const MESSAGES = ['', 'Hello World', 'a longer message to sign'];

/** A consensus witness stack, as BIP-322 base64-encodes it. */
function parseWitness(b64: string): Uint8Array[] {
  const bytes = base64.decode(b64);
  const items: Uint8Array[] = [];
  let offset = 1;
  for (let i = 0; i < bytes[0]!; i++) {
    const length = bytes[offset++]!;
    items.push(bytes.slice(offset, offset + length));
    offset += length;
  }
  return items;
}

/** noble v3 dropped DER parsing ("switch to noble-curves"), so unwrap it here. */
function derToCompact(der: Uint8Array): Uint8Array {
  let offset = 2;
  const rLen = der[offset + 1]!;
  const r = der.slice(offset + 2, offset + 2 + rLen);
  offset += 2 + rLen;
  const sLen = der[offset + 1]!;
  const s = der.slice(offset + 2, offset + 2 + sLen);
  const rb = r[0] === 0 ? r.slice(1) : r;
  const sb = s[0] === 0 ? s.slice(1) : s;
  const out = new Uint8Array(64);
  out.set(rb, 32 - rb.length);
  out.set(sb, 64 - sb.length);
  return out;
}

function compactToDer(sig: Uint8Array): Uint8Array {
  const trim = (v: Uint8Array) => {
    let i = 0;
    while (i < v.length - 1 && v[i] === 0 && (v[i + 1]! & 0x80) === 0) i++;
    const t = v.slice(i);
    return t[0]! & 0x80 ? Uint8Array.from([0, ...t]) : t;
  };
  const r = trim(sig.slice(0, 32));
  const s = trim(sig.slice(32));
  return Uint8Array.from([0x30, 4 + r.length + s.length, 0x02, r.length, ...r, 0x02, s.length, ...s]);
}

function encodeWitness(items: Uint8Array[]): string {
  const parts: number[] = [items.length];
  for (const item of items) parts.push(item.length, ...item);
  return base64.encode(Uint8Array.from(parts));
}

/**
 * The BIP-322 `to_sign` transaction, built by scure rather than by us.
 *
 * scure takes a txid in its displayed order and reverses it internally, so the natural-order
 * double-SHA256 that goes into the serialized prevout is handed over reversed. Getting that
 * backwards is the bug this file exists to catch, so it is spelled out rather than shared.
 */
function toSignSighash(
  message: string,
  scriptPubKey: Uint8Array,
  sighashFor: (tx: btc.Transaction) => Uint8Array
): Uint8Array {
  const toSpend = createToSpendTransaction(bip322MessageHash(message), scriptPubKey);
  const displayTxid = Uint8Array.from(sha256(sha256(toSpend))).reverse();
  const tx = new btc.Transaction({
    version: 0,
    allowUnknownOutputs: true,
    allowUnknownInputs: true,
    disableScriptCheck: true,
    allowLegacyWitnessUtxo: true,
  });
  tx.addInput({
    txid: displayTxid,
    index: 0,
    sequence: 0,
    witnessUtxo: { script: scriptPubKey, amount: 0n },
  });
  tx.addOutput({ script: new Uint8Array([0x6a]), amount: 0n }); // OP_RETURN, value 0
  return sighashFor(tx);
}

/** BIP-143 names this scriptCode for a P2WPKH witness program: 0x1976a914{20-byte-hash}88ac. */
const witnessScriptCode = (pubkey: Uint8Array) =>
  btc.Script.encode(['DUP', 'HASH160', btc.p2wpkh(pubkey).hash, 'EQUALVERIFY', 'CHECKSIG']);

const PATHS = [
  {
    name: 'P2PKH',
    address: btc.p2pkh(PUBKEY).address!,
    scriptPubKey: btc.p2pkh(PUBKEY).script,
    sign: (message: string) => signBIP322P2PKH(message, PRIV, true),
    sighash: (message: string) =>
      toSignSighash(message, btc.p2pkh(PUBKEY).script, (tx) =>
        // `preimageLegacy` is marked private in scure's typings but is its only legacy sighash.
        // Reaching for it is the point: computing the preimage by hand here would just be our own
        // implementation again, which is the thing this file refuses to trust.
        (tx as unknown as {
          preimageLegacy(idx: number, script: Uint8Array, hashType: number): Uint8Array;
        }).preimageLegacy(0, btc.p2pkh(PUBKEY).script, btc.SigHash.ALL)
      ),
  },
  {
    name: 'P2SH-P2WPKH',
    address: btc.p2sh(btc.p2wpkh(PUBKEY)).address!,
    scriptPubKey: btc.p2sh(btc.p2wpkh(PUBKEY)).script,
    sign: (message: string) => signBIP322P2SH_P2WPKH(message, PRIV),
    sighash: (message: string) =>
      // Wrapped segwit signs the witness-v0 sighash over the P2WPKH scriptCode, not over the P2SH
      // script — the wrapper only affects spending, never the preimage.
      toSignSighash(message, btc.p2sh(btc.p2wpkh(PUBKEY)).script, (tx) =>
        tx.preimageWitnessV0(0, witnessScriptCode(PUBKEY), btc.SigHash.ALL, 0n)
      ),
  },
] as const;

describe.each(PATHS)('BIP-322 $name against @scure/btc-signer', (path) => {
  it.each(MESSAGES)('signs %j so an independent implementation accepts it', async (message) => {
    const items = parseWitness(await path.sign(message));
    expect(items).toHaveLength(2);

    const [signature, pubkey] = items as [Uint8Array, Uint8Array];
    expect(hex.encode(pubkey)).toBe(hex.encode(PUBKEY));
    expect(signature[signature.length - 1]).toBe(0x01); // SIGHASH_ALL

    const accepted = secp256k1.verify(
      derToCompact(signature.slice(0, -1)),
      path.sighash(message),
      pubkey,
      { prehash: false }
    );
    expect(accepted).toBe(true);
  });

  it.each(MESSAGES)('verifies %j when the signature was made elsewhere', async (message) => {
    // Built from scure's sighash rather than ours: this is the direction segwit failed, where
    // every other wallet's signature was rejected.
    const compact = secp256k1.sign(path.sighash(message), PRIV, { prehash: false });
    const witness = encodeWitness([
      Uint8Array.from([...compactToDer(compact), 0x01]),
      PUBKEY,
    ]);

    expect(await verifyBIP322Signature(message, witness, path.address)).toBe(true);
  });

  it('rejects an independently made signature against a different message', async () => {
    const compact = secp256k1.sign(path.sighash('Hello World'), PRIV, { prehash: false });
    const witness = encodeWitness([
      Uint8Array.from([...compactToDer(compact), 0x01]),
      PUBKEY,
    ]);

    expect(await verifyBIP322Signature('Goodbye', witness, path.address)).toBe(false);
  });
});
