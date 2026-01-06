import { Transaction } from '@scure/btc-signer';
import { apiClient } from '@/utils/axios';
import { hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { getKeychainSettings } from '@/utils/storage/settingsStorage';
import { toSatoshis } from '@/utils/numeric';
import { 
  analyzeMultisigScript, 
  signAndFinalizeBareMultisig,
  type MultisigInputInfo 
} from './multisigSigner';

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
  prevTxHex: string;
  amountSats: bigint;
  inputInfo: MultisigInputInfo;
}

/**
 * Options for consolidation.
 */
interface ConsolidationOptions {
  maxInputsPerTx?: number;  // Limit inputs per transaction for safety (default: 420)
  skipSpentCheck?: boolean; // Skip validation of spent UTXOs (faster but may fail at broadcast)
  serviceFeeAddress?: string; // Address to send 10% service fee to (will be fetched from API if not provided)
  serviceFeeRate?: number; // Service fee percentage (will be fetched from API if not provided)
  useApiServiceFee?: boolean; // Whether to fetch service fee config from Laravel API (default: true)
}

/**
 * Service fee configuration from Laravel API.
 */
interface ServiceFeeConfig {
  fee_address: string | null;
  fee_percent: number;
}

/* ══════════════════════════════════════════════════════════════════════════
 * CONSTANTS
 * ══════════════════════════════════════════════════════════════════════════ */

// Default maximum inputs per transaction to stay well under 100KB limit
const DEFAULT_MAX_INPUTS = 420;

// RBF-enabled sequence number
const RBF_SEQUENCE = 0xfffffffd;

// Estimated sizes for fee calculation (based on empirical data)
const ESTIMATED_BYTES_PER_INPUT = 115; // Actual average from transaction analysis

// Multisig script format constants

// Service fee exemption threshold (0.0001 BTC = 10,000 sats)
export const SERVICE_FEE_EXEMPTION_THRESHOLD = 10000n;

/* ══════════════════════════════════════════════════════════════════════════
 * SERVICE FEE CONFIGURATION
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch service fee configuration from Laravel API.
 * Returns fee address and percentage from the consolidation endpoint.
 */
export async function fetchConsolidationFeeConfig(address: string): Promise<ServiceFeeConfig | null> {
  try {
    // Use the Laravel API consolidation endpoint to get fee configuration
    // This endpoint includes fee_config in the response
    const response = await apiClient.get<{
      fee_config: ServiceFeeConfig;
      summary: any;
      utxos: any[];
    }>(`https://app.xcp.io/api/v1/address/${address}/consolidation?max_utxos=1`);
    
    if (response.data?.fee_config) {
      const feeConfig = response.data.fee_config;
      
      // Validate the response
      if (feeConfig.fee_address && feeConfig.fee_percent > 0) {
        console.log(`Service fee config: ${feeConfig.fee_percent}% to ${feeConfig.fee_address}`);
        return feeConfig;
      } else {
        console.log('Service fees are disabled in the API configuration');
        return null;
      }
    }
    
    console.warn('No fee_config found in API response');
    return null;
  } catch (error) {
    console.warn('Failed to fetch service fee config from API:', error);
    return null;
  }
}

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
  const publicKeyUncompressed: Uint8Array = getPublicKey(privateKeyBytes, false);

  // Fetch service fee configuration from Laravel API (unless disabled or overridden)
  let serviceFeeAddress = options?.serviceFeeAddress;
  let serviceFeeRate = options?.serviceFeeRate;
  
  // By default, use API service fee configuration unless explicitly disabled
  const shouldUseApi = options?.useApiServiceFee !== false;
  const needsApiConfig = !serviceFeeAddress || serviceFeeRate === undefined;
  
  if (shouldUseApi && needsApiConfig) {
    console.log('Fetching service fee configuration from Laravel API...');
    try {
      const feeConfig = await fetchConsolidationFeeConfig(sourceAddress);
      
      if (feeConfig) {
        // Use API config if not explicitly overridden in options
        serviceFeeAddress = serviceFeeAddress || feeConfig.fee_address || undefined;
        serviceFeeRate = serviceFeeRate ?? feeConfig.fee_percent;
        console.log(`Using API service fee config: ${serviceFeeRate}% to ${serviceFeeAddress}`);
      } else {
        console.log('Service fees are disabled in the API configuration, proceeding without service fees');
      }
    } catch (error) {
      console.warn('Failed to fetch service fee config from API, proceeding without service fees:', error);
    }
  } else if (!shouldUseApi && needsApiConfig) {
    console.log('API service fee integration is disabled and no manual config provided, proceeding without service fees');
  } else if (serviceFeeAddress && serviceFeeRate) {
    console.log(`Using manual service fee config: ${serviceFeeRate}% to ${serviceFeeAddress}`);
  }

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

      // Analyze the script to determine signing approach
      const scriptPubKey = hexToBytes(utxo.scriptPubKeyHex);
      const inputInfo = analyzeMultisigScript(scriptPubKey, publicKeyCompressed, publicKeyUncompressed);
      
      if (!inputInfo) {
        skippedUtxos.push({ utxo, reason: 'Not a multisig script or does not contain our key' });
        continue;
      }
      
      console.log(`UTXO ${utxo.txid}:${utxo.vout} - ${inputInfo.signType} multisig`);
      validInputs.push({ utxo, prevTxHex, amountSats, inputInfo });
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

    // Add all inputs
    for (let i = 0; i < attemptInputs.length; i++) {
      const { utxo, prevTxHex, amountSats, inputInfo } = attemptInputs[i];
      
      // For inputs with invalid pubkeys, don't add redeemScript to avoid validation errors
      if (inputInfo.signType === 'invalid-pubkeys') {
        tx.addInput({
          txid: hexToBytes(utxo.txid),
          index: utxo.vout,
          sequence: RBF_SEQUENCE,
          nonWitnessUtxo: hexToBytes(prevTxHex),
          // NO redeemScript - multisigSigner will handle this
        });
      } else {
        // Standard compressed or uncompressed - add with redeemScript
        tx.addInput({
          txid: hexToBytes(utxo.txid),
          index: utxo.vout,
          sequence: RBF_SEQUENCE,
          nonWitnessUtxo: hexToBytes(prevTxHex),
          redeemScript: inputInfo.scriptPubKey,
        });
      }
      totalInputAmount += amountSats;
    }

    // Determine if we have a service fee using the fetched or provided configuration
    const hasServiceFee = serviceFeeAddress && serviceFeeRate && serviceFeeRate > 0;
    const numOutputs = hasServiceFee ? 2 : 1;
    
    // Calculate network fee
    const feeRate = BigInt(feeRateSatPerVByte);
    const estimatedSize = BigInt(estimateTransactionSize(tx.inputsLength, numOutputs));
    const networkFee = estimatedSize * feeRate;
    
    let userAmount = totalInputAmount - networkFee;
    let serviceFeeAmount = 0n;
    
    if (hasServiceFee) {
      // Calculate service fee from the recoverable amount (after network fees)
      const recoverableAmount = totalInputAmount - networkFee;
      serviceFeeAmount = recoverableAmount * BigInt(serviceFeeRate!) / 100n;
      userAmount = recoverableAmount - serviceFeeAmount;
      
      console.log(`Consolidation breakdown: User: ${userAmount} sats (${100-serviceFeeRate!}%), Service Fee: ${serviceFeeAmount} sats (${serviceFeeRate}%), Network Fee: ${networkFee} sats`);
    }
    
    if (userAmount <= 0n || (hasServiceFee && serviceFeeAmount <= 0n)) {
      throw new Error(`Insufficient funds after fees. Total: ${totalInputAmount} sats, Network Fee: ${networkFee} sats, Service Fee: ${serviceFeeAmount} sats`);
    }

    // Add consolidation output for user
    tx.addOutputAddress(targetAddress, userAmount);
    
    // Add service fee output if configured
    if (hasServiceFee && serviceFeeAmount > 0n && serviceFeeAddress) {
      tx.addOutputAddress(serviceFeeAddress, serviceFeeAmount);
    }

    // Extract input infos for the multisigSigner
    const inputInfos = attemptInputs.map(input => input.inputInfo);
    
    // Use our specialized multisig signer that handles all cases:
    // - Standard compressed keys
    // - Uncompressed keys
    // - Invalid pubkeys (Counterparty data)

    // For large batches, signing can take a while, so periodically trigger activity to prevent auto-lock
    let activityInterval: NodeJS.Timeout | undefined;
    if (attemptInputs.length > 50) {
      // Trigger activity every 10 seconds during signing
      activityInterval = setInterval(() => {
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
        console.log('Triggering activity during consolidation signing...');
      }, 10000);
    }

    try {
      signAndFinalizeBareMultisig(
        tx,
        privateKeyBytes,
        publicKeyCompressed,
        publicKeyUncompressed,
        inputInfos
      );
    } finally {
      // Clean up the interval
      if (activityInterval) {
        clearInterval(activityInterval);
      }
    }
    
    const signedTx = tx.hex;
    console.log(`Successfully consolidated ${attemptInputs.length} UTXOs out of ${utxos.length} total`);
    return signedTx;
    
  } catch (error) {
    console.error(`Transaction failed with ${attemptInputs.length} inputs:`, error);
    
    // Log which inputs we tried so user can investigate
    console.log('Failed transaction included these inputs:');
    attemptInputs.forEach((input, idx) => {
      console.log(`  ${idx}: ${input.utxo.txid}:${input.utxo.vout} (${input.inputInfo.signType})`);
    });
    
    throw error;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * FEE ESTIMATION
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Estimate consolidation fees for a set of UTXOs.
 */
export async function estimateConsolidationFees(
  utxos: UTXO[],
  feeRateSatPerVByte: number,
  options?: {
    serviceFeeAddress?: string;
    serviceFeeRate?: number;
  }
): Promise<{
  networkFee: bigint;
  serviceFee: bigint;
  totalFee: bigint;
  totalInput: bigint;
  netOutput: bigint;
}> {
  // Calculate total input amount
  const totalInput = utxos.reduce((sum, utxo) => sum + BigInt(toSatoshis(utxo.amount)), 0n);
  
  // Estimate transaction size
  const numOutputs = options?.serviceFeeAddress ? 2 : 1;
  const estimatedSize = estimateTransactionSize(utxos.length, numOutputs);
  const networkFee = BigInt(estimatedSize) * BigInt(feeRateSatPerVByte);
  
  // Calculate service fee
  let serviceFee = 0n;
  if (options?.serviceFeeAddress && options?.serviceFeeRate) {
    const recoverableAmount = totalInput - networkFee;
    if (recoverableAmount >= SERVICE_FEE_EXEMPTION_THRESHOLD) {
      serviceFee = recoverableAmount * BigInt(options.serviceFeeRate) / 100n;
    }
  }
  
  const totalFee = networkFee + serviceFee;
  const netOutput = totalInput - totalFee;
  
  return {
    networkFee,
    serviceFee,
    totalFee,
    totalInput,
    netOutput
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * TRANSACTION SIZE ESTIMATION
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Estimates a transaction's size in bytes.
 * Based on empirical data from actual bare multisig consolidations.
 */
function estimateTransactionSize(numInputs: number, numOutputs: number): number {
  let size = 8; // version (4 bytes) + locktime (4 bytes)

  // Variable integer for input count
  size += varIntSize(numInputs);

  // Each bare multisig input is approximately 115 bytes
  // This includes: 36 (txid+vout) + ~73 (OP_0 + signature) + 4 (sequence) + varints
  size += numInputs * ESTIMATED_BYTES_PER_INPUT;

  // Variable integer for output count
  size += varIntSize(numOutputs);

  // Each P2PKH output is ~34 bytes: 8 (amount) + 1 (script length) + 25 (script)
  size += numOutputs * 34;

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
        const response = await apiClient.get(endpoint);
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
  const response = await apiClient.get<{ data: any[] }>(`https://app.xcp.io/api/v1/address/${address}/utxos`);
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
      const response = await apiClient.get(url);
      return endpoint.transform(response.data);
    } catch (_) {
      continue;
    }
  }
  return null;
}