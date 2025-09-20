/**
 * Specialized signer for bare multisig transactions.
 * 
 * Handles all bare multisig cases:
 * - Standard compressed keys
 * - Uncompressed keys
 * - Non-standard "pubkeys" (Counterparty data encoding)
 * 
 * Similar to uncompressedSigner, but with both custom sign AND finalize methods
 * to handle the special requirements of bare multisig, especially Counterparty's
 * use of invalid "pubkeys" for data encoding.
 */

import { Transaction, SigHash, OutScript } from '@scure/btc-signer';
import { signECDSA } from '@scure/btc-signer/utils.js';
import { bytesToHex } from '@noble/hashes/utils';

/**
 * Input classification for signing strategy.
 */
export interface MultisigInputInfo {
  signType: 'compressed' | 'uncompressed' | 'invalid-pubkeys';
  scriptPubKey: Uint8Array;
  ourKeyIsCompressed?: boolean;
  ourKeyIsUncompressed?: boolean;
}

/**
 * Analyzes a bare multisig script to determine how to sign it.
 * 
 * @param scriptPubKey - The script to analyze
 * @param compressedPubkey - Our compressed public key
 * @param uncompressedPubkey - Our uncompressed public key
 * @returns Input info or null if not a valid multisig for us
 */
export function analyzeMultisigScript(
  scriptPubKey: Uint8Array,
  compressedPubkey: Uint8Array,
  uncompressedPubkey: Uint8Array
): MultisigInputInfo | null {
  const compressedHex = bytesToHex(compressedPubkey);
  const uncompressedHex = bytesToHex(uncompressedPubkey);
  
  try {
    // Try standard decoding first
    const decoded = OutScript.decode(scriptPubKey);
    
    if (decoded.type !== 'ms') {
      return null; // Not a multisig
    }
    
    // Check if we have our key
    const hasCompressed = decoded.pubkeys.some((pk: Uint8Array) => bytesToHex(pk) === compressedHex);
    const hasUncompressed = decoded.pubkeys.some((pk: Uint8Array) => bytesToHex(pk) === uncompressedHex);
    
    if (!hasCompressed && !hasUncompressed) {
      return null; // Doesn't contain our key
    }
    
    return {
      signType: hasUncompressed ? 'uncompressed' : 'compressed',
      scriptPubKey,
      ourKeyIsCompressed: hasCompressed,
      ourKeyIsUncompressed: hasUncompressed
    };
    
  } catch (decodeError) {
    // OutScript.decode failed - likely has invalid "pubkeys" (Counterparty data)
    // Do a manual check to see if our key is present
    const scriptHex = bytesToHex(scriptPubKey);
    
    // Check if our keys appear in the script
    const hasCompressed = scriptHex.includes(compressedHex.toLowerCase());
    const hasUncompressed = scriptHex.includes(uncompressedHex.toLowerCase());
    
    if (!hasCompressed && !hasUncompressed) {
      return null; // Doesn't contain our key
    }
    
    return {
      signType: 'invalid-pubkeys',
      scriptPubKey,
      ourKeyIsCompressed: hasCompressed,
      ourKeyIsUncompressed: hasUncompressed
    };
  }
}

/**
 * Signs a bare multisig input using the appropriate method.
 * 
 * @param tx - The transaction
 * @param inputIdx - Index of the input to sign
 * @param privateKey - Private key bytes
 * @param inputInfo - Information about this input
 */
function signMultisigInput(
  tx: Transaction,
  inputIdx: number,
  privateKey: Uint8Array,
  compressedPubkey: Uint8Array,
  uncompressedPubkey: Uint8Array,
  inputInfo: MultisigInputInfo
): void {
  // Get the preimage hash for signing
  const preimageLegacy = (tx as any).preimageLegacy;
  if (typeof preimageLegacy !== 'function') {
    throw new Error('preimageLegacy method not accessible');
  }
  
  const hash = preimageLegacy.call(tx, inputIdx, inputInfo.scriptPubKey, SigHash.ALL);
  const sig = signECDSA(hash, privateKey, (tx as any).opts?.lowR);
  
  // Append sighash byte
  const sigWithHash = new Uint8Array(sig.length + 1);
  sigWithHash.set(sig);
  sigWithHash[sig.length] = SigHash.ALL;
  
  // Determine which pubkey to use based on the input type
  let pubkeyToUse: Uint8Array;
  if (inputInfo.signType === 'uncompressed' || 
      (inputInfo.signType === 'invalid-pubkeys' && inputInfo.ourKeyIsUncompressed && !inputInfo.ourKeyIsCompressed)) {
    pubkeyToUse = uncompressedPubkey;
  } else {
    pubkeyToUse = compressedPubkey;
  }
  
  // Set partialSig for inputs that btc-signer can finalize
  if (inputInfo.signType !== 'invalid-pubkeys') {
    tx.updateInput(inputIdx, { partialSig: [[pubkeyToUse, sigWithHash]] }, true);
  } else {
    // For invalid-pubkeys, set finalScriptSig directly to bypass validation
    // Construct the scriptSig: OP_0 <signature>
    const scriptSig = new Uint8Array(1 + 1 + sigWithHash.length);
    scriptSig[0] = 0x00; // OP_0
    scriptSig[1] = sigWithHash.length;
    scriptSig.set(sigWithHash, 2);
    
    tx.updateInput(inputIdx, { finalScriptSig: scriptSig }, true);
  }
}

/**
 * Signs all bare multisig inputs in a transaction.
 * 
 * @param tx - The transaction to sign
 * @param privateKey - Private key bytes
 * @param compressedPubkey - Compressed public key
 * @param uncompressedPubkey - Uncompressed public key
 * @param inputInfos - Information about each input
 */
export function signBareMultisigTransaction(
  tx: Transaction,
  privateKey: Uint8Array,
  compressedPubkey: Uint8Array,
  uncompressedPubkey: Uint8Array,
  inputInfos: MultisigInputInfo[]
): void {
  if (tx.inputsLength !== inputInfos.length) {
    throw new Error(`Input count mismatch: tx has ${tx.inputsLength}, provided ${inputInfos.length} infos`);
  }
  
  // Sign each input based on its type
  for (let i = 0; i < tx.inputsLength; i++) {
    signMultisigInput(tx, i, privateKey, compressedPubkey, uncompressedPubkey, inputInfos[i]);
  }
}

/**
 * Finalizes all bare multisig inputs in a transaction.
 * Handles compressed, uncompressed, and invalid-pubkey inputs.
 * 
 * @param tx - The transaction to finalize
 * @param inputInfos - Information about each input
 */
export function finalizeBareMultisigTransaction(
  tx: Transaction,
  inputInfos: MultisigInputInfo[]
): void {
  if (tx.inputsLength !== inputInfos.length) {
    throw new Error(`Input count mismatch: tx has ${tx.inputsLength}, provided ${inputInfos.length} infos`);
  }

  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    const info = inputInfos[i];

    // Skip if already finalized (invalid-pubkeys are finalized during signing)
    if (input.finalScriptSig && input.finalScriptSig.length > 0) {
      console.log(`Input ${i} already finalized, skipping. Length: ${input.finalScriptSig.length}`);
      continue;
    }

    if (info.signType === 'invalid-pubkeys') {
      // This should have been handled during signing
      throw new Error(`Input ${i} with invalid pubkeys was not finalized during signing`);
    }

    // For compressed and uncompressed, use btc-signer's finalize
    // It should work since we used partialSig
    try {
      tx.finalizeIdx(i);
      console.log(`Input ${i} finalized via btc-signer`);
    } catch (e) {
      console.log(`Input ${i} btc-signer finalize failed, using manual construction:`, e);
      // If btc-signer's finalize fails, manually construct the scriptSig
      if (input.partialSig && input.partialSig.length > 0) {
        const sig = input.partialSig[0][1];
        const scriptSig = new Uint8Array(1 + 1 + sig.length);
        scriptSig[0] = 0x00; // OP_0
        scriptSig[1] = sig.length;
        scriptSig.set(sig, 2);

        tx.updateInput(i, { finalScriptSig: scriptSig }, true);
        console.log(`Input ${i} manually finalized with scriptSig length: ${scriptSig.length}`);
      } else {
        throw new Error(`Failed to finalize input ${i}: ${e}`);
      }
    }
  }
}

/**
 * Complete signing and finalization for bare multisig transactions.
 * This is the main entry point that handles everything.
 * 
 * @param tx - The transaction to sign and finalize
 * @param privateKey - Private key bytes
 * @param compressedPubkey - Compressed public key
 * @param uncompressedPubkey - Uncompressed public key
 * @param inputInfos - Information about each input
 */
export function signAndFinalizeBareMultisig(
  tx: Transaction,
  privateKey: Uint8Array,
  compressedPubkey: Uint8Array,
  uncompressedPubkey: Uint8Array,
  inputInfos: MultisigInputInfo[]
): void {
  // Sign all inputs
  signBareMultisigTransaction(tx, privateKey, compressedPubkey, uncompressedPubkey, inputInfos);
  
  // Finalize all inputs
  finalizeBareMultisigTransaction(tx, inputInfos);
}