import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as secp from '@noble/secp256k1';
import { SigHash, Transaction } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import {
  buildBareMultisigScript,
  legacySighashForTest,
  verifyMultisigSignatures,
} from '@/core/bitcoin/multisigSignatures';

/**
 * Signatures are produced here rather than pasted as fixtures, so the test proves the verifier
 * agrees with a real signing operation instead of agreeing with a blob someone recorded.
 */
const KEY_A = hexToBytes('1'.repeat(64));
const KEY_B = hexToBytes('2'.repeat(64));
const PUB_A = secp.getPublicKey(KEY_A, true);
const PUB_B = secp.getPublicKey(KEY_B, true);
const SCRIPT = buildBareMultisigScript([PUB_A, PUB_B], 2);
const PREV_TXID = 'ab'.repeat(32);

/** Re-encode a compact (r||s) signature as DER, which is what a scriptSig carries. */
function toDer(compact: Uint8Array): Uint8Array {
  const trim = (v: Uint8Array) => {
    let i = 0;
    while (i < v.length - 1 && v[i] === 0) i += 1;
    const t = v.slice(i);
    return t[0]! & 0x80 ? new Uint8Array([0, ...t]) : t;
  };
  const r = trim(compact.slice(0, 32));
  const s = trim(compact.slice(32, 64));
  return new Uint8Array([0x30, 4 + r.length + s.length, 0x02, r.length, ...r, 0x02, s.length, ...s]);
}

/** An unsigned transaction spending one bare multisig input. */
function unsignedTx(outputAmount: bigint): string {
  const tx = new Transaction({
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
    disableScriptCheck: true,
    allowLegacyWitnessUtxo: true,
  });
  tx.addInput({ txid: hexToBytes(PREV_TXID), index: 0, sequence: 0xffffffff });
  tx.addOutput({
    script: hexToBytes('76a914' + '11'.repeat(20) + '88ac'),
    amount: outputAmount,
  });
  return bytesToHex(tx.toBytes(true, false));
}

/** Sign an input the way a counterparty would, returning DER plus the sighash byte. */
function sign(rawTxHex: string, key: Uint8Array, index = 0): Uint8Array {
  const tx = Transaction.fromRaw(hexToBytes(rawTxHex), {
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
    disableScriptCheck: true,
    allowLegacyWitnessUtxo: true,
  });
  const sighash = legacySighashForTest(tx, index, SCRIPT, SigHash.ALL);
  const compact = secp.sign(sighash, key);
  return new Uint8Array([...toDer(compact), SigHash.ALL]);
}

describe('verifying bare multisig signatures before combining', () => {
  const raw = unsignedTx(100000n);

  it('accepts signatures genuinely made for this transaction', () => {
    const result = verifyMultisigSignatures(raw, 0, [PUB_A, PUB_B], [sign(raw, KEY_A), sign(raw, KEY_B)], 2);
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  // The check that matters: a signature over a different transaction must not pass, or the
  // feature would be certifying an authorship claim it never verified.
  it('rejects a signature made for a different transaction', () => {
    const other = unsignedTx(999999n);
    const result = verifyMultisigSignatures(raw, 0, [PUB_A, PUB_B], [sign(raw, KEY_A), sign(other, KEY_B)], 2);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Signature 2/);
  });

  it('rejects a signature from the wrong key', () => {
    const stranger = hexToBytes('3'.repeat(64));
    const result = verifyMultisigSignatures(raw, 0, [PUB_A, PUB_B], [sign(raw, KEY_A), sign(raw, stranger)], 2);
    expect(result.ok).toBe(false);
  });

  // A bare multisig scriptSig must present signatures in pubkey order; swapping them produces a
  // script the network rejects, so it is caught here rather than after broadcast.
  it('rejects signatures paired with the wrong keys', () => {
    const result = verifyMultisigSignatures(raw, 0, [PUB_A, PUB_B], [sign(raw, KEY_B), sign(raw, KEY_A)], 2);
    expect(result.ok).toBe(false);
  });

  it('rejects a sighash type other than ALL', () => {
    const sig = sign(raw, KEY_A);
    sig[sig.length - 1] = SigHash.SINGLE;
    const result = verifyMultisigSignatures(raw, 0, [PUB_A, PUB_B], [sig, sign(raw, KEY_B)], 2);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/SIGHASH_ALL/);
  });

  it('rejects a truncated signature rather than reading past it', () => {
    const result = verifyMultisigSignatures(raw, 0, [PUB_A, PUB_B], [new Uint8Array([1, 2, 3]), sign(raw, KEY_B)], 2);
    expect(result.ok).toBe(false);
  });

  it('rejects an input index the transaction does not have', () => {
    const result = verifyMultisigSignatures(raw, 5, [PUB_A, PUB_B], [sign(raw, KEY_A), sign(raw, KEY_B)], 2);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not exist/);
  });
});
