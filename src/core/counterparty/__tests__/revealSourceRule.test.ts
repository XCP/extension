/**
 * The port of Core 11.5's reveal source-signature rule, held to the cases `counterparty-rs/src/reveal.rs`
 * tests, one for one: honest reveals from every source type Core accepts, and each way a reveal can
 * fail to prove the source signed it.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { p2pkh, p2sh, p2tr, p2wpkh, TaprootControlBlock } from '@scure/btc-signer';
import { tapLeafHash } from '@scure/btc-signer/payment.js';
import { hash160, pubSchnorr, sha256, taprootTweakPubkey } from '@scure/btc-signer/utils.js';
import { describe, expect, it } from 'vitest';
import {
  bip86OutputKey,
  checkRevealSourceSignature,
  envelopeLeafKey,
  sourceControlsKey,
  sourceOutputScript,
} from '../revealSourceRule';

interface Key { xonly: Uint8Array; compressed: Uint8Array; uncompressed: Uint8Array }

function key(seed: number): Key {
  const secret = new Uint8Array(32).fill(seed);
  return {
    xonly: pubSchnorr(secret),
    compressed: secp256k1.getPublicKey(secret, true),
    uncompressed: secp256k1.getPublicKey(secret, false),
  };
}

const OP_FALSE = 0x00;
const OP_IF = 0x63;
const OP_ENDIF = 0x68;
const OP_CHECKSIG = 0xac;
const OP_CHECKSIGVERIFY = 0xad;
const OP_NOP = 0x61;
const OP_DROP = 0x75;
const OP_RESERVED = 0x50;
const OP_CAT = 0x7e;

const push = (data: Uint8Array) => [data.length, ...data];
const BODY = push(new TextEncoder().encode('some counterparty message'));

function script(...parts: Array<number | number[]>): Uint8Array {
  return new Uint8Array(parts.flatMap((part) => (Array.isArray(part) ? part : [part])));
}

/** `OP_FALSE OP_IF <data> OP_ENDIF <key> OP_CHECKSIG` */
function envelope(leafKey: Uint8Array): Uint8Array {
  return script(OP_FALSE, OP_IF, BODY, OP_ENDIF, push(leafKey), OP_CHECKSIG);
}

/** `ord`-style envelope with tags pushed both as data and as OP_PUSHNUM. */
function ordEnvelope(leafKey: Uint8Array): Uint8Array {
  const text = new TextEncoder();
  return script(OP_FALSE, OP_IF, push(text.encode('ord')), push(new Uint8Array([7])), push(text.encode('xcp')),
    0x51, push(text.encode('text/plain')), push(new Uint8Array([5])), push(new Uint8Array([0xa1, 0x01, 0x02])),
    OP_FALSE, push(text.encode('hello')), OP_ENDIF, push(leafKey), OP_CHECKSIG);
}

/**
 * Commit output script and control block of a single-leaf tree, built by the library for a leaf
 * it can parse and by hand (BIP341) for one it cannot, such as a truncated push.
 */
function commit(internalKey: Uint8Array, leaf: Uint8Array, leafVersion = 0xc0): [Uint8Array, Uint8Array] {
  try {
    const payment = p2tr(internalKey, { script: leaf, leafVersion }, undefined, true);
    return [payment.script, TaprootControlBlock.encode(payment.tapLeafScript![0]![0])];
  } catch {
    const [outputKey, parity] = taprootTweakPubkey(internalKey, tapLeafHash(leaf, leafVersion));
    return [new Uint8Array([0x51, 0x20, ...outputKey]), new Uint8Array([leafVersion | parity, ...internalKey])];
  }
}

const witness = (leaf: Uint8Array, controlBlock: Uint8Array) => [new Uint8Array(64).fill(1), leaf, controlBlock];

const P2WPKH = (k: Key) => p2wpkh(k.compressed).script;
const P2TR_BIP86 = (k: Key) => p2tr(k.xonly).script;
const P2PKH_COMPRESSED = (k: Key) => p2pkh(k.compressed).script;
const P2PKH_UNCOMPRESSED = (k: Key) => p2pkh(k.uncompressed).script;
const P2SH_P2WPKH = (k: Key) => p2sh(p2wpkh(k.compressed)).script;
/** Script-hash outputs of an arbitrary script, built by hand (BIP141 / BIP16). */
const P2WSH_OF = (witnessScript: Uint8Array) => new Uint8Array([0x00, 0x20, ...sha256(witnessScript)]);
const P2SH_OF = (redeemScript: Uint8Array) => new Uint8Array([0xa9, 0x14, ...hash160(redeemScript), 0x87]);

function honest(sourceScript: Uint8Array, source: Key) {
  const leaf = envelope(source.xonly);
  const [commitScript, controlBlock] = commit(source.xonly, leaf);
  return checkRevealSourceSignature(commitScript, sourceScript, witness(leaf, controlBlock));
}

function checkLeaf(source: Key, leaf: Uint8Array) {
  const [commitScript, controlBlock] = commit(source.xonly, leaf);
  return checkRevealSourceSignature(commitScript, P2WPKH(source), witness(leaf, controlBlock));
}

const errorOf = (result: ReturnType<typeof checkRevealSourceSignature>) => (result.ok ? 'ok' : result.error);

describe('Core 11.5 reveal source-signature rule (port of reveal.rs)', () => {
  it('accepts a P2WPKH source signing with its key, for either key parity', () => {
    for (let seed = 1; seed <= 8; seed += 1) {
      const source = key(seed);
      expect(errorOf(honest(P2WPKH(source), source)), `seed ${seed}`).toBe('ok');
    }
  });

  it('accepts a P2TR source signing with its internal or its output key', () => {
    const source = key(3);
    expect(errorOf(honest(P2TR_BIP86(source), source))).toBe('ok');
    const outputKey = bip86OutputKey(source.xonly)!;
    const leaf = envelope(outputKey);
    const [commitScript, controlBlock] = commit(outputKey, leaf);
    expect(errorOf(checkRevealSourceSignature(commitScript, P2TR_BIP86(source), witness(leaf, controlBlock)))).toBe('ok');
  });

  it('accepts P2PKH and nested P2WPKH sources', () => {
    const source = key(4);
    expect(errorOf(honest(P2PKH_COMPRESSED(source), source))).toBe('ok');
    expect(errorOf(honest(P2PKH_UNCOMPRESSED(source), source))).toBe('ok');
    expect(errorOf(honest(P2SH_P2WPKH(source), source))).toBe('ok');
  });

  it('accepts ord-style envelopes', () => {
    const source = key(5);
    const leaf = ordEnvelope(source.xonly);
    const [commitScript, controlBlock] = commit(source.xonly, leaf);
    expect(errorOf(checkRevealSourceSignature(commitScript, P2WPKH(source), witness(leaf, controlBlock)))).toBe('ok');
  });

  it('accepts a commit whose internal key is not the source key', () => {
    const source = key(6);
    const leaf = envelope(source.xonly);
    const [commitScript, controlBlock] = commit(key(7).xonly, leaf);
    expect(errorOf(checkRevealSourceSignature(commitScript, P2WPKH(source), witness(leaf, controlBlock)))).toBe('ok');
  });

  it('rejects a P2TR leaf closed by someone else\'s key', () => {
    const source = key(10);
    const other = key(11);
    const leaf = envelope(other.xonly);
    const [commitScript, controlBlock] = commit(other.xonly, leaf);
    expect(errorOf(checkRevealSourceSignature(commitScript, P2WPKH(source), witness(leaf, controlBlock)))).toBe('source_key_mismatch');
    expect(errorOf(checkRevealSourceSignature(commitScript, P2TR_BIP86(source), witness(leaf, controlBlock)))).toBe('source_key_mismatch');
  });

  it('rejects a P2WSH commit, whatever key the leaf holds', () => {
    const source = key(10);
    const witnessScript = new Uint8Array([0x6d, 0x51]);
    const commitScript = P2WSH_OF(witnessScript);
    const leaf = envelope(source.xonly);
    expect(errorOf(checkRevealSourceSignature(commitScript, P2WPKH(source), [new Uint8Array(64).fill(1), leaf, witnessScript])))
      .toBe('commit_not_p2tr');
  });

  it('rejects a witness that is not a three-element script path', () => {
    const source = key(12);
    const leaf = envelope(source.xonly);
    const [commitScript, controlBlock] = commit(source.xonly, leaf);
    expect(errorOf(checkRevealSourceSignature(commitScript, P2WPKH(source), [...witness(leaf, controlBlock), new Uint8Array([0x50])])))
      .toBe('witness_shape');
    expect(errorOf(checkRevealSourceSignature(commitScript, P2WPKH(source), [new Uint8Array(64)]))).toBe('witness_shape');
    expect(errorOf(checkRevealSourceSignature(commitScript, P2WPKH(source), []))).toBe('witness_shape');
  });

  it('rejects unknown leaf versions', () => {
    const source = key(13);
    const leaf = envelope(source.xonly);
    const [commitScript, controlBlock] = commit(source.xonly, leaf, 0xc2);
    expect(errorOf(checkRevealSourceSignature(commitScript, P2WPKH(source), witness(leaf, controlBlock)))).toBe('leaf_version');
  });

  it('rejects a control block that does not commit the leaf', () => {
    const source = key(14);
    const leaf = envelope(source.xonly);
    const [commitScript, controlBlock] = commit(source.xonly, leaf);
    const [, otherControlBlock] = commit(key(15).xonly, leaf);
    expect(errorOf(checkRevealSourceSignature(commitScript, P2WPKH(source), witness(leaf, otherControlBlock)))).toBe('commitment_mismatch');
    const otherLeaf = envelope(key(15).xonly);
    expect(errorOf(checkRevealSourceSignature(commitScript, P2WPKH(source), witness(otherLeaf, controlBlock)))).toBe('commitment_mismatch');
    expect(errorOf(checkRevealSourceSignature(commitScript, P2WPKH(source), witness(leaf, new Uint8Array(40).fill(0xc0)))))
      .toBe('invalid_control_block');
    // The wrong parity bit is a different commitment.
    const flipped = controlBlock.slice();
    flipped[0] = flipped[0]! ^ 1;
    expect(errorOf(checkRevealSourceSignature(commitScript, P2WPKH(source), witness(leaf, flipped)))).toBe('commitment_mismatch');
  });

  it('rejects an invalid output key', () => {
    const source = key(16);
    const leaf = envelope(source.xonly);
    const [, controlBlock] = commit(source.xonly, leaf);
    const commitScript = new Uint8Array([0x51, 0x20, ...new Uint8Array(32)]);
    expect(errorOf(checkRevealSourceSignature(commitScript, P2WPKH(source), witness(leaf, controlBlock)))).toBe('invalid_commit_key');
  });

  it('rejects OP_SUCCESSx inside the envelope', () => {
    const source = key(17);
    for (const opcode of [OP_RESERVED, OP_CAT]) {
      const leaf = script(OP_FALSE, OP_IF, BODY, opcode, OP_ENDIF, push(source.xonly), OP_CHECKSIG);
      const result = checkLeaf(source, leaf);
      expect(errorOf(result)).toBe('not_an_envelope');
      expect(!result.ok && result.detail).toBe('non-push opcode inside the envelope');
    }
  });

  it('rejects non-canonical envelopes', () => {
    const source = key(18);
    const cases: Uint8Array[] = [
      script(OP_FALSE, OP_IF, BODY, OP_NOP, OP_ENDIF, push(source.xonly), OP_CHECKSIG),
      script(OP_FALSE, OP_IF, OP_IF, BODY, OP_ENDIF, OP_ENDIF, push(source.xonly), OP_CHECKSIG),
      script(OP_FALSE, OP_IF, BODY, OP_ENDIF, push(source.compressed), OP_CHECKSIG),
      script(OP_FALSE, OP_IF, BODY, OP_ENDIF, push(source.xonly), OP_CHECKSIGVERIFY),
      script(OP_FALSE, OP_IF, BODY, OP_ENDIF, push(key(19).xonly), OP_CHECKSIG, OP_DROP, push(source.xonly), OP_CHECKSIG),
      script(OP_FALSE, OP_IF, BODY, OP_ENDIF, push(source.xonly), OP_CHECKSIG, OP_NOP),
      script(push(source.xonly), OP_CHECKSIG),
      script(OP_FALSE, OP_IF, BODY, push(source.xonly), OP_CHECKSIG),
      envelope(source.xonly).slice(0, -5),
    ];
    for (const leaf of cases) expect(errorOf(checkLeaf(source, leaf))).toBe('not_an_envelope');
    const trailing = checkLeaf(source, cases[5]!);
    expect(!trailing.ok && trailing.detail).toBe('trailing bytes after OP_CHECKSIG');
  });

  it('rejects a source with no single key', () => {
    const source = key(20);
    const leaf = envelope(source.xonly);
    const [commitScript, controlBlock] = commit(source.xonly, leaf);
    const sources = [
      P2WSH_OF(leaf),
      script(0x51, push(source.compressed), push(key(21).compressed), 0x52, 0xae),
      P2SH_OF(leaf),
      script(0x6a, push(new TextEncoder().encode('CNTRPRTY'))),
      new Uint8Array(0),
    ];
    for (const sourceScript of sources) {
      expect(errorOf(checkRevealSourceSignature(commitScript, sourceScript, witness(leaf, controlBlock)))).toBe('source_key_mismatch');
    }
  });

  it('rejects a different key of every supported source type', () => {
    const source = key(22);
    const other = key(23);
    const leaf = envelope(other.xonly);
    const [commitScript, controlBlock] = commit(other.xonly, leaf);
    for (const sourceScript of [P2WPKH(source), P2TR_BIP86(source), P2PKH_COMPRESSED(source), P2PKH_UNCOMPRESSED(source), P2SH_P2WPKH(source)]) {
      expect(errorOf(checkRevealSourceSignature(commitScript, sourceScript, witness(leaf, controlBlock)))).toBe('source_key_mismatch');
    }
  });
});

describe('rule helpers', () => {
  it('reads the key of a canonical envelope and nothing else', () => {
    const k = key(30);
    const read = envelopeLeafKey(envelope(k.xonly));
    expect(read.ok && Buffer.from(read.key).equals(Buffer.from(k.xonly))).toBe(true);
    // A 32-byte push that is not a curve point.
    expect(envelopeLeafKey(envelope(new Uint8Array(32)))).toMatchObject({ ok: false, error: 'invalid_leaf_key' });
  });

  it('names the keys a source controls', () => {
    const k = key(31);
    expect(sourceControlsKey(P2WPKH(k), k.xonly)).toBe(true);
    expect(sourceControlsKey(P2TR_BIP86(k), k.xonly)).toBe(true);
    expect(sourceControlsKey(P2TR_BIP86(k), bip86OutputKey(k.xonly)!)).toBe(true);
    expect(sourceControlsKey(P2WPKH(k), key(32).xonly)).toBe(false);
  });

  it('reads an address in any network spelling to the same script', () => {
    const k = key(33);
    const mainnet = p2wpkh(k.compressed).address!;
    const regtest = p2wpkh(k.compressed, { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef }).address!;
    expect(sourceOutputScript(mainnet)).toEqual(sourceOutputScript(regtest));
    expect(sourceOutputScript('not an address')).toBeNull();
  });
});
