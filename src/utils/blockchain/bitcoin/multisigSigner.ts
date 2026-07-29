/**
 * Specialized signer for Counterparty bare multisig outputs.
 *
 * These inputs cannot go through @scure/btc-signer's standard sign/finalize
 * path: OutScript.decode validates every multisig pubkey as a curve point,
 * and Counterparty data-encoding "pubkeys" are usually not valid points.
 * Instead we parse the script ourselves, compute the legacy sighash via the
 * library's preimageLegacy, sign directly, and construct the 1-of-N scriptSig
 * (OP_0 <sig>) by hand. The scriptSig of a bare multisig spend contains only
 * signatures, so this single construction covers every Counterparty layout
 * regardless of which key slot is ours or whether the data slots decode as
 * valid pubkeys.
 */

import { Transaction, SigHash } from '@scure/btc-signer';
import { signECDSA } from '@scure/btc-signer/utils.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export interface ParsedBareMultisig {
  requiredSignatures: number;
  pubkeys: Uint8Array[];
}

/**
 * Parse a bare multisig script without validating pubkeys as curve points.
 * Mirrors the recovery API's classifier: OP_m, then only 33- or 65-byte
 * pushes, then OP_n OP_CHECKMULTISIG with n matching the push count.
 *
 * @returns Parsed script, or null if the script is not that exact shape
 */
export function parseBareMultisig(script: Uint8Array): ParsedBareMultisig | null {
  if (script.length < 4) return null;

  let offset = 0;
  const requiredOpcode = script[offset++];
  if (requiredOpcode < 0x51 || requiredOpcode > 0x60) return null;

  const pubkeys: Uint8Array[] = [];
  while (offset < script.length - 2) {
    const length = script[offset++];
    if (length !== 33 && length !== 65) return null;
    if (offset + length > script.length - 2) return null;
    pubkeys.push(script.slice(offset, offset + length));
    offset += length;
  }

  if (offset + 2 !== script.length) return null;
  const countOpcode = script[offset++];
  if (countOpcode < 0x51 || countOpcode > 0x60 || script[offset] !== 0xae) return null;

  const requiredSignatures = requiredOpcode - 0x50;
  if (countOpcode - 0x50 !== pubkeys.length || requiredSignatures > pubkeys.length) return null;

  return { requiredSignatures, pubkeys };
}

/**
 * Assert that a script is a bare multisig we can fully sign on our own:
 * 1-of-N with one of our keys in a key slot. The recovery API only serves
 * such outputs; this guards against malformed or unexpected data reaching
 * the signer, where an unsignable input would otherwise surface as an
 * invalid transaction at broadcast time.
 *
 * @param script - The scriptPubKey to check
 * @param ourPubkeys - Acceptable encodings of our key (compressed and uncompressed)
 * @returns The parsed script
 * @throws If the script is not a 1-of-N bare multisig containing one of our keys
 */
export function assertSignableBareMultisig(
  script: Uint8Array,
  ourPubkeys: Uint8Array[]
): ParsedBareMultisig {
  const parsed = parseBareMultisig(script);
  if (!parsed) {
    throw new Error('not a bare multisig script');
  }
  if (parsed.requiredSignatures !== 1) {
    throw new Error(
      `unsupported ${parsed.requiredSignatures}-of-${parsed.pubkeys.length} multisig: only 1-of-N can be signed with a single key`
    );
  }
  const ourKeyHexes = ourPubkeys.map(bytesToHex);
  const hasOurKey = parsed.pubkeys.some((key) => ourKeyHexes.includes(bytesToHex(key)));
  if (!hasOurKey) {
    throw new Error('script does not contain our public key');
  }
  return parsed;
}

/**
 * Sign and finalize every input of a bare multisig consolidation transaction.
 * All inputs must be 1-of-N bare multisig locked by the corresponding entry
 * in `scripts` (see assertSignableBareMultisig).
 *
 * Yields to the event loop periodically: preimageLegacy re-serializes the
 * whole transaction per input, so large batches take seconds of CPU and
 * would otherwise freeze the extension popup.
 *
 * @param tx - Transaction with all inputs and outputs already added
 * @param privateKey - Private key bytes
 * @param scripts - scriptPubKey of the output each input spends, by input index
 */
export async function signAndFinalizeBareMultisig(
  tx: Transaction,
  privateKey: Uint8Array,
  scripts: Uint8Array[]
): Promise<void> {
  if (tx.inputsLength !== scripts.length) {
    throw new Error(`Input count mismatch: tx has ${tx.inputsLength}, provided ${scripts.length} scripts`);
  }

  // preimageLegacy is private API: the public sign()/finalize() path refuses
  // inputs whose multisig pubkeys are not valid curve points. The pinned
  // dependency plus the real-signature tests in multisigSigner.test.ts guard
  // this access across library upgrades.
  const preimageLegacy = (tx as any).preimageLegacy;
  if (typeof preimageLegacy !== 'function') {
    throw new Error('preimageLegacy method not accessible');
  }

  for (let i = 0; i < scripts.length; i++) {
    if (i > 0 && i % 25 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const hash = preimageLegacy.call(tx, i, scripts[i], SigHash.ALL);
    const signature = signECDSA(hash, privateKey, (tx as any).opts?.lowR);

    // scriptSig: OP_0 <sig||sighash> (OP_0 feeds CHECKMULTISIG's extra pop)
    const scriptSig = new Uint8Array(2 + signature.length + 1);
    scriptSig[0] = 0x00;
    scriptSig[1] = signature.length + 1;
    scriptSig.set(signature, 2);
    scriptSig[2 + signature.length] = SigHash.ALL;

    tx.updateInput(i, { finalScriptSig: scriptSig }, true);
  }
}
