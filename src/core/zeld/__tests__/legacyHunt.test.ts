import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as secp from '@noble/secp256k1';
import * as btc from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { assertOnlyNonceChanged } from '@/core/zeld/huntTemplate';
import {
  createLegacyMinerState,
  legacySignedTransaction,
  mineLegacyRange,
  prepareLegacyHunt,
  unsignedFormOf,
  verifyLegacySignatures,
} from '@/core/zeld/legacyHunt';
import { legacySighashPreimage } from '@/core/zeld/legacySighash';
import { MutableSha256d } from '@/core/zeld/sha256d';
import { opReturnScript, PREV_TXID } from './fixtures';

// A fixed key so a failure reproduces; the hunt's own nonces are random regardless.
const PRIVATE_KEY = hexToBytes('1'.repeat(64));

function spend(compressed: boolean, inputs = 1): { unsigned: Uint8Array; scriptCodes: Uint8Array[]; pubkey: Uint8Array } {
  const pubkey = secp.getPublicKey(PRIVATE_KEY, compressed);
  const script = btc.p2pkh(pubkey).script;
  const tx = new btc.Transaction({ allowUnknownOutputs: true, allowUnknownInputs: true });
  for (let index = 0; index < inputs; index++) {
    tx.addInput({ txid: hexToBytes(PREV_TXID), index, sequence: 0xfffffffd });
  }
  tx.addOutput({ script: opReturnScript(), amount: 0n });
  tx.addOutput({ script, amount: 95_000n });
  return { unsigned: tx.toBytes(true, false), scriptCodes: Array.from({ length: inputs }, () => script), pubkey };
}

describe('legacy hunt', () => {
  it.each([true, false])('reuses only immutable txid blocks with compressed=%s', compressed => {
    for (const inputs of [1, 3]) {
      const { unsigned, scriptCodes } = spend(compressed, inputs);
      const template = prepareLegacyHunt(unsigned, scriptCodes, PRIVATE_KEY, compressed);
      const cached = createLegacyMinerState(template);
      const uncached = { ...createLegacyMinerState(template), txid: new MutableSha256d(template.signed) };
      for (const nonce of [0, 0x7fff_ff00, 0xffff_ff00]) {
        expect(mineLegacyRange(template, nonce, 256, 0, 64, cached))
          .toEqual(mineLegacyRange(template, nonce, 256, 0, 64, uncached));
      }
      for (const input of template.inputs) {
        expect(input.r).toBeGreaterThanOrEqual(1n << 248n);
        expect(input.r).toBeLessThan(1n << 255n);
      }
    }
  });
  it.each([
    ['compressed', true],
    ['uncompressed', false],
  ])('signs a %s-key spend per attempt and the result verifies with the library', (_label, compressed) => {
    const { unsigned, scriptCodes, pubkey } = spend(compressed, 2);
    const template = prepareLegacyHunt(unsigned, scriptCodes, PRIVATE_KEY, compressed);
    expect(template.pubkey).toEqual(pubkey);
    expect(template.inputs).toHaveLength(2);

    // Two zeros turn up every 256 attempts; 20,000 fail with probability e^-78.
    const result = mineLegacyRange(template, 0, 20_000, 2);
    expect(result.stopped).toBe(true);
    const found = result.best!;
    expect(found.txid.startsWith('00')).toBe(true);

    const signed = legacySignedTransaction(template, found.nonce)!;
    expect(signed).not.toBeNull();
    expect(() => verifyLegacySignatures(template, signed, found.nonce)).not.toThrow();

    // The library parses it, computes the same txid, and accepts every signature itself.
    const parsed = btc.Transaction.fromRaw(signed, { allowUnknownOutputs: true, allowUnknownInputs: true });
    expect(parsed.id).toBe(found.txid);
    expect(parsed.lockTime).toBe(found.nonce);
    for (let index = 0; index < 2; index++) {
      const input = parsed.getInput(index);
      expect(input.sequence).toBe(0xffffffff);
      const scriptSig = input.finalScriptSig!;
      const sigLength = scriptSig[0]!;
      const der = scriptSig.subarray(1, 1 + sigLength - 1);
      const pushedKey = scriptSig.subarray(1 + sigLength + 1);
      expect(bytesToHex(pushedKey)).toBe(bytesToHex(pubkey));
      const z = sha256(sha256(legacySighashPreimageAt(unsigned, index, scriptCodes[index]!, found.nonce)));
      const signature = signatureFromDer(der);
      expect(secp.verify(signature.toBytes('compact'), z, pubkey, { lowS: true, prehash: false })).toBe(true);
    }

    // Stripping the scriptSigs gives back the reviewed transaction plus the nonce fields.
    expect(() => assertOnlyNonceChanged(bytesToHex(unsigned), bytesToHex(unsignedFormOf(signed)))).not.toThrow();
  });

  it('uses a different ECDSA nonce for every input', () => {
    const { unsigned, scriptCodes } = spend(true, 3);
    const template = prepareLegacyHunt(unsigned, scriptCodes, PRIVATE_KEY, true);
    const rs = new Set(template.inputs.map(input => input.r.toString(16)));
    expect(rs.size).toBe(3);
  });

  it('keeps every candidate the same length, skipping the rare s that DER would shorten', () => {
    const { unsigned, scriptCodes } = spend(true);
    const template = prepareLegacyHunt(unsigned, scriptCodes, PRIVATE_KEY, true);
    const result = mineLegacyRange(template, 0, 3_000, 32);
    // About one in 256 attempts is skipped, so a few of 3,000 are not counted.
    expect(result.attempts).toBeLessThanOrEqual(3_000);
    expect(result.attempts).toBeGreaterThan(2_900);
    for (const nonce of [0, 1, 2, 3]) {
      const signed = legacySignedTransaction(template, nonce);
      if (signed) expect(signed.length).toBe(template.signed.length);
    }
  });

  it('refuses a mismatched scriptCode count and a signed transaction', () => {
    const { unsigned, scriptCodes } = spend(true, 2);
    expect(() => prepareLegacyHunt(unsigned, scriptCodes.slice(0, 1), PRIVATE_KEY, true)).toThrow('one scriptCode per input');
    const template = prepareLegacyHunt(unsigned, scriptCodes, PRIVATE_KEY, true);
    const signed = legacySignedTransaction(template, 5)!;
    expect(() => prepareLegacyHunt(signed, scriptCodes, PRIVATE_KEY, true)).toThrow('signed');
  });

  it('rejects a tampered signature', () => {
    const { unsigned, scriptCodes } = spend(true);
    const template = prepareLegacyHunt(unsigned, scriptCodes, PRIVATE_KEY, true);
    const signed = legacySignedTransaction(template, 9)!;
    const at = template.inputs[0]!.sOffset + 5;
    signed[at] = signed[at]! ^ 1;
    expect(() => verifyLegacySignatures(template, signed, 9)).toThrow('does not verify');
  });
});

/** Minimal DER decoder: 30 len 02 rlen r 02 slen s. */
function signatureFromDer(der: Uint8Array): secp.Signature {
  expect(der[0]).toBe(0x30);
  const rLength = der[3]!;
  const r = BigInt('0x' + bytesToHex(der.subarray(4, 4 + rLength)));
  const sLength = der[5 + rLength]!;
  const s = BigInt('0x' + bytesToHex(der.subarray(6 + rLength, 6 + rLength + sLength)));
  return new secp.Signature(r, s);
}

function legacySighashPreimageAt(unsigned: Uint8Array, index: number, scriptCode: Uint8Array, lockTime: number): Uint8Array {
  const final = new Uint8Array(unsigned);
  // The template signs with every sequence final; mirror that before building the preimage.
  const tx = btc.Transaction.fromRaw(final, { allowUnknownOutputs: true, allowUnknownInputs: true });
  const rebuilt = new btc.Transaction({ allowUnknownOutputs: true, allowUnknownInputs: true, lockTime });
  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    rebuilt.addInput({ txid: input.txid!, index: input.index!, sequence: 0xffffffff });
  }
  for (let i = 0; i < tx.outputsLength; i++) rebuilt.addOutput(tx.getOutput(i));
  return legacySighashPreimage(rebuilt.toBytes(true, false), index, scriptCode);
}
