/**
 * `funded_policy_offer_v1` — the wallet's own re-derivation of the protocol's commitments.
 *
 * The marketplace publishes a reference implementation of these equations, but a wallet that
 * imported it would be proving the site's claims with the site's code. Everything here is a small,
 * independent port, pinned byte-for-byte to the reference by the cross-check vectors in
 * `__tests__/policyOffer.test.ts`:
 *
 *   leaf  = OP_0 OP_IF <tag> <price u64LE ‖ expires_at u64LE ‖ kind u8> <delivery> <policy hash>
 *           OP_ENDIF <K_m> OP_CHECKSIG
 *   Q     = K_b + TaggedHash("TapTweak", K_b ‖ TaggedHash("TapLeaf", 0xc0 ‖ len ‖ leaf))·G
 *   offer = OP_1 <Q>
 *   detach (child output 0) = OP_RETURN ARC4(key = parent txid, "CNTRPRTY" ‖ 0x66 ‖ utf8(D))
 *
 * Pure: no I/O, no clock. Anything that fails to parse throws; callers turn that into a blocker.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, hexToBytes } from '@noble/hashes/utils.js';
import { p2tr, p2wpkh } from '@scure/btc-signer';
import { tagSchnorr, taprootTweakPubkey } from '@scure/btc-signer/utils.js';
import { decodeAddressFromScript } from '@/core/bitcoin/address';
import { DUST_LIMIT_SATS, MAX_OP_RETURN_DATA_BYTES, RBF_SEQUENCE } from '@/core/bitcoin/constants';
import type { DecodedOutput } from '@/core/bitcoin/psbt';
import { parseConsensusTransaction } from '@/core/bitcoin/rawTransaction';
import { compactSizeLength } from '@/core/bitcoin/signedVsize';
import { arc4, bytesEqual } from '@/core/counterparty/unpack/binary';
import { COUNTERPARTY_PREFIX } from '@/core/counterparty/unpack/messageTypes';
import { toSafeInteger } from '@/core/numeric';

export const POLICY_OFFER_PROTOCOL_VERSION = 'funded_policy_offer_v1' as const;
export const POLICY_OFFER_TX_VERSION = 3;
export const POLICY_OFFER_LOCKTIME = 0;
export const POLICY_OFFER_SEQUENCE = RBF_SEQUENCE;
export const POLICY_OFFER_LEAF_VERSION = 0xc0;
export const POLICY_OFFER_TAG = 'digirare/policy-offer/v1';
const POLICY_OFFER_TAG_BYTES = new TextEncoder().encode(POLICY_OFFER_TAG);
const POLICY_CANONICAL_VERSION = 1;

export const MAX_POLICY_PARENT_FUNDING_INPUTS = 8;
export const MAX_POLICY_PARENT_VSIZE = 1_000;
export const MAX_POLICY_ALTERNATIVES = 100;
export const POLICY_ANCHOR_SATS = 330;
export const MAX_POLICY_PARENT_FEE_SATS = 329;
export const POLICY_MIN_EXPIRY_SECONDS = 600;
export const POLICY_MAX_EXPIRY_SECONDS = 90 * 86_400;
export const MAX_POLICY_DETACH_ADDRESS_BYTES = 71;
/** Change below its script's dust is folded into the parent fee instead. */
export const POLICY_CHANGE_DUST_SATS = { p2tr: 330, p2wpkh: 294 } as const;

/** The published taker fee: 2.5%, at least 1,000 sats, paid by the accepting seller. */
export const PLATFORM_FEE_BPS = 250;
export const PLATFORM_FEE_MIN_SATS = 1_000;
export const MIN_POLICY_PRICE_SATS = 5_000;
/** Seller proceeds must exceed this, the same guard as every other marketplace settlement. */
export const POLICY_SELLER_DUST_SATS = DUST_LIMIT_SATS;

/** Integer arithmetic, rounded up, exactly as the marketplace computes the fee output. */
export function platformFeeSats(priceSats: number): number {
  if (!Number.isSafeInteger(priceSats) || priceSats <= 0) throw new Error('price must be a positive safe integer');
  const proportional = toSafeInteger((BigInt(priceSats) * BigInt(PLATFORM_FEE_BPS) + 9_999n) / 10_000n);
  if (proportional === undefined) throw new Error('the marketplace fee exceeds the safe integer range');
  return proportional > PLATFORM_FEE_MIN_SATS ? proportional : PLATFORM_FEE_MIN_SATS;
}

// ---------------------------------------------------------------------------------------------
// Canonical policy (spec §4.4)
// ---------------------------------------------------------------------------------------------

/** What a bidder offers on: one asset, or a collection narrowed by traits. */
export interface CanonicalPolicy {
  scope: 'asset' | 'collection';
  asset: string | null;
  collection: string | null;
  max_supply_units: number | null;
  min_supply_units: number | null;
  issued_year: number | null;
  series: number | null;
  artist: string | null;
}

const POLICY_KEYS = [
  'scope', 'asset', 'collection', 'max_supply_units', 'min_supply_units', 'issued_year', 'series', 'artist',
] as const satisfies readonly (keyof CanonicalPolicy)[];
const TRAIT_INT_KEYS = ['max_supply_units', 'min_supply_units', 'issued_year', 'series'] as const;
/** C0 controls and DEL. */
const hasControlCharacter = (value: string): boolean =>
  Array.from(value).some(char => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f);
/** A canonical compact asset id: named, numeric, or XCP. Never BTC and never a subasset longname. */
const CANONICAL_ASSET_ID = /^(?:XCP|[B-Z][A-Z]{3,11}|A[0-9]{17,20})$/;

const canonicalText = (value: string, field: string, max: number): string => {
  if (value.length < 1 || value.length > max) throw new Error(`policy ${field} must be 1..${max} characters`);
  if (value.trim() !== value) throw new Error(`policy ${field} must not have surrounding whitespace`);
  if (hasControlCharacter(value)) throw new Error(`policy ${field} must not contain control characters`);
  if (!value.isWellFormed()) throw new Error(`policy ${field} must be well-formed Unicode`);
  // Refused, never normalized: the hash commits to exactly the string this wallet displays.
  if (value.normalize('NFC') !== value) throw new Error(`policy ${field} must be NFC-normalized`);
  return value;
};

/** Strictly validate a policy and return a copy holding exactly the canonical keys. */
export function validateCanonicalPolicy(input: unknown): CanonicalPolicy {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('policy must be an object');
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!(POLICY_KEYS as readonly string[]).includes(key)) throw new Error(`unknown policy key ${key}`);
  }
  for (const key of POLICY_KEYS) {
    if (!(key in record)) throw new Error(`policy key ${key} is required (use null)`);
  }
  const scope = record.scope;
  if (scope !== 'asset' && scope !== 'collection') throw new Error('policy scope must be asset or collection');
  const ints: Record<(typeof TRAIT_INT_KEYS)[number], number | null> = {
    max_supply_units: null, min_supply_units: null, issued_year: null, series: null,
  };
  for (const key of TRAIT_INT_KEYS) {
    const value = record[key];
    if (value === null) continue;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new Error(`policy ${key} must be a non-negative safe integer or null`);
    }
    ints[key] = value;
  }
  const artistRaw = record.artist;
  if (artistRaw !== null && typeof artistRaw !== 'string') throw new Error('policy artist must be a string or null');
  const artist = artistRaw === null ? null : canonicalText(artistRaw, 'artist', 200);
  if (ints.min_supply_units !== null && ints.max_supply_units !== null && ints.min_supply_units > ints.max_supply_units) {
    throw new Error('policy min_supply_units exceeds max_supply_units');
  }
  if (scope === 'asset') {
    if (typeof record.asset !== 'string' || !CANONICAL_ASSET_ID.test(record.asset)) {
      throw new Error('an asset-scope policy needs a canonical compact asset id (never a longname)');
    }
    if (record.collection !== null) throw new Error('an asset-scope policy must have collection null');
    if (artist !== null || Object.values(ints).some(value => value !== null)) {
      throw new Error('trait predicates only apply to collection-scope policies');
    }
    return { scope, asset: record.asset, collection: null, ...ints, artist: null };
  }
  if (record.asset !== null) throw new Error('a collection-scope policy must have asset null');
  if (typeof record.collection !== 'string') throw new Error('a collection-scope policy needs a collection');
  const collection = canonicalText(record.collection, 'collection', 120);
  if (collection !== collection.toLowerCase()) throw new Error('policy collection must be lowercase');
  return { scope, asset: null, collection, ...ints, artist };
}

/** Canonical JSON: `"v":1` first, the fixed key order, no whitespace, absent traits as null. */
export function canonicalPolicyJson(policy: CanonicalPolicy): string {
  const valid = validateCanonicalPolicy(policy);
  const ordered: Record<string, unknown> = { v: POLICY_CANONICAL_VERSION };
  for (const key of POLICY_KEYS) ordered[key] = valid[key];
  return JSON.stringify(ordered);
}

/** SHA256 of the canonical policy bytes, hex: the leaf's policy commitment. */
export function policyHashHex(policy: CanonicalPolicy): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalPolicyJson(policy))));
}

// ---------------------------------------------------------------------------------------------
// Keys, leaf, and Taproot (spec §4.4)
// ---------------------------------------------------------------------------------------------

const u64le = (value: number): Uint8Array => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), true);
  return out;
};

const readU64le = (bytes: Uint8Array, offset: number): number => {
  const value = toSafeInteger(new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getBigUint64(0, true));
  if (value === undefined) throw new Error('policy leaf u64 field exceeds 2^53');
  return value;
};

/**
 * Pure results by key hex, bounded. A bundle's items name the same market and bidder keys over
 * and over, and each check costs curve arithmetic; the answers depend on nothing but the hex.
 */
const MEMO_LIMIT = 256;
function remember<T>(memo: Map<string, T>, key: string, value: T): T {
  if (memo.size >= MEMO_LIMIT) memo.delete(memo.keys().next().value as string);
  memo.set(key, value);
  return value;
}

/** Hex strings already shown to lift to a curve point. Public keys, not secrets. */
const liftedKeys = new Map<string, true>();

/** 32 bytes of lowercase hex naming a valid BIP340 x-only key (lift_x must succeed). */
export function xOnlyKey(hex: string, label: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error(`${label} must be 32 bytes of lowercase hex`);
  // Fresh bytes every call: callers may hold or reuse the array.
  const key = hexToBytes(hex);
  if (liftedKeys.has(hex)) return key;
  try {
    // Tweaking by the empty root lifts the key; an x coordinate off the curve throws.
    taprootTweakPubkey(key, new Uint8Array(0));
  } catch {
    throw new Error(`${label} is not a valid x-only public key`);
  }
  remember(liftedKeys, hex, true);
  return key;
}

export interface PolicyLeafTerms {
  priceSats: number;
  /** Unix seconds. */
  expiresAt: number;
  /** v1 enables only detached delivery: `D`, the Counterparty address the unit detaches to. */
  deliveryAddress: string;
  /** SHA256(canonical policy), hex. */
  policyHash: string;
  /** K_m, hex, used untweaked by the leaf's OP_CHECKSIG. */
  marketKey: string;
}

const OP_0 = 0x00;
const OP_IF = 0x63;
const OP_ENDIF = 0x68;
const OP_CHECKSIG = 0xac;
const TERMS_BYTES = 17;
const DELIVERY_DETACHED = 0;

/** `114 + len(D)` bytes; every push is a single-byte direct push. */
export function encodePolicyLeaf(terms: PolicyLeafTerms): Uint8Array {
  if (!Number.isSafeInteger(terms.priceSats) || terms.priceSats <= 0) throw new Error('price must be a positive safe integer');
  if (!Number.isSafeInteger(terms.expiresAt) || terms.expiresAt <= 0) throw new Error('expiry must be a positive safe integer');
  if (!/^[0-9a-f]{64}$/.test(terms.policyHash)) throw new Error('policy hash must be 32 bytes of lowercase hex');
  const marketKey = xOnlyKey(terms.marketKey, 'market key');
  const delivery = new TextEncoder().encode(terms.deliveryAddress);
  if (delivery.length < 1 || delivery.length > MAX_POLICY_DETACH_ADDRESS_BYTES) {
    throw new Error(`the detach address must be 1..${MAX_POLICY_DETACH_ADDRESS_BYTES} bytes`);
  }
  return concatBytes(
    Uint8Array.of(OP_0, OP_IF, POLICY_OFFER_TAG_BYTES.length),
    POLICY_OFFER_TAG_BYTES,
    Uint8Array.of(TERMS_BYTES),
    u64le(terms.priceSats),
    u64le(terms.expiresAt),
    Uint8Array.of(DELIVERY_DETACHED, delivery.length),
    delivery,
    Uint8Array.of(32),
    hexToBytes(terms.policyHash),
    Uint8Array.of(OP_ENDIF, 32),
    marketKey,
    Uint8Array.of(OP_CHECKSIG),
  );
}

/**
 * Read the terms a leaf commits to, admitting only exactly what `encodePolicyLeaf` would produce.
 * Attached delivery (kind 1) is not enabled in v1 and is refused.
 */
export function decodePolicyLeaf(leaf: Uint8Array): PolicyLeafTerms {
  const bad = (why: string): never => { throw new Error(`the policy leaf ${why}`); };
  let at = 0;
  const take = (n: number): Uint8Array => {
    if (at + n > leaf.length) bad('is truncated');
    const out = leaf.subarray(at, at + n);
    at += n;
    return out;
  };
  const push = (label: string): Uint8Array => {
    const length = take(1)[0]!;
    if (length < 1 || length > 75) bad(`${label} is not a direct push`);
    return take(length);
  };
  const [op0, opIf] = take(2);
  if (op0 !== OP_0 || opIf !== OP_IF) bad('must open with OP_0 OP_IF');
  if (!bytesEqual(push('tag'), POLICY_OFFER_TAG_BYTES)) bad(`tag is not ${POLICY_OFFER_TAG}`);
  const terms = push('terms');
  if (terms.length !== TERMS_BYTES) bad(`terms must be ${TERMS_BYTES} bytes`);
  const priceSats = readU64le(terms, 0);
  const expiresAt = readU64le(terms, 8);
  if (terms[16] !== DELIVERY_DETACHED) bad('does not commit to detached delivery');
  const deliveryBytes = push('delivery');
  if (deliveryBytes.length > MAX_POLICY_DETACH_ADDRESS_BYTES) bad('detach address is too long');
  let deliveryAddress: string;
  try {
    deliveryAddress = new TextDecoder('utf-8', { fatal: true }).decode(deliveryBytes);
  } catch {
    return bad('detach address is not UTF-8');
  }
  const policyHash = push('policy hash');
  if (policyHash.length !== 32) bad('policy hash must be 32 bytes');
  if (take(1)[0] !== OP_ENDIF) bad('must close the envelope with OP_ENDIF');
  const marketKey = push('market key');
  if (marketKey.length !== 32) bad('market key must be 32 bytes');
  if (take(1)[0] !== OP_CHECKSIG) bad('must end with OP_CHECKSIG');
  if (at !== leaf.length) bad('has trailing bytes');
  const decoded: PolicyLeafTerms = {
    priceSats, expiresAt, deliveryAddress,
    policyHash: bytesToHex(policyHash), marketKey: bytesToHex(marketKey),
  };
  if (!bytesEqual(encodePolicyLeaf(decoded), leaf)) bad('is not canonical');
  return decoded;
}

/** TaggedHash("TapLeaf", 0xc0 ‖ compact_size(len) ‖ leaf). One leaf, so this is the merkle root. */
export function policyTapLeafHash(leaf: Uint8Array): Uint8Array {
  if (leaf.length > 0xffff) throw new Error('the tapleaf is too long');
  const length = leaf.length < 0xfd
    ? Uint8Array.of(leaf.length)
    : Uint8Array.of(0xfd, leaf.length & 0xff, leaf.length >> 8);
  return tagSchnorr('TapLeaf', Uint8Array.of(POLICY_OFFER_LEAF_VERSION), length, leaf);
}

export interface PolicyOfferTaproot {
  leafHash: Uint8Array;
  outputKey: Uint8Array;
  parity: 0 | 1;
  /** `OP_1 <Q>`, hex. */
  scriptPubKeyHex: string;
}

/** The offer output key: K_b tweaked by the single leaf's hash (BIP341 taproot_tweak_pubkey). */
export function policyOfferTaproot(internalKeyHex: string, leaf: Uint8Array): PolicyOfferTaproot {
  const internalKey = xOnlyKey(internalKeyHex, 'internal key');
  const leafHash = policyTapLeafHash(leaf);
  const [outputKey, parity] = taprootTweakPubkey(internalKey, leafHash);
  return {
    leafHash, outputKey, parity: parity === 1 ? 1 : 0,
    scriptPubKeyHex: bytesToHex(concatBytes(Uint8Array.of(0x51, 0x20), outputKey)),
  };
}

/** `policyInternalKeyAddresses` by key hex; only keys that passed `xOnlyKey` are stored. */
const internalKeyAddresses = new Map<string, string[]>();

/**
 * Every signing address K_b can own: its BIP86 P2TR address, and the P2WPKH address of either
 * parity (the x-only form drops the parity of a compressed ECDSA key). A bidder address among
 * these proves the site's internal key is the bidder's own key, not one it chose.
 */
export function policyInternalKeyAddresses(internalKeyHex: string): string[] {
  const known = internalKeyAddresses.get(internalKeyHex);
  if (known) return [...known];
  const internalKey = xOnlyKey(internalKeyHex, 'internal key');
  const addresses = [
    p2tr(internalKey).script,
    p2wpkh(concatBytes(Uint8Array.of(0x02), internalKey)).script,
    p2wpkh(concatBytes(Uint8Array.of(0x03), internalKey)).script,
  ].map(script => decodeAddressFromScript(bytesToHex(script))).filter((address): address is string => !!address);
  return [...remember(internalKeyAddresses, internalKeyHex, addresses)];
}

// ---------------------------------------------------------------------------------------------
// The detach output keyed by the parent txid (spec §4.2)
// ---------------------------------------------------------------------------------------------

/** The Counterparty prefix and the detach message id. */
const DETACH_PREFIX = new Uint8Array([...COUNTERPARTY_PREFIX, 0x66]);

const txidBytes = (txid: string): Uint8Array => {
  if (!/^[0-9a-f]{64}$/.test(txid)) throw new Error('parent txid must be 32 bytes of lowercase hex');
  // Display order, exactly as Counterparty keys ARC4 with input 0's previous txid.
  return hexToBytes(txid);
};

/** Child output 0: `OP_RETURN ARC4(parent txid, "CNTRPRTY" ‖ 0x66 ‖ utf8(D))`, hex. */
export function policyDetachScriptHex(address: string, parentTxid: string): string {
  const plain = concatBytes(DETACH_PREFIX, new TextEncoder().encode(address));
  if (plain.length > MAX_OP_RETURN_DATA_BYTES) {
    throw new Error(`detach data exceeds ${MAX_OP_RETURN_DATA_BYTES} bytes`);
  }
  const data = arc4(txidBytes(parentTxid), plain);
  const push = data.length <= 75 ? Uint8Array.of(data.length) : Uint8Array.of(0x4c, data.length);
  return bytesToHex(concatBytes(Uint8Array.of(0x6a), push, data));
}

/** The destination a detach OP_RETURN credits when keyed by `parentTxid`, or null if it is not one. */
export function decodePolicyDetachScript(scriptHex: string, parentTxid: string): string | null {
  let script: Uint8Array;
  let key: Uint8Array;
  try {
    script = hexToBytes(scriptHex);
    key = txidBytes(parentTxid);
  } catch {
    return null;
  }
  if (script.length < 2 || script[0] !== 0x6a) return null;
  let data: Uint8Array;
  if (script[1]! >= 1 && script[1]! <= 75 && script.length === 2 + script[1]!) data = script.subarray(2);
  else if (script[1] === 0x4c && script.length >= 3 && script.length === 3 + script[2]!) data = script.subarray(3);
  else return null;
  const plain = arc4(key, data);
  if (plain.length <= DETACH_PREFIX.length || !bytesEqual(plain.subarray(0, DETACH_PREFIX.length), DETACH_PREFIX)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(plain.subarray(DETACH_PREFIX.length));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Parent size and bytes
// ---------------------------------------------------------------------------------------------

/**
 * vP of an UNSIGNED parent, as the marketplace quotes it: worst-case bidder witnesses (65-byte
 * P2TR, 72+33-byte P2WPKH) and the market's 64-byte DEFAULT anchor signature on the last input.
 */
export function unsignedPolicyParentVsize(
  inputScriptTypes: ReadonlyArray<DecodedOutput['type'] | undefined>,
  outputScriptsHex: readonly string[],
): number {
  const witnesses = inputScriptTypes.map((type, index) => {
    const anchor = index === inputScriptTypes.length - 1;
    if (type === 'p2tr') return anchor ? [64] : [65];
    if (type === 'p2wpkh') return [72, 33];
    throw new Error(`parent input ${index} is not P2TR or P2WPKH`);
  });
  let weight = 4 * (4 + 4);
  weight += 4 * compactSizeLength(witnesses.length);
  weight += witnesses.length * 4 * (36 + 1 + 4);
  weight += 4 * compactSizeLength(outputScriptsHex.length);
  for (const scriptHex of outputScriptsHex) {
    const length = scriptHex.length / 2;
    weight += 4 * (8 + compactSizeLength(length) + length);
  }
  weight += 2;
  for (const items of witnesses) {
    weight += compactSizeLength(items.length);
    for (const length of items) weight += compactSizeLength(length) + length;
  }
  return Math.ceil(weight / 4);
}

export interface WitnessStrippedParent {
  txid: string;
  version: number;
  lockTime: number;
  inputCount: number;
  outputs: Array<{ scriptHex: string; valueSats: number }>;
}

/**
 * Parse the offer parent a seller is shown. It must carry no witnesses: the bidder-signed bytes
 * would let a seller mine the parent alone, and the txid excludes witnesses, so nothing is lost.
 */
export function parseWitnessStrippedParent(rawHex: string): WitnessStrippedParent {
  const tx = parseConsensusTransaction(rawHex);
  if (bytesToHex(tx.toBytes(true, false)) !== rawHex.toLowerCase()) {
    throw new Error('the offer parent must be serialized without witnesses');
  }
  const outputs: WitnessStrippedParent['outputs'] = [];
  for (let index = 0; index < tx.outputsLength; index += 1) {
    const output = tx.getOutput(index);
    const valueSats = toSafeInteger(output.amount);
    if (!output.script || valueSats === undefined) throw new Error(`offer parent output ${index} is malformed`);
    outputs.push({ scriptHex: bytesToHex(output.script), valueSats });
  }
  return { txid: tx.id, version: tx.version, lockTime: tx.lockTime, inputCount: tx.inputsLength, outputs };
}
