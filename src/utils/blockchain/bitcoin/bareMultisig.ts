import { Transaction, SigHash, OutScript } from '@scure/btc-signer';
import { signECDSA } from '@scure/btc-signer/utils';
import { quickApiClient, API_TIMEOUTS } from '@/utils/api/axiosConfig';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { getPublicKey } from '@noble/secp256k1';
import { getKeychainSettings } from '@/utils/storage/settingsStorage';
import { toSatoshis } from '@/utils/numeric';
import { hybridSignTransaction } from '@/utils/blockchain/bitcoin';

/* ══════════════════════════════════════════════════════════════════════════
 * TYPE DEFINITIONS
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * UTXO (Unspent Transaction Output) interface.
 */
interface UTXO {
  txid: string;
  vout: number;
  amount: number; // in BTC
  scriptPubKeyHex: string;
  scriptPubKeyType?: string;
  requiredSignatures?: number;
}

/**
 * Internal representation of a valid input ready for transaction building.
 */
interface ValidInput {
  utxo: UTXO;
  scriptPubKey: Uint8Array;
  prevTxHex: string;
  amountSats: bigint;
  needsUncompressed: boolean;
  wasManuallyParsed: boolean; // Track if we had to bypass btc-signer's validation
}

/**
 * Options for consolidation.
 */
interface ConsolidationOptions {
  maxInputsPerTx?: number;  // Limit inputs per transaction for safety (default: 420)
  skipSpentCheck?: boolean; // Skip validation of spent UTXOs (faster but may fail at broadcast)
}

/* ══════════════════════════════════════════════════════════════════════════
 * CONSTANTS
 * ══════════════════════════════════════════════════════════════════════════ */

// Default maximum inputs per transaction to stay well under 100KB limit
const DEFAULT_MAX_INPUTS = 420;

// RBF-enabled sequence number
const RBF_SEQUENCE = 0xfffffffd;

// Estimated signature size for fee calculation
const ESTIMATED_SIGNATURE_SIZE = 74;

// Multisig script format constants
const MULTISIG_OP_1 = '51'; // OP_1 (m=1)
const MULTISIG_OP_3_CHECKMULTISIG = '53ae'; // OP_3 OP_CHECKMULTISIG
const OP_PUSHBYTES_33 = '21'; // For compressed keys (33 bytes)
const OP_PUSHBYTES_65 = '41'; // For uncompressed keys (65 bytes)

/* ══════════════════════════════════════════════════════════════════════════
 * MAIN CONSOLIDATION FUNCTION
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Main consolidator function.
 * Fetches bare multisig UTXOs, creates a new transaction consolidating them, and signs
 * the transaction using hybrid signing (using both the built-in sign() and our custom fallback).
 */
export async function consolidateBareMultisig(
  privateKeyHex: string,
  sourceAddress: string,
  feeRateSatPerVByte: number,
  destinationAddress?: string,
  options?: ConsolidationOptions
): Promise<string> {
  const targetAddress = destinationAddress || sourceAddress;

  if (!privateKeyHex) throw new Error('Private key not found');
  const privateKeyBytes = hexToBytes(privateKeyHex);

  // Generate both compressed and uncompressed public keys.
  const publicKeyCompressed: Uint8Array = getPublicKey(privateKeyBytes, true);
  const publicKeyCompressedHex = bytesToHex(publicKeyCompressed);

  const publicKeyUncompressed: Uint8Array = getPublicKey(privateKeyBytes, false);
  const publicKeyUncompressedHex = bytesToHex(publicKeyUncompressed);

  let utxos = await fetchBareMultisigUTXOs(sourceAddress);
  if (utxos.length === 0) throw new Error('No bare multisig UTXOs found');
  
  console.log(`Found ${utxos.length} potential bare multisig UTXOs to consolidate`);
  
  // Filter out already-spent UTXOs to avoid broadcast failures (unless skipped)
  if (!options?.skipSpentCheck) {
    const unspentUTXOs = await filterUnspentUTXOs(utxos);
    if (unspentUTXOs.length === 0) {
      throw new Error('All UTXOs have already been spent');
    }
    
    if (unspentUTXOs.length < utxos.length) {
      console.log(`Using ${unspentUTXOs.length} unspent UTXOs out of ${utxos.length} total`);
    }
    
    utxos = unspentUTXOs;
  } else {
    console.log('Skipping spent UTXO validation (may fail at broadcast if UTXOs are spent)');
  }

  // Try to build transaction with all valid UTXOs, skipping problematic ones
  const validInputs: ValidInput[] = [];
  const skippedUtxos: Array<{ utxo: UTXO; reason: string }> = [];
  const prevTxCache = new Map<string, string>();

  // First pass: validate and collect UTXOs
  for (const utxo of utxos) {
    try {
      const amountSats = BigInt(toSatoshis(utxo.amount));

      // Fetch previous transaction
      let prevTxHex = prevTxCache.get(utxo.txid);
      if (!prevTxHex) {
        const fetchedHex = await fetchPreviousRawTransaction(utxo.txid);
        if (!fetchedHex) {
          skippedUtxos.push({ utxo, reason: 'Could not fetch previous transaction' });
          continue;
        }
        prevTxHex = fetchedHex;
        prevTxCache.set(utxo.txid, prevTxHex);
      }

      // Decode and validate script
      const scriptPubKey = hexToBytes(utxo.scriptPubKeyHex);
      let decoded;
      try {
        decoded = OutScript.decode(scriptPubKey);
      } catch (e) {
        // If standard decoding fails, try manual parsing for bare multisig
        // We only need OUR key to be valid for 1-of-3 multisig
        const manuallyParsed = tryManualMultisigParse(utxo.scriptPubKeyHex, publicKeyCompressedHex, publicKeyUncompressedHex);
        if (manuallyParsed) {
          decoded = manuallyParsed;
          console.log(`Manually parsed multisig for ${utxo.txid}:${utxo.vout} (bypassed validation of other pubkeys)`);
        } else {
          skippedUtxos.push({ utxo, reason: `Failed to decode script: ${e}` });
          continue;
        }
      }

      if (decoded.type !== 'ms') {
        skippedUtxos.push({ utxo, reason: 'Not a multisig script' });
        continue;
      }

      const pubkeys = decoded.pubkeys;
      // For manually parsed scripts, we already checked for our key
      const hasCompressed = decoded.ourKeyIndex !== undefined || pubkeys.some((pk: Uint8Array) => bytesToHex(pk) === publicKeyCompressedHex);
      const hasUncompressed = decoded.ourKeyIndex !== undefined || pubkeys.some((pk: Uint8Array) => bytesToHex(pk) === publicKeyUncompressedHex);
      
      if (!hasCompressed && !hasUncompressed) {
        skippedUtxos.push({ utxo, reason: 'Does not contain our public key' });
        continue;
      }

      // Log details for debugging
      const wasManuallyParsed = decoded.ourKeyIndex !== undefined;
      console.log(`UTXO ${utxo.txid}:${utxo.vout} - Amount: ${utxo.amount} BTC, Has compressed: ${hasCompressed}, Has uncompressed: ${hasUncompressed}, Manually parsed: ${wasManuallyParsed}`);
      
      validInputs.push({ utxo, scriptPubKey, prevTxHex, amountSats, needsUncompressed: hasUncompressed, wasManuallyParsed });
    } catch (error) {
      console.error(`Error processing UTXO ${utxo.txid}:${utxo.vout}:`, error);
      skippedUtxos.push({ utxo, reason: `Processing error: ${error}` });
    }
  }

  if (validInputs.length === 0) {
    console.error('All UTXOs were skipped:', skippedUtxos);
    throw new Error('No suitable UTXOs after filtering.');
  }

  if (skippedUtxos.length > 0) {
    console.warn(`Skipped ${skippedUtxos.length} UTXOs:`, skippedUtxos.map(s => `${s.utxo.txid}:${s.utxo.vout} - ${s.reason}`));
  }

  // Apply max inputs limit - default to 420 for safety (keeps tx under ~63KB)
  // Bitcoin network limits: max standard tx is 100KB, but we want to stay well under that
  // Each bare multisig input is ~110-150 bytes with signature
  const maxInputs = options?.maxInputsPerTx ?? DEFAULT_MAX_INPUTS;
  if (validInputs.length > maxInputs) {
    console.log(`Limiting to ${maxInputs} inputs per transaction for safety (had ${validInputs.length})`);
    console.log(`Remaining ${validInputs.length - maxInputs} UTXOs will need separate consolidation`);
    validInputs.splice(maxInputs);
  }

  // Now try to build and sign the transaction
  const attemptInputs = [...validInputs];

  try {
    const tx = new Transaction({ disableScriptCheck: true });
    let totalInputAmount = 0n;
    const problematicInputs: number[] = []; // Track which inputs need manual handling

    // Add all inputs
    for (let i = 0; i < attemptInputs.length; i++) {
      const { utxo, scriptPubKey, prevTxHex, amountSats, needsUncompressed, wasManuallyParsed } = attemptInputs[i];
      
      // If this was manually parsed, btc-signer can't handle it normally
      if (wasManuallyParsed) {
        // Add without redeemScript - we'll handle signing manually
        tx.addInput({
          txid: hexToBytes(utxo.txid),
          index: utxo.vout,
          sequence: RBF_SEQUENCE, // Enable RBF.
          nonWitnessUtxo: hexToBytes(prevTxHex),
          // NO redeemScript - we'll construct the scriptSig manually
        });
        problematicInputs.push(i);
      } else {
        // Normal input with redeemScript
        tx.addInput({
          txid: hexToBytes(utxo.txid),
          index: utxo.vout,
          sequence: RBF_SEQUENCE, // Enable RBF.
          nonWitnessUtxo: hexToBytes(prevTxHex),
          redeemScript: scriptPubKey,
        });
      }
      totalInputAmount += amountSats;
    }

    // Calculate fee and output
    const feeRate = BigInt(feeRateSatPerVByte);
    const estimatedSize = BigInt(estimateTransactionSize(tx.inputsLength, 1));
    const fee = estimatedSize * feeRate;
    const outputAmount = totalInputAmount - fee;
    
    if (outputAmount <= 0n) {
      throw new Error(`Insufficient funds after fees. Total: ${totalInputAmount} sats, Fee: ${fee} sats`);
    }

    tx.addOutputAddress(targetAddress, outputAmount);

    // Check function to determine if an input needs uncompressed signing
    const checkForUncompressed = (idx: number): boolean => {
      if (idx >= attemptInputs.length) return false;
      return attemptInputs[idx].needsUncompressed;
    };

    // Prepare prevOutputScripts array for inputs that need it
    const prevOutputScripts: Uint8Array[] = [];
    for (let i = 0; i < attemptInputs.length; i++) {
      prevOutputScripts.push(attemptInputs[i].scriptPubKey);
    }
    
    // Use the improved hybrid signing utility for all inputs
    // Pass prevOutputScripts for problematic inputs that don't have redeemScript
    // Skip standard signing if we have any manually parsed inputs (they have invalid pubkeys)
    hybridSignTransaction(
      tx,
      privateKeyBytes,
      publicKeyCompressed,
      publicKeyUncompressed,
      prevOutputScripts,
      checkForUncompressed,
      problematicInputs.length > 0  // Skip standard signing if we have problematic inputs
    );

    // Check if hybrid signing missed any problematic inputs
    // This should only happen if hybrid signing couldn't find the script
    for (const inputIdx of problematicInputs) {
      const input = tx.getInput(inputIdx);
      // Only manually sign if hybrid signing didn't already handle it
      if (!input.partialSig || input.partialSig.length === 0) {
        const { scriptPubKey } = attemptInputs[inputIdx];
        const success = manuallySignMultisigInput(
          tx,
          inputIdx,
          privateKeyBytes,
          publicKeyCompressed,
          publicKeyUncompressed,
          scriptPubKey
        );
        if (!success) {
          console.warn(`Failed to manually sign problematic input ${inputIdx}`);
        }
      }
    }

    // Try to finalize
    tx.finalize();
    
    const signedTx = tx.hex;
    console.log(`Successfully consolidated ${attemptInputs.length} UTXOs out of ${utxos.length} total`);
    return signedTx;
    
  } catch (error) {
    console.error(`Transaction failed with ${attemptInputs.length} inputs:`, error);
    
    // Log which inputs we tried so user can investigate
    console.log('Failed transaction included these inputs:');
    attemptInputs.forEach((input, idx) => {
      console.log(`  ${idx}: ${input.utxo.txid}:${input.utxo.vout} (${input.needsUncompressed ? 'uncompressed' : 'compressed'})`);
    });
    
    throw error;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * SCRIPT PARSING HELPERS
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Manually parse a multisig script without validating all pubkeys.
 * This is needed because btc-signer validates ALL pubkeys even though
 * we only need one valid key for 1-of-3 multisig.
 * Handles both compressed (33 bytes) and uncompressed (65 bytes) public keys.
 * 
 * @param scriptHex - The hex string of the script
 * @param ourCompressedKey - Our compressed public key hex
 * @param ourUncompressedKey - Our uncompressed public key hex
 * @returns A decoded object compatible with OutScript.decode() or null
 */
function tryManualMultisigParse(scriptHex: string, ourCompressedKey: string, ourUncompressedKey: string): any {
  try {
    // Expected format for 1-of-3 multisig: 
    // 51 [pushop] [key1] [pushop] [key2] [pushop] [key3] 53 ae
    // 51 = OP_1 (m=1)
    // pushop = 21 (OP_PUSHBYTES_33) for compressed or 41 (OP_PUSHBYTES_65) for uncompressed
    // 53 = OP_3 (n=3) 
    // ae = OP_CHECKMULTISIG
    
    // Check if it starts with OP_1 and ends with OP_3 OP_CHECKMULTISIG
    if (!scriptHex.startsWith(MULTISIG_OP_1) || !scriptHex.endsWith(MULTISIG_OP_3_CHECKMULTISIG)) {
      return null; // Not a 1-of-3 multisig
    }
    
    // Extract the three pubkeys (can be compressed or uncompressed)
    const pubkeys: Uint8Array[] = [];
    let foundOurKey = false;
    let ourKeyIndex = -1;
    let currentOffset = 2; // Start after '51' (OP_1)
    
    // Parse each of the 3 keys
    for (let i = 0; i < 3; i++) {
      if (currentOffset >= scriptHex.length - 4) { // Need at least 4 chars for '53ae'
        return null; // Script too short
      }
      
      const pushOp = scriptHex.substr(currentOffset, 2);
      currentOffset += 2;
      
      let keyLength: number;
      if (pushOp === OP_PUSHBYTES_33) {
        // Compressed key (33 bytes = 66 hex chars)
        keyLength = 66;
      } else if (pushOp === OP_PUSHBYTES_65) {
        // Uncompressed key (65 bytes = 130 hex chars)
        keyLength = 130;
      } else {
        return null; // Unexpected push opcode
      }
      
      if (currentOffset + keyLength > scriptHex.length) {
        return null; // Script too short for key
      }
      
      const keyHex = scriptHex.substr(currentOffset, keyLength);
      currentOffset += keyLength;
      
      // Check if this is our key (we don't validate the others)
      if (keyHex === ourCompressedKey.toLowerCase() || keyHex === ourUncompressedKey.toLowerCase()) {
        foundOurKey = true;
        ourKeyIndex = i;
      }
      
      pubkeys.push(hexToBytes(keyHex));
    }
    
    // Verify we're at the expected position (should be at '53ae')
    if (scriptHex.substr(currentOffset) !== MULTISIG_OP_3_CHECKMULTISIG) {
      return null; // Script doesn't end with OP_3 OP_CHECKMULTISIG
    }
    
    if (!foundOurKey) {
      return null; // Our key isn't in this multisig
    }
    
    // Return a structure compatible with what OutScript.decode would return
    // btc-signer expects this shape for multisig
    return {
      type: 'ms',
      m: 1,
      n: 3,
      pubkeys: pubkeys,
      ourKeyIndex: ourKeyIndex // Store which position our key is in
    };
  } catch (error) {
    console.error('Manual multisig parsing failed:', error);
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * SIGNING HELPERS
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Manually sign a problematic multisig input that btc-signer can't handle.
 * This bypasses btc-signer's validation and directly constructs the scriptSig.
 * 
 * @param tx - The transaction
 * @param inputIdx - Index of the input to sign
 * @param privateKey - Private key bytes
 * @param compressedPubkey - Compressed public key
 * @param uncompressedPubkey - Uncompressed public key  
 * @param scriptPubKey - The scriptPubKey from the UTXO being spent
 * @returns true if successful
 */
function manuallySignMultisigInput(
  tx: Transaction,
  inputIdx: number,
  privateKey: Uint8Array,
  compressedPubkey: Uint8Array,
  uncompressedPubkey: Uint8Array,
  scriptPubKey: Uint8Array
): boolean {
  try {
    // Get the preimage hash for signing
    const preimageLegacy = (tx as any).preimageLegacy;
    if (typeof preimageLegacy !== 'function') {
      console.error('preimageLegacy not accessible');
      return false;
    }
    
    // Create the hash to sign
    const hash = preimageLegacy.call(tx, inputIdx, scriptPubKey, SigHash.ALL);
    
    // Sign with our key
    const sig = signECDSA(hash, privateKey, (tx as any).opts?.lowR);
    
    // Append sighash byte
    const sigWithHash = new Uint8Array(sig.length + 1);
    sigWithHash.set(sig);
    sigWithHash[sig.length] = SigHash.ALL;
    
    // For bare multisig, the scriptSig is: OP_0 <signature>
    // OP_0 is required due to a bug in the original Bitcoin implementation
    const scriptSig = new Uint8Array(1 + 1 + sigWithHash.length);
    scriptSig[0] = 0x00; // OP_0
    scriptSig[1] = sigWithHash.length; // Push signature length
    scriptSig.set(sigWithHash, 2);
    
    // Set the finalScriptSig directly to bypass validation
    tx.updateInput(inputIdx, { finalScriptSig: scriptSig }, true);
    
    console.log(`Manually signed problematic multisig input ${inputIdx}`);
    return true;
  } catch (error) {
    console.error(`Failed to manually sign input ${inputIdx}:`, error);
    return false;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * TRANSACTION SIZE ESTIMATION
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Roughly estimates a transaction's size in bytes.
 */
function estimateTransactionSize(numInputs: number, numOutputs: number): number {
  let size = 8; // version (4 bytes) + locktime (4 bytes)
  size += varIntSize(numInputs);
  // For each input, add an approximate size.
  for (let i = 0; i < numInputs; i++) {
    // For bare multisig, assume a scriptSig of: OP_0 + signature (roughly 74 bytes).
    const signaturesSize = ESTIMATED_SIGNATURE_SIZE;
    size += 36 + varIntSize(signaturesSize) + signaturesSize + 4;
  }
  size += varIntSize(numOutputs);
  // For each output, assume 8 (amount) + varint for script length + 25 bytes script.
  for (let i = 0; i < numOutputs; i++) {
    size += 8 + varIntSize(25) + 25;
  }
  return size;
}

/**
 * Returns the number of bytes used to encode a variable-length integer.
 */
function varIntSize(n: number): number {
  if (n < 0xfd) return 1;
  else if (n <= 0xffff) return 3;
  else if (n <= 0xffffffff) return 5;
  else return 9;
}

/* ══════════════════════════════════════════════════════════════════════════
 * UTXO VALIDATION HELPERS
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Filter out already-spent UTXOs from a list.
 * Checks each UTXO against the blockchain to verify it's still unspent.
 */
async function filterUnspentUTXOs(utxos: UTXO[]): Promise<UTXO[]> {
  console.log(`Validating ${utxos.length} UTXOs for spent status...`);
  
  // Check UTXOs in parallel for speed
  const validationPromises = utxos.map(async (utxo) => {
    const isUnspent = await isUTXOUnspent(utxo.txid, utxo.vout);
    return isUnspent ? utxo : null;
  });
  
  const results = await Promise.all(validationPromises);
  const unspentUTXOs = results.filter((u): u is UTXO => u !== null);
  
  const spentCount = utxos.length - unspentUTXOs.length;
  if (spentCount > 0) {
    console.log(`Filtered out ${spentCount} already-spent UTXOs`);
  }
  
  return unspentUTXOs;
}

/**
 * Check if a UTXO is still unspent by querying the blockchain.
 * Returns true if unspent, false if spent or unknown.
 */
async function isUTXOUnspent(txid: string, vout: number): Promise<boolean> {
  try {
    // Try multiple endpoints for redundancy
    const endpoints = [
      `https://blockstream.info/api/tx/${txid}/outspend/${vout}`,
      `https://mempool.space/api/tx/${txid}/outspend/${vout}`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await quickApiClient.get(endpoint);
        // If the UTXO is spent, the response will have a 'spent' field set to true
        // or will have 'txid' field indicating the spending transaction
        if (response.data) {
          const isSpent = response.data.spent === true || response.data.txid !== undefined;
          if (isSpent) {
            console.log(`UTXO ${txid}:${vout} is already spent`);
            return false;
          }
          return true;
        }
      } catch (error) {
        // Try next endpoint
        continue;
      }
    }
    
    // If we can't determine status, assume it's valid (will fail at broadcast if wrong)
    console.warn(`Could not verify UTXO status for ${txid}:${vout}, assuming unspent`);
    return true;
  } catch (error) {
    console.warn(`Error checking UTXO ${txid}:${vout}:`, error);
    return true; // Assume valid if we can't check
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * NETWORK/API HELPERS
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch bare multisig UTXOs for the given address.
 */
async function fetchBareMultisigUTXOs(address: string): Promise<UTXO[]> {
  const response = await quickApiClient.get<{ data: any[] }>(`https://app.xcp.io/api/v1/address/${address}/utxos`);
  const utxos = response.data.data;
  if (!utxos || utxos.length === 0) throw new Error('No bare multisig UTXOs found');
  return utxos.map((utxo: any) => ({
    txid: utxo.txid,
    vout: utxo.vout,
    amount: parseFloat(utxo.amount),
    scriptPubKeyHex: utxo.scriptPubKeyHex,
    scriptPubKeyType: utxo.scriptPubKeyType,
    requiredSignatures: utxo.required_signatures || 1,
  }));
}

/**
 * Fetch a previous transaction's raw hex given its txid.
 */
async function fetchPreviousRawTransaction(txid: string): Promise<string | null> {
  const endpoints = [
    { url: `https://blockstream.info/api/tx/${txid}/hex`, transform: (d: string) => d.trim() },
    { url: `https://mempool.space/api/tx/${txid}/hex`, transform: (d: string) => d.trim() },
    { url: async () => {
      const settings = await getKeychainSettings();
      return `${settings.counterpartyApiBase}/v2/bitcoin/transactions/${txid}`;
    }, transform: (d: any) => d.result.hex },
  ];
  for (const endpoint of endpoints) {
    try {
      const url = typeof endpoint.url === 'function' ? await endpoint.url() : endpoint.url;
      // Use quickApiClient with 10 second timeout for transaction lookups
      const response = await quickApiClient.get(url);
      return endpoint.transform(response.data);
    } catch (_) {
      continue;
    }
  }
  return null;
}