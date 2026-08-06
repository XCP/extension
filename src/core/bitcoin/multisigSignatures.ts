import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes } from '@noble/hashes/utils.js';
import * as secp from '@noble/secp256k1';
import { OutScript, SigHash, Transaction } from '@scure/btc-signer';
import { parseDERSignature } from '@/core/bitcoin/bip322';

/**
 * Check that a signature was really produced for this transaction by this key.
 *
 * Combining signatures is the one place the wallet is handed material it did not create: the
 * counterparty's signature arrives as a hex blob, out of band, from someone the wallet cannot
 * ask. Pasting it into a scriptSig and broadcasting means trusting that blob.
 *
 * It does not have to. A bare multisig signature commits to the legacy sighash of a specific
 * input of a specific transaction, so the same signature cannot be valid for different outputs.
 * Recomputing that sighash and verifying against the claimed public key turns "this looks like a
 * signature" into "this key signed exactly this transaction" — which is the claim the feature
 * exists to make. A signature that does not verify is refused rather than broadcast to fail on
 * the network, where the reason would be far less legible.
 */

export interface SignatureCheck {
  ok: boolean;
  error?: string;
}

/** DER signature followed by the one-byte sighash flag, as it appears in a scriptSig. */
function splitDerAndSighashType(signature: Uint8Array): { der: Uint8Array; hashType: number } | null {
  if (signature.length < 9) return null;
  return {
    der: signature.slice(0, -1),
    hashType: signature[signature.length - 1]!,
  };
}

/**
 * Rebuild the m-of-n script the signatures commit to. The prevout is not in the unsigned
 * transaction, but a bare multisig script is exactly its pubkeys and threshold, both of which the
 * caller supplies — so it can be reconstructed rather than trusted.
 */
export function buildBareMultisigScript(pubkeys: Uint8Array[], m: number): Uint8Array {
  return OutScript.encode({ type: 'ms', m, pubkeys });
}

/**
 * The legacy (pre-segwit) signature hash, which is what a bare multisig input is signed with.
 *
 * Built from the public serialisation rather than @scure's preimageLegacy, which is private in
 * its types: depending on an unexported method would put a signing-path check one minor version
 * away from breaking. The algorithm is small and fixed - every input's scriptSig is cleared, the
 * one being signed carries the script instead, and the four-byte hash type is appended before a
 * double SHA-256.
 */
function legacySighash(
  source: Transaction,
  inputIndex: number,
  script: Uint8Array,
  hashType: number
): Uint8Array {
  const copy = new Transaction({
    version: source.version,
    lockTime: source.lockTime,
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
    allowLegacyWitnessUtxo: true,
    disableScriptCheck: true,
    allowUnknown: true,
  });

  // Outputs first: setting a scriptSig below marks the transaction as signed, after which
  // @scure refuses to accept new outputs.
  for (let i = 0; i < source.outputsLength; i += 1) {
    const output = source.getOutput(i);
    copy.addOutput({ script: output.script!, amount: output.amount! });
  }
  for (let i = 0; i < source.inputsLength; i += 1) {
    const input = source.getInput(i);
    copy.addInput({
      txid: input.txid!,
      index: input.index!,
      sequence: input.sequence ?? 0xffffffff,
      // Only the input being signed carries a script; the rest are emptied.
      ...(i === inputIndex ? { finalScriptSig: script } : {}),
    });
  }

  const serialized = copy.toBytes(true, false);
  const withHashType = new Uint8Array(serialized.length + 4);
  withHashType.set(serialized);
  new DataView(withHashType.buffer).setUint32(serialized.length, hashType, true);
  return sha256(sha256(withHashType));
}

/**
 * Verify one signature against the transaction's own sighash for the given input.
 *
 * @param rawTxHex   the transaction the signature is claimed to be for
 * @param inputIndex which input the multisig script secures
 * @param script     the bare multisig script, from buildBareMultisigScript
 * @param signature  DER signature with its trailing sighash byte
 * @param pubkey     the key the signature is claimed to come from
 */
export function verifyMultisigSignature(
  rawTxHex: string,
  inputIndex: number,
  script: Uint8Array,
  signature: Uint8Array,
  pubkey: Uint8Array
): SignatureCheck {
  const split = splitDerAndSighashType(signature);
  if (!split) {
    return { ok: false, error: 'Signature is too short to be a DER signature with a sighash byte.' };
  }
  if (split.hashType !== SigHash.ALL) {
    // Anything else commits to a subset of the transaction, so combining it would let the parts
    // not covered be changed after signing.
    return { ok: false, error: `Signature uses sighash 0x${split.hashType.toString(16)}; only SIGHASH_ALL is accepted here.` };
  }

  let tx: Transaction;
  try {
    tx = Transaction.fromRaw(hexToBytes(rawTxHex.replace(/^0x/, '')), {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      allowLegacyWitnessUtxo: true,
      disableScriptCheck: true,
    });
  } catch {
    return { ok: false, error: 'The transaction could not be read.' };
  }

  if (inputIndex < 0 || inputIndex >= tx.inputsLength) {
    return { ok: false, error: `Input ${inputIndex} does not exist in this transaction.` };
  }

  let sighash: Uint8Array;
  try {
    sighash = legacySighash(tx, inputIndex, script, split.hashType);
  } catch {
    return { ok: false, error: 'The signature hash for this input could not be computed.' };
  }

  // @noble/secp256k1 v3 verifies compact signatures only, so the DER the wire carries is
  // converted with the parser the BIP-322 path already uses.
  const compact = parseDERSignature(split.der);
  if (!compact) {
    return { ok: false, error: 'Signature is not valid DER.' };
  }

  try {
    if (!secp.verify(compact, sighash, pubkey)) {
      return { ok: false, error: 'Signature does not match this public key for this transaction.' };
    }
  } catch {
    return { ok: false, error: 'Signature could not be checked; it may be malformed.' };
  }

  return { ok: true };
}

/**
 * Verify every signature, each against the key it is paired with.
 *
 * Order matters beyond correctness: a bare multisig scriptSig must present signatures in the same
 * order as the pubkeys in the script, so pairing them here is also what makes the resulting
 * scriptSig valid.
 */
export function verifyMultisigSignatures(
  rawTxHex: string,
  inputIndex: number,
  pubkeys: Uint8Array[],
  signatures: Uint8Array[],
  m: number
): SignatureCheck {
  if (signatures.length !== pubkeys.length) {
    return { ok: false, error: 'Each signature must be paired with the public key that produced it.' };
  }

  let script: Uint8Array;
  try {
    script = buildBareMultisigScript(pubkeys, m);
  } catch {
    return { ok: false, error: 'A multisig script could not be built from these public keys.' };
  }

  for (let i = 0; i < signatures.length; i += 1) {
    const result = verifyMultisigSignature(rawTxHex, inputIndex, script, signatures[i]!, pubkeys[i]!);
    if (!result.ok) {
      return { ok: false, error: `Signature ${i + 1}: ${result.error}` };
    }
  }

  return { ok: true };
}
export { legacySighash as legacySighashForTest };
