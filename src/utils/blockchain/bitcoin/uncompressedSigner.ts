/**
 * Utility functions for signing Bitcoin transactions with uncompressed public keys.
 * 
 * @scure/btc-signer v2 doesn't natively support uncompressed keys, so we need
 * custom signing logic that bypasses the library's built-in signing and uses
 * the internal preimageLegacy method directly.
 */

import { Transaction, SigHash } from '@scure/btc-signer';
import { signECDSA } from '@scure/btc-signer/utils';

/**
 * Concatenates multiple Uint8Arrays into a single Uint8Array.
 */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Signs a single input using uncompressed public key.
 * This bypasses the built-in signing which only handles compressed keys.
 * 
 * @param tx - The transaction to sign
 * @param idx - The input index to sign
 * @param privateKey - The private key bytes
 * @param pubkeyUncompressed - The uncompressed public key bytes
 * @param prevOutputScript - The script from the previous output being spent
 * @param sighash - The signature hash type (default: ALL)
 */
export function signInputWithUncompressedKey(
  tx: Transaction,
  idx: number,
  privateKey: Uint8Array,
  pubkeyUncompressed: Uint8Array,
  prevOutputScript: Uint8Array,
  sighash: number = SigHash.ALL
): void {
  // Access the transaction's legacy preimage routine
  const preimageLegacy = (tx as any).preimageLegacy;
  if (typeof preimageLegacy !== 'function') {
    throw new Error('preimageLegacy method not accessible');
  }
  
  // Get the hash to sign using the previous output's script
  const hash: Uint8Array = preimageLegacy.call(tx, idx, prevOutputScript, sighash);
  
  // Sign the hash using signECDSA
  const sig: Uint8Array = signECDSA(hash, privateKey, (tx as any).opts?.lowR);
  
  // Append the sighash type byte
  const sigWithHash: Uint8Array = concatBytes(
    sig,
    new Uint8Array([sighash !== SigHash.DEFAULT ? sighash : 0])
  );
  
  // Update this input's partial signature with the uncompressed public key
  tx.updateInput(idx, { partialSig: [[pubkeyUncompressed, sigWithHash]] }, true);
}

/**
 * Hybrid signing approach: first attempts standard signing, then falls back
 * to custom signing for inputs that require uncompressed keys.
 * 
 * @param tx - The transaction to sign
 * @param privateKey - The private key bytes
 * @param publicKeyCompressed - The compressed public key bytes
 * @param publicKeyUncompressed - The uncompressed public key bytes
 * @param prevOutputScripts - Array of previous output scripts for each input (optional - will use redeemScript if not provided)
 * @param checkForUncompressed - Function to check if an input needs uncompressed signing
 * @param skipStandardSigning - Skip btc-signer's standard signing (needed for Counterparty multisigs with invalid data "pubkeys")
 */
export function hybridSignTransaction(
  tx: Transaction,
  privateKey: Uint8Array,
  publicKeyCompressed: Uint8Array,
  publicKeyUncompressed: Uint8Array,
  prevOutputScripts?: Uint8Array[],
  checkForUncompressed?: (inputIndex: number) => boolean,
  skipStandardSigning?: boolean  // New parameter to skip standard signing for problematic inputs
): void {
  // First, attempt standard signing with compressed key (unless we know it will fail)
  if (!skipStandardSigning) {
    try {
      tx.sign(privateKey);
      
      // If successful and no uncompressed check needed, we're done
      if (!checkForUncompressed) {
        return;
      }
    } catch (e) {
      // Standard signing failed, will try custom signing below
      // This is expected for uncompressed keys or invalid pubkeys
      // Don't log to avoid noise
    }
  }
  
  // Check each input for custom signing requirements
  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    
    // Skip if already signed
    if (input.partialSig && input.partialSig.length > 0) {
      continue;
    }
    
    // When skipStandardSigning is true, we must sign ALL inputs
    // When it's false, only sign inputs that need uncompressed keys
    if (!skipStandardSigning && checkForUncompressed && !checkForUncompressed(i)) {
      continue;
    }
    
    // Get the script to use for signing
    // For bare multisig, the redeemScript is the scriptPubKey itself
    let scriptForSigning: Uint8Array | undefined;
    
    // First check for explicit prevOutputScripts (highest priority)
    if (prevOutputScripts && prevOutputScripts[i]) {
      scriptForSigning = prevOutputScripts[i];
    } 
    // Then check for redeemScript on the input
    else if (input.redeemScript) {
      scriptForSigning = input.redeemScript;
    }
    
    if (!scriptForSigning) {
      console.warn(`No script available for input ${i}, skipping custom signing`);
      continue;
    }
    
    // Determine which pubkey to use based on checkForUncompressed
    const useUncompressed = checkForUncompressed ? checkForUncompressed(i) : false;
    const pubkeyToUse = useUncompressed ? publicKeyUncompressed : publicKeyCompressed;
    
    // Sign with the appropriate key
    signInputWithUncompressedKey(
      tx,
      i,
      privateKey,
      pubkeyToUse,
      scriptForSigning,
      SigHash.ALL
    );
  }
}

/**
 * Signs all inputs of a transaction using uncompressed keys.
 * Used when we know all inputs require uncompressed signing.
 * 
 * @param tx - The transaction to sign
 * @param privateKey - The private key bytes
 * @param pubkeyUncompressed - The uncompressed public key bytes
 * @param prevOutputScripts - Array of previous output scripts for each input
 */
export function signAllInputsWithUncompressedKey(
  tx: Transaction,
  privateKey: Uint8Array,
  pubkeyUncompressed: Uint8Array,
  prevOutputScripts: Uint8Array[]
): void {
  for (let i = 0; i < tx.inputsLength; i++) {
    if (!prevOutputScripts[i]) {
      throw new Error(`Missing previous output script for input ${i}`);
    }
    
    signInputWithUncompressedKey(
      tx,
      i,
      privateKey,
      pubkeyUncompressed,
      prevOutputScripts[i],
      SigHash.ALL
    );
  }
}