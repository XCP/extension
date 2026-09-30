/**
 * Counterparty Core 11.5's rule for attributing a Taproot reveal to its source, ported from
 * `counterparty-rs/src/reveal.rs` (`check_reveal_source_signature`).
 *
 * From 11.5 a reveal publishes its message from the address that funded the commit only when:
 *
 * 1. the output it spends is a P2TR output;
 * 2. its witness is `<signature> <leaf> <control block>`, a tapscript spend (leaf version `0xc0`)
 *    whose control block commits the leaf to that output's key;
 * 3. the leaf is a canonical envelope, `OP_FALSE OP_IF <pushes only> OP_ENDIF <32-byte key>
 *    OP_CHECKSIG` and nothing else;
 * 4. that key is a key of the source address.
 *
 * Bitcoin's script validation then guarantees the source signed the reveal. Any other reveal is
 * ignored by Core as a non-Counterparty transaction, so the wallet holds what it signs to exactly
 * this rule before signing: a reveal it signs is one Core will attribute to the user, and a reveal
 * that fails the rule is not signed at all.
 *
 * Pure and total, like the original: every failure is a reason string, never an exception.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Address, NETWORK, OutScript, TEST_NETWORK } from '@scure/btc-signer';
import { tapLeafHash } from '@scure/btc-signer/payment.js';
import { compareBytes, concatBytes, hash160, tagSchnorr, taprootTweakPubkey } from '@scure/btc-signer/utils.js';
import { type Instruction, parseInstructions } from '@/core/counterparty/unpack/ordEnvelope';

/** Tapscript, the only leaf version whose `OP_CHECKSIG` is a BIP340 signature check. */
export const TAPSCRIPT_LEAF_VERSION = 0xc0;

const OP_IF = 0x63;
const OP_ENDIF = 0x68;
const OP_CHECKSIG = 0xac;
/** BIP341's limit on a control block's merkle path. */
const MAX_MERKLE_PATH = 128;

/** The failure modes of `reveal.rs`'s `RevealError`, by name. */
export type RevealRuleError =
  | 'witness_shape'
  | 'commit_not_p2tr'
  | 'invalid_commit_key'
  | 'invalid_control_block'
  | 'leaf_version'
  | 'commitment_mismatch'
  | 'not_an_envelope'
  | 'invalid_leaf_key'
  | 'source_key_mismatch';

export type LeafKeyResult = { ok: true; key: Uint8Array } | { ok: false; error: RevealRuleError; detail: string };

/** Whether 32 bytes are the x coordinate of a curve point (`XOnlyPublicKey::from_slice`). */
export function isValidXOnlyKey(key: Uint8Array): boolean {
  if (key.length !== 32) return false;
  try {
    secp256k1.Point.fromHex(`02${bytesToHex(key)}`).assertValidity();
    return true;
  } catch {
    return false;
  }
}

const REGTEST_NETWORK = { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef };

/** The output script an address pays; any network's spelling reads to the same script. */
export function sourceOutputScript(address: string): Uint8Array | null {
  for (const network of [NETWORK, TEST_NETWORK, REGTEST_NETWORK]) {
    try {
      return OutScript.encode(Address(network).decode(address));
    } catch {
      // try the next spelling
    }
  }
  return null;
}

/** `OP_1NEGATE` and `OP_1`..`OP_16`: number pushes, none of them an `OP_SUCCESSx`. */
function isPushNum(op: number): boolean {
  return op === 0x4f || (op >= 0x51 && op <= 0x60);
}

function isOp(instruction: Instruction | undefined, op: number): boolean {
  return !!instruction && 'op' in instruction && instruction.op === op;
}

/**
 * The key of a canonical envelope leaf: `OP_FALSE OP_IF <push-only body> OP_ENDIF <32-byte key>
 * OP_CHECKSIG`, exactly. With tapscript an `OP_SUCCESSx` anywhere in the leaf, even in the
 * unexecuted branch, would make the spend valid without the signature check, and anything after
 * `OP_CHECKSIG` could discard its result; only this shape makes the signature the leaf key's.
 */
export function envelopeLeafKey(leaf: Uint8Array): LeafKeyResult {
  const fail = (detail: string): LeafKeyResult => ({ ok: false, error: 'not_an_envelope', detail });
  const instructions = parseInstructions(leaf);
  if (!instructions) return fail('unparsable script');
  let i = 0;
  const first = instructions[i++];
  if (!first || !('push' in first) || first.push.length !== 0) return fail('must start with OP_FALSE');
  if (!isOp(instructions[i++], OP_IF)) return fail('OP_FALSE must be followed by OP_IF');
  for (;;) {
    const instruction = instructions[i++];
    if (!instruction) return fail('missing OP_ENDIF');
    if ('push' in instruction) continue;
    if (instruction.op === OP_ENDIF) break;
    if (isPushNum(instruction.op)) continue;
    return fail('non-push opcode inside the envelope');
  }
  const keyPush = instructions[i++];
  if (!keyPush || !('push' in keyPush) || keyPush.push.length !== 32) {
    return fail('OP_ENDIF must be followed by a 32-byte key');
  }
  if (!isValidXOnlyKey(keyPush.push)) return { ok: false, error: 'invalid_leaf_key', detail: 'invalid envelope public key' };
  if (!isOp(instructions[i++], OP_CHECKSIG)) return fail('key must be followed by OP_CHECKSIG');
  if (i !== instructions.length) return fail('trailing bytes after OP_CHECKSIG');
  return { ok: true, key: keyPush.push };
}

function isP2tr(script: Uint8Array): boolean {
  return script.length === 34 && script[0] === 0x51 && script[1] === 0x20;
}

function isP2wpkh(script: Uint8Array): boolean {
  return script.length === 22 && script[0] === 0x00 && script[1] === 0x14;
}

function isP2pkh(script: Uint8Array): boolean {
  return script.length === 25 && script[0] === 0x76 && script[1] === 0xa9 && script[2] === 0x14
    && script[23] === 0x88 && script[24] === 0xac;
}

function isP2sh(script: Uint8Array): boolean {
  return script.length === 23 && script[0] === 0xa9 && script[1] === 0x14 && script[22] === 0x87;
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && compareBytes(a, b) === 0;
}

/** The BIP86 output key of an internal key (no script tree), or null for an invalid key. */
export function bip86OutputKey(internalKey: Uint8Array): Uint8Array | null {
  try {
    return taprootTweakPubkey(internalKey, new Uint8Array(0))[0];
  } catch {
    return null;
  }
}

/**
 * Whether the x-only `key` is a key of the address whose output script is `sourceScript`
 * (`reveal.rs`, `source_controls_key`): a P2TR output key or BIP86 internal key; the compressed
 * key of a P2WPKH or nested P2WPKH, either parity; the compressed or uncompressed key of a P2PKH.
 */
export function sourceControlsKey(sourceScript: Uint8Array, key: Uint8Array): boolean {
  if (!isValidXOnlyKey(key)) return false;
  const even = secp256k1.Point.fromHex(`02${bytesToHex(key)}`);
  const points = [even, even.negate()];
  const compressed = points.map((point) => point.toBytes(true));

  if (isP2tr(sourceScript)) {
    const outputKey = sourceScript.slice(2, 34);
    if (equal(key, outputKey)) return true;
    const tweaked = bip86OutputKey(key);
    return !!tweaked && equal(tweaked, outputKey);
  }
  if (isP2wpkh(sourceScript)) {
    const program = sourceScript.slice(2, 22);
    return compressed.some((pubkey) => equal(hash160(pubkey), program));
  }
  if (isP2pkh(sourceScript)) {
    const pubkeyHash = sourceScript.slice(3, 23);
    const uncompressed = points.map((point) => point.toBytes(false));
    return [...compressed, ...uncompressed].some((pubkey) => equal(hash160(pubkey), pubkeyHash));
  }
  if (isP2sh(sourceScript)) {
    const scriptHash = sourceScript.slice(2, 22);
    return compressed.some((pubkey) =>
      equal(hash160(concatBytes(new Uint8Array([0x00, 0x14]), hash160(pubkey))), scriptHash));
  }
  return false;
}

/**
 * Whether `controlBlock` commits `leaf` to the P2TR output key `outputKey` under its own leaf
 * version (BIP341 script-path verification: the leaf hash, the merkle path, the tweak, and the
 * output key's parity).
 */
export function controlBlockCommits(controlBlock: Uint8Array, leaf: Uint8Array, outputKey: Uint8Array): boolean {
  if (controlBlock.length < 33 || (controlBlock.length - 33) % 32 !== 0) return false;
  if ((controlBlock.length - 33) / 32 > MAX_MERKLE_PATH) return false;
  const leafVersion = controlBlock[0]! & 0xfe;
  const parity = controlBlock[0]! & 0x01;
  const internalKey = controlBlock.slice(1, 33);
  let node = tapLeafHash(leaf, leafVersion);
  for (let offset = 33; offset < controlBlock.length; offset += 32) {
    const sibling = controlBlock.slice(offset, offset + 32);
    node = compareBytes(node, sibling) <= 0
      ? tagSchnorr('TapBranch', node, sibling)
      : tagSchnorr('TapBranch', sibling, node);
  }
  try {
    const [tweaked, tweakedParity] = taprootTweakPubkey(internalKey, node);
    return equal(tweaked, outputKey) && tweakedParity === parity;
  } catch {
    return false;
  }
}

export type RevealRuleResult = { ok: true; leafKey: Uint8Array } | { ok: false; error: RevealRuleError; detail: string };

/**
 * `check_reveal_source_signature`: whether consensus guarantees that `witness` (input 0 of a
 * reveal spending `commitScript`) carries a signature by a key of the address whose output script
 * is `sourceScript`. The signature itself is Bitcoin's to check; this checks everything that makes
 * it the source's.
 */
export function checkRevealSourceSignature(
  commitScript: Uint8Array,
  sourceScript: Uint8Array,
  witness: Uint8Array[],
): RevealRuleResult {
  if (witness.length !== 3) {
    return { ok: false, error: 'witness_shape', detail: `witness has ${witness.length} elements, a tapscript reveal has exactly 3` };
  }
  if (!isP2tr(commitScript)) return { ok: false, error: 'commit_not_p2tr', detail: 'the spent commit output is not P2TR' };
  const outputKey = commitScript.slice(2, 34);
  if (!isValidXOnlyKey(outputKey)) return { ok: false, error: 'invalid_commit_key', detail: 'invalid P2TR output key' };

  const [, leaf, controlBlock] = witness as [Uint8Array, Uint8Array, Uint8Array];
  if (controlBlock.length < 33 || (controlBlock.length - 33) % 32 !== 0
    || (controlBlock.length - 33) / 32 > MAX_MERKLE_PATH || !isValidXOnlyKey(controlBlock.slice(1, 33))) {
    return { ok: false, error: 'invalid_control_block', detail: 'invalid taproot control block' };
  }
  const leafVersion = controlBlock[0]! & 0xfe;
  if (leafVersion !== TAPSCRIPT_LEAF_VERSION) {
    return { ok: false, error: 'leaf_version', detail: `unsupported taproot leaf version 0x${leafVersion.toString(16)}` };
  }
  if (!controlBlockCommits(controlBlock, leaf, outputKey)) {
    return { ok: false, error: 'commitment_mismatch', detail: 'control block does not commit the leaf to the output key' };
  }

  const leafKey = envelopeLeafKey(leaf);
  if (!leafKey.ok) return leafKey;

  if (!sourceControlsKey(sourceScript, leafKey.key)) {
    return { ok: false, error: 'source_key_mismatch', detail: 'envelope key does not belong to the source address' };
  }
  return { ok: true, leafKey: leafKey.key };
}
