/**
 * Signing the reveal of a Core 11.5 Taproot compose with the source key, on composes captured from
 * Core 11.5 on regtest. A signed reveal must be one Core attributes to the source (the rule ported
 * from `reveal.rs`) and one Bitcoin accepts (a BIP340 signature over the BIP341 script-path sighash
 * by the envelope's key); anything tampered is refused before a signature exists.
 */

import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { p2pkh, p2sh, p2wpkh, SigHash, TaprootControlBlock, Transaction } from '@scure/btc-signer';
import { tapLeafHash } from '@scure/btc-signer/payment.js';
import { pubSchnorr, tagSchnorr } from '@scure/btc-signer/utils.js';
import { describe, expect, it } from 'vitest';
import { siteLaunch } from '@/core/counterparty/__tests__/helpers/commitRevealPsbts';
import {
  BROADCAST_P2TR_INTERNAL,
  BROADCAST_P2TR_OUTPUT_KEY,
  BROADCAST_P2WPKH,
  type Compose115Result,
  envelopeClosedBy,
  type Fixture115,
  KEY_TR,
  KEY_WPKH,
  MPMA_P2WPKH,
  ORD_BROADCAST_P2WPKH,
  recompose115,
} from '@/core/counterparty/__tests__/taproot115Fixtures';
import { checkRevealSourceSignature, sourceOutputScript } from '@/core/counterparty/revealSourceRule';
import { revealSigningKey, signTaprootReveal } from '../taprootRevealSigner';

const RAW = { allowUnknownOutputs: true, allowUnknownInputs: true, disableScriptCheck: true };

function prevoutOf(result: Compose115Result) {
  const output = Transaction.fromRaw(hexToBytes(result.rawtransaction), RAW).getOutput(0);
  return { scriptHex: bytesToHex(output.script!), value: output.amount! };
}

function sign(fixture: Fixture115, result: Compose115Result = fixture.result, overrides: {
  privateKeyHex?: string;
  sourceAddress?: string;
  prevout?: { scriptHex: string; value: bigint };
} = {}): string {
  return signTaprootReveal(
    { revealHex: result.reveal_rawtransaction, envelopeScriptHex: result.envelope_script, controlBlockHex: result.reveal_control_block },
    overrides.prevout ?? prevoutOf(result),
    overrides.sourceAddress ?? fixture.key.address,
    overrides.privateKeyHex ?? fixture.key.privateKeyHex,
  );
}

/**
 * BIP341 script-path signature message for a one-input transaction, SIGHASH_DEFAULT, written out
 * from the BIP rather than taken from the library the signer uses.
 */
function bip341Sighash(tx: Transaction, prevScript: Uint8Array, amount: bigint, leaf: Uint8Array): Uint8Array {
  const sha = (bytes: Uint8Array) => sha256(bytes);
  const le32 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
  const le64 = (n: bigint) => { const out = new Uint8Array(8); for (let i = 0; i < 8; i += 1) out[i] = Number((n >> BigInt(8 * i)) & 0xffn); return out; };
  const varBytes = (bytes: Uint8Array) => new Uint8Array([bytes.length, ...bytes]);
  const input = tx.getInput(0);
  const outpoint = new Uint8Array([...input.txid!.slice().reverse(), ...le32(input.index!)]);
  const outputs: number[] = [];
  for (let i = 0; i < tx.outputsLength; i += 1) {
    const output = tx.getOutput(i);
    outputs.push(...le64(output.amount!), ...varBytes(output.script!));
  }
  const message = new Uint8Array([
    0x00, // epoch
    SigHash.DEFAULT,
    ...le32(tx.version), ...le32(tx.lockTime),
    ...sha(outpoint), ...sha(le64(amount)), ...sha(varBytes(prevScript)), ...sha(le32(input.sequence!)),
    ...sha(new Uint8Array(outputs)),
    0x02, // script path, no annex
    ...le32(0),
    ...tapLeafHash(leaf, 0xc0), 0x00, ...le32(0xffffffff),
  ]);
  return tagSchnorr('TapSighash', message);
}

const ALL = [
  ['an MPMA from P2WPKH', MPMA_P2WPKH],
  ['a broadcast from P2WPKH', BROADCAST_P2WPKH],
  ['a broadcast from P2TR, closed by the internal key', BROADCAST_P2TR_INTERNAL],
  ['a broadcast from P2TR, closed by the output key', BROADCAST_P2TR_OUTPUT_KEY],
  ['an ord inscription from P2WPKH', ORD_BROADCAST_P2WPKH],
] as const;

describe('signing the reveal with the source key', () => {
  it.each(ALL)('signs %s so Core attributes it to the source and Bitcoin accepts the signature', (_, fixture) => {
    const signedHex = sign(fixture);
    const signed = Transaction.fromRaw(hexToBytes(signedHex), RAW);
    const unsigned = Transaction.fromRaw(hexToBytes(fixture.result.reveal_rawtransaction), RAW);
    // Only the witness changed.
    expect(signed.id).toBe(unsigned.id);
    const witness = signed.getInput(0).finalScriptWitness!;
    expect(witness).toHaveLength(3);
    const [signature, leaf, control] = witness as [Uint8Array, Uint8Array, Uint8Array];
    expect(bytesToHex(leaf)).toBe(fixture.result.envelope_script);
    expect(bytesToHex(control)).toBe(fixture.result.reveal_control_block);
    // SIGHASH_DEFAULT: a bare 64-byte signature.
    expect(signature).toHaveLength(64);

    // Core's rule, against the real commit output and the real source.
    const prevout = prevoutOf(fixture.result);
    const rule = checkRevealSourceSignature(hexToBytes(prevout.scriptHex), sourceOutputScript(fixture.key.address)!, witness);
    expect(rule.ok).toBe(true);
    // The signature verifies under the envelope key over the BIP341 script-path message.
    const sighash = bip341Sighash(unsigned, hexToBytes(prevout.scriptHex), prevout.value, leaf);
    expect(schnorr.verify(signature, sighash, hexToBytes(fixture.result.reveal_pubkey))).toBe(true);
  });

  it('signs a P2TR output-key envelope with the tweaked key, and an internal-key one with the plain key', () => {
    const privateKey = hexToBytes(KEY_TR.privateKeyHex);
    const internal = revealSigningKey(hexToBytes(BROADCAST_P2TR_INTERNAL.result.reveal_pubkey), privateKey, true);
    const output = revealSigningKey(hexToBytes(BROADCAST_P2TR_OUTPUT_KEY.result.reveal_pubkey), privateKey, true);
    expect(internal && bytesToHex(internal)).toBe(KEY_TR.privateKeyHex);
    expect(output && bytesToHex(pubSchnorr(output))).toBe(BROADCAST_P2TR_OUTPUT_KEY.result.reveal_pubkey);
    // A P2WPKH source never signs for a tweaked key.
    expect(revealSigningKey(hexToBytes(BROADCAST_P2TR_OUTPUT_KEY.result.reveal_pubkey), privateKey, false)).toBeNull();
  });

  it('accepts the source address in its mainnet or regtest spelling, which are the same script', () => {
    const signed = Transaction.fromRaw(hexToBytes(sign(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result,
      { sourceAddress: KEY_WPKH.regtestAddress })), RAW);
    const witness = signed.getInput(0).finalScriptWitness!;
    expect(checkRevealSourceSignature(hexToBytes(prevoutOf(BROADCAST_P2WPKH.result).scriptHex),
      sourceOutputScript(KEY_WPKH.address)!, witness).ok).toBe(true);
  });
});

const REFUSED = /The reveal was not signed/;

describe('refusing to sign a reveal that is not the source\'s', () => {
  it('refuses an envelope closed by another key, with the tree rebuilt around it', () => {
    const other = pubSchnorr(new Uint8Array(32).fill(9));
    const tampered = recompose115(BROADCAST_P2WPKH, { envelope: envelopeClosedBy(BROADCAST_P2WPKH, other) });
    expect(() => sign(BROADCAST_P2WPKH, tampered)).toThrow(REFUSED);
    expect(() => sign(BROADCAST_P2WPKH, tampered)).toThrow(/does not belong to the source/);
  });

  it('refuses a key of the source it cannot sign for', () => {
    // The P2TR fixture signed with the P2WPKH key: the envelope key is not this key's.
    expect(() => sign(BROADCAST_P2TR_INTERNAL, BROADCAST_P2TR_INTERNAL.result, { privateKeyHex: KEY_WPKH.privateKeyHex })).toThrow(REFUSED);
  });

  it('refuses a control block with the wrong parity, a merkle path, or another internal key', () => {
    const { result } = BROADCAST_P2WPKH;
    const control = result.reveal_control_block;
    const flipped = (Number.parseInt(control.slice(0, 2), 16) ^ 1).toString(16) + control.slice(2);
    expect(() => sign(BROADCAST_P2WPKH, { ...result, reveal_control_block: flipped })).toThrow(REFUSED);
    expect(() => sign(BROADCAST_P2WPKH, { ...result, reveal_control_block: `${control}${'11'.repeat(32)}` })).toThrow(REFUSED);
    expect(() => sign(BROADCAST_P2WPKH, { ...result, reveal_control_block: `c0${KEY_TR.publicKeyHex.slice(2)}` })).toThrow(REFUSED);
    // A tree hiding a second leaf proves out under the rule, but is not the envelope alone.
    const hidden = recompose115(BROADCAST_P2WPKH, { extraLeaf: MPMA_P2WPKH.result.envelope_script });
    expect(() => sign(BROADCAST_P2WPKH, hidden)).toThrow(/envelope alone/);
  });

  it('refuses an envelope the commit output does not commit to', () => {
    const { result } = BROADCAST_P2WPKH;
    expect(() => sign(BROADCAST_P2WPKH, { ...result, envelope_script: MPMA_P2WPKH.result.envelope_script })).toThrow(REFUSED);
    expect(() => sign(BROADCAST_P2WPKH, result, { prevout: prevoutOf(MPMA_P2WPKH.result) })).toThrow(REFUSED);
  });

  it('refuses a non-canonical envelope, even one the commit genuinely commits to', () => {
    // OP_CAT (an OP_SUCCESS in tapscript) inside the envelope, with the tree rebuilt around it.
    const envelope = BROADCAST_P2WPKH.result.envelope_script.replace(/68(20[0-9a-f]{64}ac)$/, '7e68$1');
    expect(envelope).not.toBe(BROADCAST_P2WPKH.result.envelope_script);
    const tampered = recompose115(BROADCAST_P2WPKH, { envelope });
    expect(() => sign(BROADCAST_P2WPKH, tampered)).toThrow(/non-push opcode/);
  });

  it('refuses a commit output that is not P2TR', () => {
    expect(() => sign(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, { prevout: { scriptHex: KEY_WPKH.scriptHex, value: 526n } })).toThrow(REFUSED);
  });

  it('refuses sources Core composes no envelope for, and a source that is not the key\'s', () => {
    // The same key's legacy and nested SegWit addresses: Core's rule would accept the key, but Core
    // composes Taproot encoding only from P2WPKH and P2TR, so the wallet signs only for those.
    const publicKey = hexToBytes(KEY_WPKH.publicKeyHex);
    for (const sourceAddress of [p2pkh(publicKey).address!, p2sh(p2wpkh(publicKey)).address!]) {
      expect(() => sign(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, { sourceAddress })).toThrow(/Native SegWit or Taproot/);
    }
    expect(() => sign(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, { sourceAddress: KEY_TR.address })).toThrow(REFUSED);
  });

  it('refuses a reveal already signed, or spending more than one output', () => {
    const signed = sign(BROADCAST_P2WPKH);
    expect(() => sign(BROADCAST_P2WPKH, { ...BROADCAST_P2WPKH.result, reveal_rawtransaction: signed })).toThrow(REFUSED);
    const reveal = Transaction.fromRaw(hexToBytes(BROADCAST_P2WPKH.result.reveal_rawtransaction), RAW);
    reveal.addInput({ txid: new Uint8Array(32).fill(1), index: 0 });
    expect(() => sign(BROADCAST_P2WPKH, { ...BROADCAST_P2WPKH.result, reveal_rawtransaction: bytesToHex(reveal.unsignedTx) })).toThrow(REFUSED);
  });
});

describe('a reveal a site built', () => {
  const launch = siteLaunch(1200, 0x71);
  const reveal = Transaction.fromPSBT(hexToBytes(launch.revealHex), RAW);
  const [control, scriptWithVersion] = reveal.getInput(0).tapLeafScript![0]!;
  const toSign = {
    revealHex: bytesToHex(reveal.unsignedTx),
    envelopeScriptHex: bytesToHex(scriptWithVersion.slice(0, -1)),
    controlBlockHex: bytesToHex(TaprootControlBlock.encode(control)),
  };
  const witnessUtxo = reveal.getInput(0).witnessUtxo!;
  const prevout = { scriptHex: bytesToHex(witnessUtxo.script), value: witnessUtxo.amount };

  it('is refused under the unspendable internal key unless the caller admits a site-built commit', () => {
    expect(() => signTaprootReveal(toSign, prevout, launch.address, launch.privateKeyHex))
      .toThrow(/does not commit to the envelope alone/);
    const signed = signTaprootReveal(toSign, prevout, launch.address, launch.privateKeyHex,
      { siteInternalKey: true, sighash: SigHash.ALL });
    const witness = Transaction.fromRaw(hexToBytes(signed), RAW).getInput(0).finalScriptWitness!;
    expect(witness[0]).toHaveLength(65);
    expect(checkRevealSourceSignature(witnessUtxo.script, sourceOutputScript(launch.address)!, witness).ok).toBe(true);
  });

  it('never signs with another sighash', () => {
    expect(() => signTaprootReveal(toSign, prevout, launch.address, launch.privateKeyHex,
      { siteInternalKey: true, sighash: 0x81 as never })).toThrow(/not DEFAULT or ALL/);
  });
});
