/**
 * Batch Consolidation for Bare Multisig UTXOs
 * Handles consolidation using data from the Laravel API
 */

import { Transaction, SigHash } from '@scure/btc-signer';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
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
  let hasInvalidPubkeys = false;
  
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
      hasInvalidPubkeys = true;
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
  // More accurate estimation based on bare multisig type:
  // - 1-of-2 bare multisig: ~147 bytes per input (36 txid + 4 vout + 1 script_len + 74 sig + 1 OP_0 + 4 sequence)
  // - 1-of-3 bare multisig: ~180 bytes per input (additional pubkey)
  // - Base overhead: 10 bytes (4 version + 1-3 input count + 1-3 output count + 4 locktime)
  // - Output: ~34 bytes per P2PKH/P2WPKH output
  
  const bytesPerInput = 147; // Conservative estimate for 1-of-2 multisig
  const baseOverhead = 10;
  const bytesPerOutput = 34;
  
  // First calculate basic network fee
  const numOutputsBase = 1; // Start with just main output
  const estimatedSizeBase = (batchData.utxos.length * bytesPerInput) + baseOverhead + (numOutputsBase * bytesPerOutput);
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
  
  // Add main output
  tx.addOutputAddress(destination, outputSats);
  
  // Add service fee output if applicable
  if (serviceFeeSats > 546n && serviceFeeAddress) {
    // Adjust main output
    tx.updateOutput(0, { amount: outputSats - serviceFeeSats });
    // Add service fee output
    tx.addOutputAddress(serviceFeeAddress, serviceFeeSats);
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
  signAndFinalizeBareMultisig(tx, privateKeyBytes, compressedPubkey, uncompressedPubkey, signingInputs);
  
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