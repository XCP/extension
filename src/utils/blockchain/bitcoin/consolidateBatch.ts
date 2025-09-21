/**
 * Batch Consolidation for Bare Multisig UTXOs
 * Handles consolidation using data from the Laravel API
 */

import { Transaction } from '@scure/btc-signer';
import { hexToBytes } from '@noble/hashes/utils';
import { getPublicKey } from '@noble/secp256k1';
import { type ConsolidationData } from '@/services/consolidationApiService';
import { 
  analyzeMultisigScript, 
  signAndFinalizeBareMultisig,
  type MultisigInputInfo
} from './multisigSigner';

// RBF-enabled sequence number
const RBF_SEQUENCE = 0xfffffffd;

// Extended input info for consolidation
interface ConsolidationInput {
  index: number;
  amount: bigint;
  script: Uint8Array;
  scriptAnalysis: any;
  prevTxHex: string;
  pubkeyHex: string;
  position: number;
  hasInvalidPubkeys: boolean;
}

export interface ConsolidationResult {
  signedTxHex: string;
  totalInput: number; // sats
  networkFee: number; // sats
  serviceFee: number; // sats
  outputAmount: number; // sats
  txSize: number; // bytes
}

/**
 * Consolidate bare multisig UTXOs using batch data from Laravel API
 * @param privateKey - Private key in hex format
 * @param sourceAddress - Bitcoin address owning the UTXOs
 * @param batchData - Consolidation data from Laravel API
 * @param feeRateSatPerVByte - Fee rate in satoshis per vByte
 * @param destinationAddress - Optional destination address (defaults to source)
 * @returns Consolidation result with signed tx and fee details
 */
export async function consolidateBareMultisigBatch(
  privateKey: string,
  sourceAddress: string,
  batchData: ConsolidationData,
  feeRateSatPerVByte: number,
  destinationAddress?: string
): Promise<ConsolidationResult> {
  if (!batchData.utxos || batchData.utxos.length === 0) {
    throw new Error('No UTXOs to consolidate in this batch');
  }

  const destination = destinationAddress || sourceAddress;
  
  // Create transaction
  const tx = new Transaction();
  
  // Prepare inputs with signing info
  const inputs: ConsolidationInput[] = [];
  let totalInputSats = 0n;
  
  for (const utxo of batchData.utxos) {
    // Add input to transaction
    tx.addInput({
      txid: hexToBytes(utxo.txid),
      index: utxo.vout,
      sequence: RBF_SEQUENCE,
    });
    
    // We'll analyze the script later when we have the pubkeys
    // For now, just store the script
    const scriptBytes = hexToBytes(utxo.script);
    
    // Determine which pubkey to use based on position
    const pubkeyToUse = utxo.position === 0 
      ? batchData.pubkey_uncompressed // Uncompressed for position 0
      : batchData.pubkey_compressed; // Compressed for position 1
    
    // Check if this UTXO has invalid pubkeys (from API validation)
    if (utxo.has_invalid_pubkeys) {
      console.warn(`UTXO ${utxo.txid}:${utxo.vout} has invalid pubkeys: ${utxo.pubkey_validation_hint || 'data-encoded'}`);
    }
    
    // Prepare signing info with validation flag from API
    const inputInfo: ConsolidationInput = {
      index: inputs.length,
      amount: BigInt(utxo.amount),
      script: scriptBytes, // Store the byte form
      scriptAnalysis: null as any, // Will be analyzed later with pubkeys
      prevTxHex: utxo.prev_tx_hex,
      pubkeyHex: pubkeyToUse,
      position: utxo.position,
      hasInvalidPubkeys: utxo.has_invalid_pubkeys || false
    };
    
    inputs.push(inputInfo);
    totalInputSats += BigInt(utxo.amount);
  }
  
  // Calculate transaction size for fee estimation
  // Based on actual transaction analysis:
  // - Bare multisig inputs average ~115 bytes per input in practice
  //   (36 txid + 4 vout + 1-2 varint + ~72 sig + 1 OP_0 + 4 sequence)
  // - Base overhead: 10 bytes (4 version + 1-3 varint input count + 1 varint output count + 4 locktime)
  // - Output: ~34 bytes per P2PKH output

  const bytesPerInput = 115; // Based on empirical data from actual transactions
  const baseOverhead = 10;
  const bytesPerOutput = 34;
  
  // First calculate basic network fee
  const numOutputsBase = 1; // Start with just main output
  // Add varint overhead for large input counts
  const inputCountVarintSize = batchData.utxos.length >= 253 ? 3 : 1;
  const estimatedSizeBase = (batchData.utxos.length * bytesPerInput) + baseOverhead + inputCountVarintSize + (numOutputsBase * bytesPerOutput);
  const networkFeeSats = BigInt(Math.ceil(estimatedSizeBase * feeRateSatPerVByte));
  
  // Calculate service fee if applicable
  let serviceFeeSats = 0n;
  let serviceFeeAddress: string | undefined;
  
  if (batchData.fee_config && batchData.fee_config.fee_percent > 0) {
    const afterNetworkFee = totalInputSats - networkFeeSats;
    
    // Apply exemption threshold
    if (afterNetworkFee > BigInt(batchData.fee_config.exemption_threshold)) {
      serviceFeeSats = (afterNetworkFee * BigInt(batchData.fee_config.fee_percent)) / 100n;
      serviceFeeAddress = batchData.fee_config.fee_address;
    }
  }
  
  const totalFeeSats = networkFeeSats + serviceFeeSats;
  const outputSats = totalInputSats - totalFeeSats;

  // Validate output amount
  if (outputSats <= 546n) {
    throw new Error(
      `Output amount (${outputSats} sats) is below dust threshold. ` +
      `Total input: ${totalInputSats} sats, Total fees: ${totalFeeSats} sats`
    );
  }

  // Add outputs
  if (serviceFeeSats > 546n && serviceFeeAddress) {
    // When we have a service fee, split the output
    const userOutputSats = totalInputSats - networkFeeSats - serviceFeeSats;
    tx.addOutputAddress(destination, userOutputSats);
    tx.addOutputAddress(serviceFeeAddress, serviceFeeSats);
  } else {
    // No service fee, just add the main output
    tx.addOutputAddress(destination, outputSats);
  }
  
  // Convert private key to bytes if string
  const privateKeyBytes = typeof privateKey === 'string' 
    ? hexToBytes(privateKey)
    : privateKey;
    
  // Generate public keys from private key
  const compressedPubkey = getPublicKey(privateKeyBytes, true);
  const uncompressedPubkey = getPublicKey(privateKeyBytes, false);
  
  // Sign all inputs - create signing info for each input
  // We need to adapt our ConsolidationInput format to what signAndFinalizeBareMultisig expects
  const signingInputs: MultisigInputInfo[] = inputs.map((input, idx) => {
    // Analyze the script with the pubkeys
    const scriptAnalysis = analyzeMultisigScript(input.script, compressedPubkey, uncompressedPubkey);

    if (!scriptAnalysis) {
      throw new Error(`Failed to analyze multisig script for input ${input.index}`);
    }

    // Use the API validation flag to determine sign type
    const signType = input.hasInvalidPubkeys
      ? 'invalid-pubkeys' as const
      : input.pubkeyHex.length === 130
        ? 'uncompressed' as const
        : 'compressed' as const;

    // Debug logging for the failing transaction
    if (idx === 0) {
      console.log(`First input debug:
        - UTXO: ${batchData.utxos[idx].txid}:${batchData.utxos[idx].vout}
        - Has invalid pubkeys: ${input.hasInvalidPubkeys}
        - Sign type: ${signType}
        - Script analysis signType: ${scriptAnalysis.signType}
        - Position: ${input.position}
        - Pubkey length: ${input.pubkeyHex.length}`);
    }

    return {
      signType,
      scriptPubKey: input.script,
      ourKeyIsCompressed: scriptAnalysis.ourKeyIsCompressed,
      ourKeyIsUncompressed: scriptAnalysis.ourKeyIsUncompressed
    };
  });
  
  // Sign the transaction
  // For large batches, signing can take a while, so periodically trigger activity to prevent auto-lock
  let activityInterval: NodeJS.Timeout | undefined;
  if (inputs.length > 50) {
    // Trigger activity every 10 seconds during signing
    activityInterval = setInterval(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      console.log('Triggering activity during consolidation signing...');
    }, 10000);
  }

  try {
    signAndFinalizeBareMultisig(tx, privateKeyBytes, compressedPubkey, uncompressedPubkey, signingInputs);
  } finally {
    // Clean up the interval
    if (activityInterval) {
      clearInterval(activityInterval);
    }
  }
  
  // Get the final signed transaction
  const signedTx = tx.hex;
  const actualTxSize = signedTx.length / 2; // Convert hex length to bytes
  
  // Calculate actual network fee based on real transaction size
  const actualNetworkFee = Math.ceil(actualTxSize * feeRateSatPerVByte);
  
  console.log(`Batch consolidation transaction built:
    - Inputs: ${batchData.utxos.length}
    - Total Input: ${totalInputSats} sats
    - Network Fee: ${Number(networkFeeSats)} sats (actual: ${actualNetworkFee} sats)
    - Service Fee: ${Number(serviceFeeSats)} sats
    - Output: ${Number(outputSats)} sats
    - Destination: ${destination}
    - Tx Size: ${actualTxSize} bytes`);
  
  return {
    signedTxHex: signedTx,
    totalInput: Number(totalInputSats),
    networkFee: actualNetworkFee,
    serviceFee: Number(serviceFeeSats),
    outputAmount: Number(outputSats),
    txSize: actualTxSize
  };
}