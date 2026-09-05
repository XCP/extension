import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as secp256k1 from '@noble/secp256k1';
import { RawWitness, SigHash, Transaction } from '@scure/btc-signer';
import { getPrevOut } from '@scure/btc-signer/transaction.js';
import { hash160 } from '@scure/btc-signer/utils.js';
import { parsePSBT } from '@/core/bitcoin/psbt';

const PSBT_OPTIONS = {
  allowUnknownInputs: true,
  allowUnknownOutputs: true,
  allowLegacyWitnessUtxo: true,
  disableScriptCheck: true,
} as const;

const DEFAULT_SEQUENCE = 0xffffffff;

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

const inputHasSignature = (input: ReturnType<Transaction['getInput']>): boolean => Boolean(
  input?.partialSig?.length
  || input?.tapKeySig
  || input?.finalScriptSig?.length
  || input?.finalScriptWitness?.length
);

const derToCompact = (der: Uint8Array): Uint8Array => {
  if (der.length < 8 || der[0] !== 0x30 || der[1] !== der.length - 2) {
    throw new Error('Hardware wallet returned a malformed DER signature');
  }

  let offset = 2;
  const readInteger = (): Uint8Array => {
    if (der[offset++] !== 0x02) throw new Error('Hardware wallet returned a malformed DER integer');
    const length = der[offset++];
    if (length === undefined || length === 0 || offset + length > der.length) {
      throw new Error('Hardware wallet returned a malformed DER integer length');
    }
    let value = der.slice(offset, offset + length);
    offset += length;
    if ((value[0]! & 0x80) !== 0) throw new Error('Hardware wallet returned a negative DER integer');
    if (value.length > 1 && value[0] === 0) {
      if ((value[1]! & 0x80) === 0) throw new Error('Hardware wallet returned a non-minimal DER integer');
      value = value.slice(1);
    }
    if (value.length > 32) throw new Error('Hardware wallet returned an oversized DER integer');
    const padded = new Uint8Array(32);
    padded.set(value, 32 - value.length);
    return padded;
  };

  const r = readInteger();
  const s = readInteger();
  if (offset !== der.length) throw new Error('Hardware wallet returned trailing DER signature data');

  const compact = new Uint8Array(64);
  compact.set(r, 0);
  compact.set(s, 32);
  return compact;
};

const assertSameUnsignedTransaction = (original: Transaction, signed: Transaction): void => {
  if (original.version !== signed.version) throw new Error('Hardware wallet changed the transaction version');
  if (original.lockTime !== signed.lockTime) throw new Error('Hardware wallet changed the transaction locktime');
  if (original.inputsLength !== signed.inputsLength) throw new Error('Hardware wallet changed the input count');
  if (original.outputsLength !== signed.outputsLength) throw new Error('Hardware wallet changed the output count');

  for (let index = 0; index < original.inputsLength; index++) {
    const expected = original.getInput(index);
    const actual = signed.getInput(index);
    if (!expected?.txid || !actual?.txid || !equalBytes(expected.txid, actual.txid)) {
      throw new Error(`Hardware wallet changed input ${index} outpoint`);
    }
    if (expected.index !== actual.index) throw new Error(`Hardware wallet changed input ${index} outpoint`);
    if ((expected.sequence ?? DEFAULT_SEQUENCE) !== (actual.sequence ?? DEFAULT_SEQUENCE)) {
      throw new Error(`Hardware wallet changed input ${index} sequence`);
    }
  }

  for (let index = 0; index < original.outputsLength; index++) {
    const expected = original.getOutput(index);
    const actual = signed.getOutput(index);
    if (
      !expected?.script
      || !actual?.script
      || expected.amount !== actual.amount
      || !equalBytes(expected.script, actual.script)
    ) {
      throw new Error(`Hardware wallet changed output ${index}`);
    }
  }
};

const verifyP2wpkhWitness = (
  original: Transaction,
  signed: Transaction,
  inputIndex: number,
  requireUnsignedOriginal = true,
): readonly [Uint8Array, Uint8Array] => {
  const originalInput = original.getInput(inputIndex);
  const signedInput = signed.getInput(inputIndex);
  if (!originalInput || !signedInput) throw new Error(`Hardware wallet omitted input ${inputIndex}`);
  if (requireUnsignedOriginal && inputHasSignature(originalInput)) {
    throw new Error(`Hardware PSBT input ${inputIndex} must be unsigned`);
  }
  if (signedInput.finalScriptSig?.length) {
    throw new Error(`Hardware PSBT input ${inputIndex} is not Native SegWit`);
  }

  const prevout = getPrevOut(originalInput);
  const script = prevout.script;
  if (script.length !== 22 || script[0] !== 0x00 || script[1] !== 0x14) {
    throw new Error(`Hardware PSBT input ${inputIndex} is not P2WPKH`);
  }

  const witness = signedInput.finalScriptWitness;
  if (!witness || witness.length !== 2) {
    throw new Error(`Hardware wallet returned an invalid witness for input ${inputIndex}`);
  }
  const signatureWithHashType = witness[0]!;
  const publicKey = witness[1]!;
  if (signatureWithHashType.length < 2 || signatureWithHashType.at(-1) !== SigHash.ALL) {
    throw new Error(`Hardware wallet did not use SIGHASH_ALL for input ${inputIndex}`);
  }
  if (publicKey.length !== 33 || (publicKey[0] !== 0x02 && publicKey[0] !== 0x03)) {
    throw new Error(`Hardware wallet returned an invalid public key for input ${inputIndex}`);
  }

  const publicKeyHash = hash160(publicKey);
  if (!equalBytes(script.slice(2), publicKeyHash)) {
    throw new Error(`Hardware wallet signed input ${inputIndex} with the wrong key`);
  }

  const scriptCode = new Uint8Array(25);
  scriptCode.set([0x76, 0xa9, 0x14], 0);
  scriptCode.set(publicKeyHash, 3);
  scriptCode.set([0x88, 0xac], 23);
  const digest = original.preimageWitnessV0(inputIndex, scriptCode, SigHash.ALL, prevout.amount);
  const compactSignature = derToCompact(signatureWithHashType.slice(0, -1));
  if (!secp256k1.verify(compactSignature, digest, publicKey, { prehash: false })) {
    throw new Error(`Hardware wallet returned an invalid signature for input ${inputIndex}`);
  }

  return [signatureWithHashType.slice(), publicKey.slice()];
};

export interface PresignedExternalP2wpkhInput {
  scriptPubKey: string;
  scriptSig: string;
  witness: string;
}

/**
 * Convert one already-signed P2WPKH PSBT input into Trezor's EXTERNAL input fields.
 * The signature is checked locally before the device independently checks it again.
 */
export function extractPresignedExternalP2wpkhInput(
  psbtHex: string,
  inputIndex: number,
): PresignedExternalP2wpkhInput {
  const original = parsePSBT(psbtHex);
  const input = original.getInput(inputIndex);
  if (!input) throw new Error(`External PSBT input ${inputIndex} does not exist`);
  if (!inputHasSignature(input)) {
    throw new Error(`External PSBT input ${inputIndex} must already be signed`);
  }

  const prevout = getPrevOut(input);
  if (prevout.script.length !== 22 || prevout.script[0] !== 0x00 || prevout.script[1] !== 0x14) {
    throw new Error(`External PSBT input ${inputIndex} is not P2WPKH`);
  }

  const finalized = original.clone();
  if (!finalized.getInput(inputIndex)?.finalScriptWitness?.length) {
    finalized.finalizeIdx(inputIndex);
  }
  const finalizedInput = finalized.getInput(inputIndex);
  if (!finalizedInput?.finalScriptWitness?.length || finalizedInput.finalScriptSig?.length) {
    throw new Error(`External PSBT input ${inputIndex} has invalid P2WPKH signature data`);
  }

  verifyP2wpkhWitness(original, finalized, inputIndex, false);
  return {
    scriptPubKey: bytesToHex(prevout.script),
    scriptSig: '',
    witness: bytesToHex(RawWitness.encode(finalizedInput.finalScriptWitness)),
  };
}

/**
 * Import Trezor's finalized P2WPKH witnesses into the original PSBT.
 *
 * Trezor Connect returns a raw transaction instead of a PSBT. This function keeps the provider
 * contract intact by accepting only an exact SIGHASH_ALL rendering of the reviewed transaction,
 * independently verifying every requested signature, and copying only final witness data back to
 * the original PSBT.
 */
export function importVerifiedHardwareP2wpkhSignatures(
  originalPsbtHex: string,
  signedTxHex: string,
  inputIndices: number[],
): string {
  const original = parsePSBT(originalPsbtHex);
  let signed: Transaction;
  try {
    signed = Transaction.fromRaw(hexToBytes(signedTxHex), PSBT_OPTIONS);
  } catch (error) {
    throw new Error(
      `Hardware wallet returned an invalid transaction: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }

  assertSameUnsignedTransaction(original, signed);
  const uniqueIndices = new Set(inputIndices);
  if (uniqueIndices.size !== inputIndices.length) throw new Error('Hardware signing inputs contain duplicates');
  if (uniqueIndices.size === 0) throw new Error('Hardware PSBT signing requires at least one input');
  for (const index of uniqueIndices) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= original.inputsLength) {
      throw new Error(`Hardware signing input ${index} does not exist`);
    }
  }

  for (const index of uniqueIndices) {
    const [signature, publicKey] = verifyP2wpkhWitness(original, signed, index);
    original.updateInput(index, {
      partialSig: [[publicKey, signature]],
    }, true);
  }

  const reconstructed = original.clone();
  try {
    reconstructed.finalize();
  } catch {
    throw new Error('Hardware PSBT contains an unsigned external input');
  }
  const reconstructedRaw = reconstructed.extract();
  if (bytesToHex(reconstructedRaw) !== signedTxHex.toLowerCase()) {
    throw new Error('Hardware wallet returned unrecognized final transaction data');
  }
  return bytesToHex(original.toPSBT());
}
