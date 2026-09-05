import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, SigHash, Transaction } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import {
  extractPresignedExternalP2wpkhInput,
  importVerifiedHardwareP2wpkhSignatures,
} from '@/core/bitcoin/hardwarePsbt';
import { finalizePSBT, parsePSBT } from '@/core/bitcoin/psbt';

const privateKey = hexToBytes('11'.repeat(32));
const publicKey = getPublicKey(privateKey, true);
const payment = p2wpkh(publicKey);

interface TransactionShape {
  version?: number;
  lockTime?: number;
  sequence?: number;
  txidByte?: number;
  outputAmount?: bigint;
}

const transaction = (shape: TransactionShape = {}): Transaction => {
  const tx = new Transaction({
    version: shape.version ?? 2,
    lockTime: shape.lockTime ?? 840_000,
  });
  tx.addInput({
    txid: new Uint8Array(32).fill(shape.txidByte ?? 0x22),
    index: 3,
    sequence: shape.sequence ?? 0xfffffffd,
    witnessUtxo: { amount: 100_000n, script: payment.script },
    sighashType: SigHash.ALL,
  });
  tx.addOutput({
    amount: shape.outputAmount ?? 90_000n,
    script: p2wpkh(getPublicKey(hexToBytes('33'.repeat(32)), true)).script,
  });
  return tx;
};

const signedRaw = (shape: TransactionShape = {}): string => {
  const tx = transaction(shape);
  tx.signIdx(privateKey, 0, [SigHash.ALL]);
  tx.finalize();
  return tx.hex;
};

const externalPrivateKey = hexToBytes('22'.repeat(32));
const externalPayment = p2wpkh(getPublicKey(externalPrivateKey, true));

const exactOfferAcceptance = (): { psbt: string; raw: string } => {
  const tx = new Transaction({ version: 2, lockTime: 840_000 });
  tx.addInput({
    txid: new Uint8Array(32).fill(0x41),
    index: 0,
    sequence: 0xfffffffd,
    witnessUtxo: { amount: 120_000n, script: externalPayment.script },
    sighashType: SigHash.ALL,
  });
  tx.addInput({
    txid: new Uint8Array(32).fill(0x42),
    index: 1,
    sequence: 0xfffffffe,
    witnessUtxo: { amount: 330n, script: payment.script },
    sighashType: SigHash.ALL,
  });
  tx.addOutput({ amount: 100_330n, script: payment.script });
  tx.addOutput({ amount: 19_000n, script: externalPayment.script });
  tx.signIdx(externalPrivateKey, 0, [SigHash.ALL]);
  const psbt = bytesToHex(tx.toPSBT());

  tx.signIdx(privateKey, 1, [SigHash.ALL]);
  tx.finalize();
  return { psbt, raw: tx.hex };
};

describe('extractPresignedExternalP2wpkhInput', () => {
  it('verifies and serializes an exact-offer buyer input for Trezor', () => {
    const { psbt } = exactOfferAcceptance();

    const external = extractPresignedExternalP2wpkhInput(psbt, 0);

    expect(external).toEqual({
      scriptPubKey: bytesToHex(externalPayment.script),
      scriptSig: '',
      witness: expect.stringMatching(/^02/),
    });
  });

  it('rejects an unsigned external input', () => {
    expect(() => extractPresignedExternalP2wpkhInput(bytesToHex(transaction().toPSBT()), 0))
      .toThrow(/must already be signed/);
  });
});

describe('importVerifiedHardwareP2wpkhSignatures', () => {
  it('returns a PSBT that finalizes to the exact hardware transaction', () => {
    const originalPsbt = bytesToHex(transaction().toPSBT());
    const raw = signedRaw();

    const signedPsbt = importVerifiedHardwareP2wpkhSignatures(originalPsbt, raw, [0]);

    expect(finalizePSBT(signedPsbt)).toBe(raw);
    expect(parsePSBT(signedPsbt).getInput(0).partialSig).toHaveLength(1);
  });

  it('preserves a verified external signature while importing the seller signature', () => {
    const { psbt, raw } = exactOfferAcceptance();

    const signedPsbt = importVerifiedHardwareP2wpkhSignatures(psbt, raw, [1]);

    expect(finalizePSBT(signedPsbt)).toBe(raw);
    expect(parsePSBT(signedPsbt).getInput(0).partialSig).toHaveLength(1);
    expect(parsePSBT(signedPsbt).getInput(1).partialSig).toHaveLength(1);
  });

  it.each([
    ['version', { version: 1 }, /version/],
    ['locktime', { lockTime: 840_001 }, /locktime/],
    ['outpoint', { txidByte: 0x23 }, /outpoint/],
    ['sequence', { sequence: 0xfffffffc }, /sequence/],
    ['output', { outputAmount: 89_999n }, /output/],
  ] as const)('rejects a changed %s even when the changed transaction is validly signed', (_, shape, error) => {
    const originalPsbt = bytesToHex(transaction().toPSBT());
    expect(() => importVerifiedHardwareP2wpkhSignatures(originalPsbt, signedRaw(shape), [0]))
      .toThrow(error);
  });

  it('rejects a corrupted hardware signature', () => {
    const originalPsbt = bytesToHex(transaction().toPSBT());
    const signed = Transaction.fromRaw(hexToBytes(signedRaw()));
    const witness = signed.getInput(0).finalScriptWitness!.map(item => item.slice());
    witness[0]![10] = witness[0]![10]! ^ 0x01;
    signed.updateInput(0, { finalScriptWitness: witness }, true);

    expect(() => importVerifiedHardwareP2wpkhSignatures(originalPsbt, signed.hex, [0]))
      .toThrow(/invalid signature|malformed DER/);
  });

  it.each(['r', 's'] as const)('rejects a valid scalar encoded as a non-minimal DER %s integer', integer => {
    const signed = Transaction.fromRaw(hexToBytes(signedRaw()));
    const witness = signed.getInput(0).finalScriptWitness!.map(item => item.slice());
    const signature = witness[0]!;
    const lengthOffset = integer === 'r' ? 3 : 5 + signature[3]!;
    const valueOffset = lengthOffset + 1;
    const malformed = new Uint8Array(signature.length + 1);
    malformed.set(signature.slice(0, valueOffset));
    malformed[1] = malformed[1]! + 1;
    malformed[lengthOffset] = malformed[lengthOffset]! + 1;
    malformed[valueOffset] = 0;
    malformed.set(signature.slice(valueOffset), valueOffset + 1);
    signed.updateInput(0, { finalScriptWitness: [malformed, witness[1]!] }, true);
    expect(() => importVerifiedHardwareP2wpkhSignatures(bytesToHex(transaction().toPSBT()), signed.hex, [0]))
      .toThrow('non-minimal DER integer');
  });

  it('rejects empty, duplicate, and non-P2WPKH input selections', () => {
    const originalPsbt = bytesToHex(transaction().toPSBT());
    expect(() => importVerifiedHardwareP2wpkhSignatures(originalPsbt, signedRaw(), []))
      .toThrow(/at least one input/);
    expect(() => importVerifiedHardwareP2wpkhSignatures(originalPsbt, signedRaw(), [0, 0]))
      .toThrow(/duplicates/);

    const legacy = transaction();
    legacy.updateInput(0, {
      witnessUtxo: {
        amount: 100_000n,
        script: hexToBytes('76a914' + '44'.repeat(20) + '88ac'),
      },
    });
    expect(() => importVerifiedHardwareP2wpkhSignatures(bytesToHex(legacy.toPSBT()), signedRaw(), [0]))
      .toThrow(/not P2WPKH/);
  });
});
