/**
 * Complete BIP-322 Implementation
 * Built from scratch using noble/scure libraries
 * No dependency on btc-signer's transaction handling
 */

import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as secp256k1 from '@noble/secp256k1';
// Required initialization for @noble/secp256k1 v3
import { hashes } from '@noble/secp256k1';
import { base64, bech32m, hex } from '@scure/base';
import * as btc from '@scure/btc-signer';

// Ensure secp256k1 hashes are properly initialized
if (!hashes.sha256) {
  hashes.sha256 = (msg) => new Uint8Array(sha256(msg));
}
if (!hashes.hmacSha256) {
  hashes.hmacSha256 = (key, msg) => new Uint8Array(hmac(sha256, key, msg));
  hashes.hmacSha256Async = async (key, msg) => new Uint8Array(hmac(sha256, key, msg));
  hashes.sha256Async = async (msg) => new Uint8Array(sha256(msg));
}

// BIP-322 tagged hash prefix
const BIP322_TAG = 'BIP0322-signed-message';

/**
 * `@noble/secp256k1` v3 hashes the message before signing **by default** — `prehash: opts.prehash
 * ?? true`. A Bitcoin sighash is already a digest, so signing it under that default signs
 * `sha256(sighash)` instead, and verifying under the same default checks the same wrong value.
 *
 * That is self-consistent, which is exactly why it went unnoticed: this wallet's ECDSA signatures
 * round-tripped against its own verifier while being unreadable by every other wallet, and every
 * other wallet's signatures were rejected. It has to be passed at all four call sites; there is no
 * module-level way to change the default. `messageVerifier/secp-recovery.ts` already passes it.
 */
const SIGHASH_IS_ALREADY_A_DIGEST = { prehash: false } as const;

/**
 * Safely extract script from payment object with explicit error
 */
function requireScript(payment: { script?: Uint8Array }, type: string): Uint8Array {
  if (!payment.script) {
    throw new Error(`Failed to derive ${type} script from public key`);
  }
  return payment.script;
}

/**
 * Safely extract address from payment object with explicit error
 */
function requireAddress(payment: { address?: string }, type: string): string {
  if (!payment.address) {
    throw new Error(`Failed to derive ${type} address from public key`);
  }
  return payment.address;
}

/**
 * Helper functions for serialization
 */
function writeUint32LE(n: number): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[0] = n & 0xff;
  bytes[1] = (n >> 8) & 0xff;
  bytes[2] = (n >> 16) & 0xff;
  bytes[3] = (n >> 24) & 0xff;
  return bytes;
}

function writeUint64LE(n: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number((n >> BigInt(i * 8)) & 0xffn);
  }
  return bytes;
}

function writeCompactSize(n: number): Uint8Array {
  if (n < 0xfd) {
    return new Uint8Array([n]);
  } else if (n <= 0xffff) {
    const bytes = new Uint8Array(3);
    bytes[0] = 0xfd;
    bytes[1] = n & 0xff;
    bytes[2] = (n >> 8) & 0xff;
    return bytes;
  } else if (n <= 0xffffffff) {
    const bytes = new Uint8Array(5);
    bytes[0] = 0xfe;
    bytes[1] = n & 0xff;
    bytes[2] = (n >> 8) & 0xff;
    bytes[3] = (n >> 16) & 0xff;
    bytes[4] = (n >> 24) & 0xff;
    return bytes;
  } else {
    throw new Error('Value too large for CompactSize');
  }
}

/**
 * Create a BIP-322 tagged hash of a message
 */
export function bip322MessageHash(message: string): Uint8Array {
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(message);
  const tagHash = sha256(encoder.encode(BIP322_TAG));

  const preimage = new Uint8Array(tagHash.length * 2 + messageBytes.length);
  preimage.set(tagHash, 0);
  preimage.set(tagHash, tagHash.length);
  preimage.set(messageBytes, tagHash.length * 2);

  return sha256(preimage);
}

/**
 * Manually serialize the to_spend transaction
 */
function serializeToSpend(messageHash: Uint8Array, scriptPubKey: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];

  // Version (4 bytes) - 0
  parts.push(writeUint32LE(0));

  // Input count (CompactSize) - 1
  parts.push(writeCompactSize(1));

  // Input 0:
  // - Previous output hash (32 bytes) - all zeros
  parts.push(new Uint8Array(32));

  // - Previous output index (4 bytes) - 0xFFFFFFFF
  parts.push(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]));

  // - Script length and script (OP_0 PUSH32 messageHash)
  const scriptSig = new Uint8Array(1 + 1 + 32);
  scriptSig[0] = 0x00; // OP_0
  scriptSig[1] = 0x20; // PUSH 32 bytes
  scriptSig.set(messageHash, 2);

  parts.push(writeCompactSize(scriptSig.length));
  parts.push(scriptSig);

  // - Sequence (4 bytes) - 0
  parts.push(writeUint32LE(0));

  // Output count (CompactSize) - 1
  parts.push(writeCompactSize(1));

  // Output 0:
  // - Amount (8 bytes) - 0
  parts.push(writeUint64LE(BigInt(0)));

  // - Script length and script
  parts.push(writeCompactSize(scriptPubKey.length));
  parts.push(scriptPubKey);

  // Locktime (4 bytes) - 0
  parts.push(writeUint32LE(0));

  // Concatenate all parts
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** BIP-340 tagged hash: SHA256(SHA256(tag) || SHA256(tag) || msg). */
function taggedHash(tag: string, ...parts: Uint8Array[]): Uint8Array {
  const tagHash = sha256(new TextEncoder().encode(tag));
  return sha256(concatBytes(tagHash, tagHash, ...parts));
}

/**
 * The 32-byte output key of a v1 (taproot) address, or null if it is not one.
 *
 * Read from the address rather than supplied alongside the signature: the key *is* the thing being
 * proven, so taking it from the caller would let any signature verify against its own key.
 */
export function taprootOutputKey(address: string): Uint8Array | null {
  try {
    const decoded = bech32m.decode(address as `${string}1${string}`, 90);
    if (decoded.words[0] !== 1) return null;
    const program = bech32m.fromWords(decoded.words.slice(1));
    return program.length === 32 ? Uint8Array.from(program) : null;
  } catch {
    return null;
  }
}

/**
 * The taproot key-path signing key, and the output key it produces.
 *
 * A taproot output commits to `Q = P + H_TapTweak(P)*G`, not to the internal key `P`, so a key-path
 * spend has to be signed with the tweaked secret. The previous implementation signed with the
 * untweaked key, which is why its signatures verified only against its own verifier.
 *
 * `H_TapTweak(P)` takes no merkle root because these outputs commit to no script tree.
 */
function taprootSigningKey(privateKey: Uint8Array): {
  tweakedPrivateKey: Uint8Array;
  outputKey: Uint8Array;
} {
  const { n } = secp256k1.Point.CURVE();
  const { bytesToNumberBE, numberToBytesBE } = secp256k1.etc;

  const secret = bytesToNumberBE(privateKey);
  if (secret <= 0n || secret >= n) throw new Error('Invalid private key for Taproot');

  const internalPoint = secp256k1.Point.BASE.multiply(secret).toAffine();
  // BIP-340 keys are x-only, so the secret is negated when it would give an odd Y.
  const evenSecret = internalPoint.y % 2n === 0n ? secret : n - secret;
  const internalKey = numberToBytesBE(internalPoint.x);

  const tweak = bytesToNumberBE(taggedHash('TapTweak', internalKey));
  if (tweak >= n) throw new Error('Invalid TapTweak');

  const tweakedSecret = (evenSecret + tweak) % n;
  if (tweakedSecret === 0n) throw new Error('Invalid tweaked key');

  const tweakedPrivateKey = numberToBytesBE(tweakedSecret);
  const outputPoint = secp256k1.Point.BASE.multiply(tweakedSecret).toAffine();

  return { tweakedPrivateKey, outputKey: numberToBytesBE(outputPoint.x) };
}

/**
 * BIP-341 signature hash for a key-path spend of the BIP-322 `to_sign` transaction.
 *
 * `to_sign` is fully determined by the spec — one input spending `to_spend:0` with nSequence 0, one
 * OP_RETURN output of value 0, version 0, locktime 0 — so every field below is a constant except
 * the outpoint and the scriptPubKey being spent. That is why this does not build a transaction.
 *
 * The prevout hash is the double-SHA256 of `to_spend` in its natural byte order; the displayed txid
 * is that value reversed. Taking `to_spend`'s bytes and hashing them here, rather than accepting a
 * "txid" whose orientation the caller has to get right, is what kept this path correct while the
 * segwit and legacy paths were reversing it — those now take the bytes for the same reason.
 *
 * `hashType` is part of the preimage, which is why SIGHASH_DEFAULT (0x00) and SIGHASH_ALL (0x01)
 * are not interchangeable even though they commit to the same fields.
 */
export function taprootKeyPathSighash(
  toSpendBytes: Uint8Array,
  spentScriptPubKey: Uint8Array,
  hashType: number
): Uint8Array {
  const prevoutHash = sha256(sha256(toSpendBytes));
  const opReturn = new Uint8Array([0x6a]);

  const shaPrevouts = sha256(concatBytes(prevoutHash, writeUint32LE(0)));
  const shaAmounts = sha256(writeUint64LE(0n));
  const shaScriptPubKeys = sha256(
    concatBytes(writeCompactSize(spentScriptPubKey.length), spentScriptPubKey)
  );
  const shaSequences = sha256(writeUint32LE(0));
  const shaOutputs = sha256(
    concatBytes(writeUint64LE(0n), writeCompactSize(opReturn.length), opReturn)
  );

  return taggedHash(
    'TapSighash',
    new Uint8Array([0x00]),      // epoch
    new Uint8Array([hashType]),
    writeUint32LE(0),            // nVersion
    writeUint32LE(0),            // nLockTime
    shaPrevouts,
    shaAmounts,
    shaScriptPubKeys,
    shaSequences,
    shaOutputs,                  // hashType & 3 is ALL or DEFAULT, so the outputs are committed
    new Uint8Array([0x00]),      // spend_type: key path, no annex
    writeUint32LE(0)             // input_index
  );
}

/**
 * Verify a standard BIP-322 taproot signature: a base64 witness stack holding one Schnorr signature.
 *
 * This is the interoperable form — what Sparrow, Ledger and bip322-js produce. It is checked in
 * This replaced a proprietary `tr:` format that verified against the tagged message hash using
 * the untweaked key, and so interoperated with nothing.
 */
function verifyBIP322TaprootWitness(
  message: string,
  witnessData: Uint8Array,
  address: string
): boolean {
  const outputKey = taprootOutputKey(address);
  if (!outputKey) return false;

  const stack = parseWitnessStack(witnessData);
  // Key-path spend only: one signature, no script and no control block. A script-path proof would
  // need the leaf executed to decide anything, which this does not do — so it is refused rather
  // than guessed at.
  if (!stack || stack.length !== 1) return false;

  const item = stack[0]!;
  let hashType: number;
  let signature: Uint8Array;
  if (item.length === 64) {
    hashType = 0x00; // SIGHASH_DEFAULT, implied by the absence of a byte
    signature = item;
  } else if (item.length === 65) {
    hashType = item[64]!;
    // BIP-341: SIGHASH_DEFAULT must be encoded as 64 bytes. A 65-byte signature ending in 0x00 is
    // a second encoding of the same thing, and is invalid.
    if (hashType === 0x00) return false;
    signature = item.slice(0, 64);
  } else {
    return false;
  }

  // Only the sighash types that commit to all outputs are accepted. NONE and SINGLE would let the
  // outputs of to_sign differ from the ones committed to here, and BIP-322 fixes those outputs.
  if (hashType !== 0x00 && hashType !== 0x01) return false;

  const scriptPubKey = concatBytes(new Uint8Array([0x51, 0x20]), outputKey); // OP_1 PUSH32 <key>
  const toSpendBytes = serializeToSpend(bip322MessageHash(message), scriptPubKey);
  const sighash = taprootKeyPathSighash(toSpendBytes, scriptPubKey, hashType);

  return secp256k1.schnorr.verify(signature, sighash, outputKey);
}

/**
 * Manually serialize the to_sign transaction (unsigned).
 *
 * Takes the `to_spend` bytes rather than a txid string, and hashes them here. The previous shape
 * took a hex "txid" and reversed it, which is what made the whole segwit path non-interoperable:
 * `vin[0].prevout.hash` in a serialized transaction is the double-SHA256 in its **natural** byte
 * order, and every caller was already passing exactly that. Reversing it produced the *displayed*
 * txid and put the wrong outpoint in `to_sign`.
 *
 * Checked against the spec's own `to_sign_tx_hash` (`basic-test-vectors.json`), which commits to
 * this field and to nothing about the signature, so it pins the orientation on its own:
 * `1e9654e951a5ba44c8604c4de6c67fd78a27e81dcadcfe1edf638ba3aaebaed6` for the empty message at
 * `bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l`.
 *
 * `to_sign` is unsigned here, so `vin[0].scriptSig` is empty and the spent scriptPubKey does not
 * appear anywhere in these bytes — which is why it is no longer a parameter.
 */
function serializeToSignUnsigned(toSpendBytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];

  // Version (4 bytes) - 0
  parts.push(writeUint32LE(0));

  // Input count (CompactSize) - 1
  parts.push(writeCompactSize(1));

  // Input 0:
  // - Previous output hash (32 bytes) - to_spend's double-SHA256, natural order
  parts.push(sha256(sha256(toSpendBytes)));

  // - Previous output index (4 bytes) - 0
  parts.push(writeUint32LE(0));

  // - Script length - 0 (unsigned)
  parts.push(writeCompactSize(0));

  // - Sequence (4 bytes) - 0
  parts.push(writeUint32LE(0));

  // Output count (CompactSize) - 1
  parts.push(writeCompactSize(1));

  // Output 0 (OP_RETURN):
  // - Amount (8 bytes) - 0
  parts.push(writeUint64LE(BigInt(0)));

  // - Script length and script (OP_RETURN)
  const opReturn = new Uint8Array([0x6a]); // OP_RETURN
  parts.push(writeCompactSize(opReturn.length));
  parts.push(opReturn);

  // Locktime (4 bytes) - 0
  parts.push(writeUint32LE(0));

  // Concatenate all parts
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

/**
 * Calculate legacy sighash for P2PKH.
 *
 * Builds the signing transaction dynamically with scriptPubKey inserted,
 * rather than splicing into serialized bytes at hardcoded positions.
 * This matches the exchange server's approach in bip322-verify.ts.
 *
 * @param toSignBytes - The unsigned to_sign transaction bytes. Used to extract
 *   the prevout hash (bytes 5-36) for reconstructing the signing transaction.
 *   Reading it back out of the serialized form is what keeps this in step with
 *   `serializeToSignUnsigned`: the two cannot disagree about byte order.
 * @param _inputIndex - Unused (always input 0 for BIP-322).
 * @param scriptPubKey - The locking script to insert for signing.
 * @param hashType - SIGHASH flag (default ALL = 0x01).
 */
function calculateLegacySighashManual(
  toSignBytes: Uint8Array,
  _inputIndex: number,
  scriptPubKey: Uint8Array,
  hashType: number = 0x01
): Uint8Array {
  // Extract the prevout hash from the unsigned to_sign transaction.
  // Layout: version(4) + input_count(1) + prevout hash(32) starts at byte 5.
  const prevoutHash = toSignBytes.slice(5, 37);

  const opReturn = new Uint8Array([0x6a]); // OP_RETURN

  // Build the transaction with scriptPubKey in the scriptSig position,
  // exactly as the server's calculateLegacySighash does.
  const parts: Uint8Array[] = [
    writeUint32LE(0),                        // nVersion
    writeCompactSize(1),                     // input count
    prevoutHash,                             // prevout hash, natural order, as in to_sign
    writeUint32LE(0),                        // prevout index
    writeCompactSize(scriptPubKey.length),   // scriptSig length = scriptPubKey length
    scriptPubKey,                            // scriptSig = scriptPubKey (for signing)
    writeUint32LE(0),                        // nSequence
    writeCompactSize(1),                     // output count
    writeUint64LE(0n),                       // output amount (0)
    writeCompactSize(opReturn.length),       // output script length
    opReturn,                                // output script (OP_RETURN)
    writeUint32LE(0),                        // nLockTime
    writeUint32LE(hashType),                 // SIGHASH type
  ];

  // Concatenate and double-SHA256
  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const preimage = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    preimage.set(part, offset);
    offset += part.length;
  }

  return sha256(sha256(preimage));
}

/**
 * DER encode a signature
 */
function encodeDER(r: Uint8Array, s: Uint8Array): Uint8Array {
  // Remove leading zeros
  while (r.length > 1 && r[0] === 0 && (r[1]! & 0x80) === 0) {
    r = r.slice(1);
  }
  while (s.length > 1 && s[0] === 0 && (s[1]! & 0x80) === 0) {
    s = s.slice(1);
  }

  // Add padding if high bit is set
  if (r[0]! & 0x80) {
    const padded = new Uint8Array(r.length + 1);
    padded[0] = 0;
    padded.set(r, 1);
    r = padded;
  }
  if (s[0]! & 0x80) {
    const padded = new Uint8Array(s.length + 1);
    padded[0] = 0;
    padded.set(s, 1);
    s = padded;
  }

  // Construct DER signature
  const signature = new Uint8Array(6 + r.length + s.length);
  signature[0] = 0x30; // SEQUENCE
  signature[1] = 4 + r.length + s.length;
  signature[2] = 0x02; // INTEGER
  signature[3] = r.length;
  signature.set(r, 4);
  signature[4 + r.length] = 0x02; // INTEGER
  signature[5 + r.length] = s.length;
  signature.set(s, 6 + r.length);

  return signature;
}

/**
 * Encode witness stack to consensus format
 */
function encodeWitnessStack(stack: Uint8Array[]): Uint8Array {
  let totalSize = 1; // stack item count
  for (const item of stack) {
    // For witness stack, we just use a single byte for length if < 253
    totalSize += 1 + item.length;
  }

  const result = new Uint8Array(totalSize);
  let offset = 0;

  result[offset++] = stack.length;

  for (const item of stack) {
    // For witness stack items, we use simple length encoding
    result[offset++] = item.length;
    result.set(item, offset);
    offset += item.length;
  }

  return result;
}

/**
 * Sign BIP-322 for P2PKH addresses - Complete implementation
 */
export async function signBIP322P2PKH(
  message: string,
  privateKey: Uint8Array,
  compressed: boolean = true
): Promise<string> {
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }
  const messageHash = bip322MessageHash(message);
  const publicKey = secp256k1.getPublicKey(privateKey, compressed);
  const p2pkh = btc.p2pkh(publicKey);
  const scriptPubKey = requireScript(p2pkh, 'P2PKH');

  // Manually create and serialize to_spend transaction
  const toSpendBytes = serializeToSpend(messageHash, scriptPubKey);

  // Create unsigned to_sign transaction
  const toSignUnsigned = serializeToSignUnsigned(toSpendBytes);

  // Calculate sighash
  const sighash = calculateLegacySighashManual(toSignUnsigned, 0, scriptPubKey, 0x01);

  const signature = secp256k1.sign(sighash, privateKey, SIGHASH_IS_ALREADY_A_DIGEST);

  // Create DER-encoded signature with SIGHASH_ALL
  const r = signature.slice(0, 32);
  const s = signature.slice(32, 64);
  const derSig = encodeDER(r, s);
  const sigWithHashType = new Uint8Array(derSig.length + 1);
  sigWithHashType.set(derSig);
  sigWithHashType[derSig.length] = 0x01; // SIGHASH_ALL

  // Create witness stack
  const witnessStack = [sigWithHashType, publicKey];
  const witnessData = encodeWitnessStack(witnessStack);

  return base64.encode(witnessData);
}

/**
 * Calculate BIP-143 witness v0 sighash for the BIP-322 `to_sign` transaction.
 *
 * Field order is BIP-143's: nVersion, hashPrevouts, hashSequence, outpoint, scriptCode, amount,
 * nSequence, hashOutputs, nLockTime, sighash type. Every field except the outpoint and scriptCode
 * is a constant here, because BIP-322 fixes `to_sign` entirely.
 *
 * Like `serializeToSignUnsigned`, this takes `to_spend`'s bytes and hashes them, rather than a
 * "txid" string it would have to guess the orientation of.
 */
function calculateWitnessV0SighashManual(
  toSpendBytes: Uint8Array,
  scriptCode: Uint8Array,
  amount: bigint,
  hashType: number = 0x01
): Uint8Array {
  // Simplified BIP-143 for our specific case (single input, single output)
  const parts: Uint8Array[] = [];

  // 1. nVersion (4 bytes) - 0
  parts.push(writeUint32LE(0));

  // 2. hashPrevouts (32 bytes) - hash of all prevouts
  const prevout = new Uint8Array(36);
  prevout.set(sha256(sha256(toSpendBytes)), 0);
  prevout.set(writeUint32LE(0), 32);
  parts.push(sha256(sha256(prevout)));

  // 3. hashSequence (32 bytes) - hash of all sequences
  parts.push(sha256(sha256(writeUint32LE(0))));

  // 4. outpoint (36 bytes)
  parts.push(prevout);

  // 5. scriptCode with length
  parts.push(writeCompactSize(scriptCode.length));
  parts.push(scriptCode);

  // 6. amount (8 bytes)
  parts.push(writeUint64LE(amount));

  // 7. nSequence (4 bytes)
  parts.push(writeUint32LE(0));

  // 8. hashOutputs (32 bytes) - hash of all outputs
  const opReturn = new Uint8Array([0x6a]);
  const output = new Uint8Array(8 + 1 + opReturn.length);
  output.set(writeUint64LE(BigInt(0)), 0);
  output[8] = opReturn.length;
  output.set(opReturn, 9);
  parts.push(sha256(sha256(output)));

  // 9. nLockTime (4 bytes)
  parts.push(writeUint32LE(0));

  // 10. sighash type (4 bytes)
  parts.push(writeUint32LE(hashType));

  // Concatenate all parts
  const preimage = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    preimage.set(part, offset);
    offset += part.length;
  }

  // Double SHA256
  return sha256(sha256(preimage));
}

/**
 * Sign BIP-322 for P2WPKH addresses
 */
export async function signBIP322P2WPKH(
  message: string,
  privateKey: Uint8Array
): Promise<string> {
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }
  const messageHash = bip322MessageHash(message);
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  const p2wpkh = btc.p2wpkh(publicKey);
  const scriptPubKey = requireScript(p2wpkh, 'P2WPKH');

  // Create to_spend transaction
  const toSpendBytes = serializeToSpend(messageHash, scriptPubKey);

  // Calculate witness v0 sighash - need to use P2PKH-style scriptCode for BIP-143
  const pubkeyHash = p2wpkh.hash;
  const scriptCode = btc.Script.encode(['DUP', 'HASH160', pubkeyHash, 'EQUALVERIFY', 'CHECKSIG']);

  const sighash = calculateWitnessV0SighashManual(toSpendBytes, scriptCode, BigInt(0), 0x01);

  const signature = secp256k1.sign(sighash, privateKey, SIGHASH_IS_ALREADY_A_DIGEST);

  // Create DER-encoded signature with SIGHASH_ALL
  const r = signature.slice(0, 32);
  const s = signature.slice(32, 64);
  const derSig = encodeDER(r, s);
  const sigWithHashType = new Uint8Array(derSig.length + 1);
  sigWithHashType.set(derSig);
  sigWithHashType[derSig.length] = 0x01;

  // Create witness stack
  const witnessStack = [sigWithHashType, publicKey];
  const witnessData = encodeWitnessStack(witnessStack);

  return base64.encode(witnessData);
}

/**
 * Sign BIP-322 for P2SH-P2WPKH addresses
 */
export async function signBIP322P2SH_P2WPKH(
  message: string,
  privateKey: Uint8Array
): Promise<string> {
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }
  const messageHash = bip322MessageHash(message);
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  const p2wpkh = btc.p2wpkh(publicKey);
  const p2sh = btc.p2sh(p2wpkh);
  const scriptPubKey = requireScript(p2sh, 'P2SH-P2WPKH');

  // Create to_spend transaction
  const toSpendBytes = serializeToSpend(messageHash, scriptPubKey);

  // For P2SH-P2WPKH, sign with the P2PKH-style scriptCode (not the P2WPKH script directly)
  const pubkeyHash = btc.p2wpkh(publicKey).hash;
  const scriptCode = btc.Script.encode(['DUP', 'HASH160', pubkeyHash, 'EQUALVERIFY', 'CHECKSIG']);
  const sighash = calculateWitnessV0SighashManual(toSpendBytes, scriptCode, BigInt(0), 0x01);

  const signature = secp256k1.sign(sighash, privateKey, SIGHASH_IS_ALREADY_A_DIGEST);

  // Create DER-encoded signature with SIGHASH_ALL
  const r = signature.slice(0, 32);
  const s = signature.slice(32, 64);
  const derSig = encodeDER(r, s);
  const sigWithHashType = new Uint8Array(derSig.length + 1);
  sigWithHashType.set(derSig);
  sigWithHashType[derSig.length] = 0x01;

  // Create witness stack
  const witnessStack = [sigWithHashType, publicKey];
  const witnessData = encodeWitnessStack(witnessStack);

  return base64.encode(witnessData);
}

/**
 * Sign BIP-322 for Taproot addresses
 */
export async function signBIP322P2TR(
  message: string,
  privateKey: Uint8Array
): Promise<string> {
  if (privateKey.length !== 32) {
    throw new Error('Invalid private key length for Taproot');
  }

  const { tweakedPrivateKey, outputKey } = taprootSigningKey(privateKey);

  const scriptPubKey = concatBytes(new Uint8Array([0x51, 0x20]), outputKey); // OP_1 PUSH32 <key>
  const toSpendBytes = serializeToSpend(bip322MessageHash(message), scriptPubKey);

  // SIGHASH_DEFAULT, which BIP-341 requires be encoded as a bare 64-byte signature.
  const signature = secp256k1.schnorr.sign(
    taprootKeyPathSighash(toSpendBytes, scriptPubKey, 0x00),
    tweakedPrivateKey
  );

  // A simple BIP-322 signature is the witness stack, consensus encoded and base64'd: one item.
  return base64.encode(concatBytes(new Uint8Array([0x01, 0x40]), signature));
}

// Export other required functions
export { bip322MessageHash as getMessageHash };
export function getAddressType(address: string): 'P2PKH' | 'P2SH' | 'P2WPKH' | 'P2WSH' | 'P2TR' | 'unknown' {
  if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n')) {
    return 'P2PKH';
  } else if (address.startsWith('3') || address.startsWith('2')) {
    return 'P2SH';
  } else if (address.startsWith('bc1q') || address.startsWith('tb1q')) {
    const decoded = address.substring(4);
    return decoded.length === 38 ? 'P2WPKH' : 'P2WSH';
  } else if (address.startsWith('bc1p') || address.startsWith('tb1p')) {
    return 'P2TR';
  }
  return 'unknown';
}

// Parse witness stack from encoded bytes (for verification)
function parseWitnessStack(witnessData: Uint8Array): Uint8Array[] | null {
  try {
    if (witnessData.length < 1) return null;

    const stackItemCount = witnessData[0]!;
    if (stackItemCount === 0) return [];

    const items: Uint8Array[] = [];
    let offset = 1;

    for (let i = 0; i < stackItemCount && offset < witnessData.length; i++) {
      // For witness stack, we use simple byte length
      const itemLength = witnessData[offset]!;
      offset += 1;

      if (offset + itemLength > witnessData.length) return null;

      items.push(witnessData.slice(offset, offset + itemLength));
      offset += itemLength;
    }

    return items;
  } catch {
    return null;
  }
}

// Verify a BIP-322 signature
export async function verifyBIP322Signature(
  message: string,
  signature: string,
  address: string
): Promise<boolean> {
  try {
    const addressType = getAddressType(address);
    const messageHash = bip322MessageHash(message);

    // Taproot: a standard BIP-322 simple signature, i.e. a base64 witness stack.
    //
    // A previous `tr:<sig>:<pubkey>` format was accepted here. It verified a Schnorr signature over
    // the tagged message hash using the *untweaked* key, which is not what BIP-322 signs, so it
    // interoperated with nothing and no signature from any other wallet verified. It has been
    // removed rather than kept alongside: leaving it would go on accepting proofs that are not
    // BIP-322 signatures.
    if (addressType === 'P2TR') {
      let witness: Uint8Array;
      try {
        witness = base64.decode(signature);
      } catch {
        return false;
      }
      return verifyBIP322TaprootWitness(message, witness, address);
    }

    // Handle other address types with witness data
    let witnessData: Uint8Array;
    try {
      witnessData = base64.decode(signature);
    } catch {
      return false;
    }

    // For BIP-322 signatures we created, we have a specific format
    // Try parsing as witness stack first
    const witnessStack = parseWitnessStack(witnessData);
    if (!witnessStack || witnessStack.length < 2) {
      return false;
    }

    // Extract signature and public key
    const sigDER = witnessStack[0]!;
    const pubkey = witnessStack[1]!;

    // Verify the public key matches the address
    let derivedAddress: string;
    let scriptPubKey: Uint8Array;

    if (addressType === 'P2PKH') {
      const p2pkh = btc.p2pkh(pubkey);
      derivedAddress = requireAddress(p2pkh, 'P2PKH');
      scriptPubKey = requireScript(p2pkh, 'P2PKH');
    } else if (addressType === 'P2WPKH') {
      const p2wpkh = btc.p2wpkh(pubkey);
      derivedAddress = requireAddress(p2wpkh, 'P2WPKH');
      scriptPubKey = requireScript(p2wpkh, 'P2WPKH');
    } else if (addressType === 'P2SH') {
      // Assume P2SH-P2WPKH
      const p2wpkh = btc.p2wpkh(pubkey);
      const p2sh = btc.p2sh(p2wpkh);
      derivedAddress = requireAddress(p2sh, 'P2SH-P2WPKH');
      scriptPubKey = requireScript(p2sh, 'P2SH-P2WPKH');
    } else {
      return false;
    }

    // Check address matches first
    if (derivedAddress.toLowerCase() !== address.toLowerCase()) {
      console.error('Address mismatch:', {
        derived: derivedAddress,
        expected: address,
        pubkey: hex.encode(pubkey)
      });
      return false;
    }

    // A witness signature item is `DER || hashType`, so the last byte is the hash type and is not
    // part of the DER. It used to be dropped only when it happened to equal 0x01, which read a
    // conditional into a field that is always present. Only SIGHASH_ALL is accepted: BIP-322 fixes
    // `to_sign`'s single output, and NONE/SINGLE/ANYONECANPAY would stop committing to it.
    if (sigDER.length < 2) return false;
    const hashType = sigDER[sigDER.length - 1]!;
    if (hashType !== 0x01) return false;
    const sigBytes = sigDER.slice(0, -1);

    // Create the sighash based on address type
    let sighash: Uint8Array;

    const toSpend = serializeToSpend(messageHash, scriptPubKey);

    if (addressType === 'P2PKH') {
      // Legacy sighash calculation
      const toSign = serializeToSignUnsigned(toSpend);
      sighash = calculateLegacySighashManual(toSign, 0, scriptPubKey, hashType);
    } else {
      // Witness v0 sighash calculation. Both P2WPKH and P2SH-P2WPKH commit to the P2PKH-style
      // scriptCode BIP-143 defines for a P2WPKH witness program: 0x1976a914{20-byte-hash}88ac.
      const pubkeyHash = btc.p2wpkh(pubkey).hash;
      const scriptCode = btc.Script.encode(['DUP', 'HASH160', pubkeyHash, 'EQUALVERIFY', 'CHECKSIG']);
      sighash = calculateWitnessV0SighashManual(toSpend, scriptCode, 0n, hashType);
    }

    // Implement proper cryptographic verification
    try {
      // Parse the DER signature and convert to 64-byte format for verification
      const signature64 = parseDERSignature(sigBytes);
      if (!signature64) {
        console.error('Failed to parse DER signature for verification');
        return false;
      }

      // Verify the signature using the calculated sighash
      return secp256k1.verify(signature64, sighash, pubkey, SIGHASH_IS_ALREADY_A_DIGEST);
    } catch (error) {
      console.error('BIP-322 cryptographic verification error:', error);
      return false;
    }
  } catch (error) {
    console.error('BIP-322 verification failed:', error);
    return false;
  }
}

/**
 * Parse DER-encoded signature
 */
function parseDERSignature(der: Uint8Array): Uint8Array | null {
  try {
    // Basic DER structure validation
    if (der[0] !== 0x30) return null;

    let offset = 2;

    // Parse r
    if (der[offset] !== 0x02) return null;
    const rLen = der[offset + 1];
    if (rLen === undefined || offset + 2 + rLen > der.length) return null;
    const r = der.slice(offset + 2, offset + 2 + rLen);
    offset += 2 + rLen;

    // Parse s
    if (der[offset] !== 0x02) return null;
    const sLen = der[offset + 1];
    if (sLen === undefined || offset + 2 + sLen > der.length) return null;
    const s = der.slice(offset + 2, offset + 2 + sLen);

    // Remove padding and ensure 32 bytes
    const rBytes = r[0] === 0 ? r.slice(1) : r;
    const sBytes = s[0] === 0 ? s.slice(1) : s;

    // Pad to 32 bytes if needed
    const signature = new Uint8Array(64);
    signature.set(rBytes, 32 - rBytes.length);
    signature.set(sBytes, 64 - sBytes.length);

    return signature;
  } catch {
    return null;
  }
}

// Compatibility exports
export { serializeToSignUnsigned as createToSignTransaction, serializeToSpend as createToSpendTransaction };


// Simple verification (just delegates to main)
export async function verifySimpleBIP322(
  message: string,
  signature: string,
  address: string
): Promise<boolean> {
  return verifyBIP322Signature(message, signature, address);
}


// Check if address supports BIP-322
export function supportsBIP322(address: string): boolean {
  if (!address) return false;

  try {
    // Only support mainnet addresses
    const decoded = btc.Address(btc.NETWORK).decode(address);
    if (!decoded) return false;

    // Check if it's one of our supported types
    if (decoded.type === 'pkh' || // P2PKH (legacy)
        decoded.type === 'sh' ||  // P2SH
        decoded.type === 'wpkh' || // P2WPKH (native segwit)
        decoded.type === 'tr') {   // P2TR (taproot)
      return true;
    }

    return false;
  } catch {
    // Invalid address format or not mainnet
    return false;
  }
}
