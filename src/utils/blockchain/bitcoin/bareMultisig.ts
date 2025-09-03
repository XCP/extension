import { Transaction, SigHash, OutScript } from '@scure/btc-signer';
import { quickApiClient, API_TIMEOUTS } from '@/utils/api/axiosConfig';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { getPublicKey } from '@noble/secp256k1';
import { getKeychainSettings } from '@/utils/storage/settingsStorage';
import { toSatoshis } from '@/utils/numeric';
import { hybridSignTransaction } from '@/utils/blockchain/bitcoin';


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
  options?: {
    maxInputsPerTx?: number;  // Limit inputs per transaction for safety (default: 420)
  }
): Promise<string> {
  const targetAddress = destinationAddress || sourceAddress;

  if (!privateKeyHex) throw new Error('Private key not found');
  const privateKeyBytes = hexToBytes(privateKeyHex);

  // Generate both compressed and uncompressed public keys.
  const publicKeyCompressed: Uint8Array = getPublicKey(privateKeyBytes, true);
  const publicKeyCompressedHex = bytesToHex(publicKeyCompressed);

  const publicKeyUncompressed: Uint8Array = getPublicKey(privateKeyBytes, false);
  const publicKeyUncompressedHex = bytesToHex(publicKeyUncompressed);

  const utxos = await fetchBareMultisigUTXOs(sourceAddress);
  if (utxos.length === 0) throw new Error('No bare multisig UTXOs found');
  
  console.log(`Found ${utxos.length} potential bare multisig UTXOs to consolidate`);

  // Try to build transaction with all valid UTXOs, skipping problematic ones
  const validInputs: Array<{ 
    utxo: UTXO; 
    scriptPubKey: Uint8Array; 
    prevTxHex: string; 
    amountSats: bigint;
    needsUncompressed: boolean;
  }> = [];
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
        skippedUtxos.push({ utxo, reason: `Failed to decode script: ${e}` });
        continue;
      }

      if (decoded.type !== 'ms') {
        skippedUtxos.push({ utxo, reason: 'Not a multisig script' });
        continue;
      }

      const pubkeys = decoded.pubkeys;
      const hasCompressed = pubkeys.some((pk: Uint8Array) => bytesToHex(pk) === publicKeyCompressedHex);
      const hasUncompressed = pubkeys.some((pk: Uint8Array) => bytesToHex(pk) === publicKeyUncompressedHex);
      
      if (!hasCompressed && !hasUncompressed) {
        skippedUtxos.push({ utxo, reason: 'Does not contain our public key' });
        continue;
      }

      // Log details for debugging
      console.log(`UTXO ${utxo.txid}:${utxo.vout} - Amount: ${utxo.amount} BTC, Has compressed: ${hasCompressed}, Has uncompressed: ${hasUncompressed}`);
      
      validInputs.push({ utxo, scriptPubKey, prevTxHex, amountSats, needsUncompressed: hasUncompressed });
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
  const maxInputs = options?.maxInputsPerTx ?? 420;
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

    // Add all inputs
    for (const { utxo, scriptPubKey, prevTxHex, amountSats } of attemptInputs) {
      tx.addInput({
        txid: hexToBytes(utxo.txid),
        index: utxo.vout,
        sequence: 0xfffffffd, // Enable RBF.
        nonWitnessUtxo: hexToBytes(prevTxHex),
        redeemScript: scriptPubKey, // For bare multisig, the redeemScript is identical to the scriptPubKey.
      });
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

    // Use the improved hybrid signing utility
    // We don't need to pass prevOutputScripts since redeemScript is already set on inputs
    hybridSignTransaction(
      tx,
      privateKeyBytes,
      publicKeyCompressed,
      publicKeyUncompressed,
      undefined, // Will use redeemScript from inputs
      checkForUncompressed
    );

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

/* ───────── Helper Functions ───────── */

/**
 * Roughly estimates a transaction's size in bytes.
 */
function estimateTransactionSize(numInputs: number, numOutputs: number): number {
  let size = 8; // version (4 bytes) + locktime (4 bytes)
  size += varIntSize(numInputs);
  // For each input, add an approximate size.
  for (let i = 0; i < numInputs; i++) {
    // For bare multisig, assume a scriptSig of: OP_0 + signature (roughly 74 bytes).
    const signaturesSize = 74;
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

/**
 * UTXO interface.
 */
interface UTXO {
  txid: string;
  vout: number;
  amount: number; // in BTC
  scriptPubKeyHex: string;
  scriptPubKeyType?: string;
  requiredSignatures?: number;
}
