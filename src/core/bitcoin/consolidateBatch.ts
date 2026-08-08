/**
 * Batch Consolidation for Bare Multisig UTXOs
 * Builds and signs recovery transactions from xcp.io recovery API batch data.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey } from '@noble/secp256k1';
import { Transaction } from '@scure/btc-signer';
import type { ConsolidationData, ConsolidationUTXO } from '@/core/bitcoin/consolidationApi';
import { assertSignableBareMultisig, signAndFinalizeBareMultisig } from '@/core/bitcoin/multisigSigner';
import { multiply, roundUp, toSafeInteger } from '@/core/numeric';

// RBF-enabled sequence number
const RBF_SEQUENCE = 0xfffffffd;

const DUST_LIMIT_SATS = 546n;

// Empirical consolidation transaction sizes: ~115 bytes per bare multisig
// input (36 outpoint + 1 scriptSig varint + ~74 scriptSig + 4 sequence),
// 10 bytes base overhead, ~34 bytes per P2PKH output.
const BYTES_PER_INPUT = 115;
const BASE_OVERHEAD = 10;
const BYTES_PER_OUTPUT = 34;

const PREV_TX_PARSE_OPTS = {
  allowUnknownInputs: true,
  allowUnknownOutputs: true,
  disableScriptCheck: true,
} as const;

export interface ConsolidationResult {
  signedTxHex: string;
  totalInput: number; // sats
  networkFee: number; // sats
  serviceFee: number; // sats
  outputAmount: number; // sats
  txSize: number; // bytes
}

/**
 * Cross-check an API-supplied UTXO against its own prev_tx_hex. The legacy
 * sighash does not commit to input values, so a wrong amount would silently
 * change the real fee paid; a wrong script would produce an invalid
 * signature. Both are verifiable locally from data the API already returns:
 * the txid (which the signature does commit to) must hash from prev_tx_hex,
 * and the named output must carry the claimed script and value.
 */
function verifyUtxoAgainstPrevTx(
  utxo: ConsolidationUTXO,
  prevTxCache: Map<string, Transaction>
): void {
  let prevTx = prevTxCache.get(utxo.txid);
  if (!prevTx) {
    const prevTxBytes = hexToBytes(utxo.prev_tx_hex);
    const computedTxid = bytesToHex(sha256(sha256(prevTxBytes)).reverse());
    if (computedTxid !== utxo.txid.toLowerCase()) {
      throw new Error(
        `Previous transaction data does not match its txid for UTXO ${utxo.txid}:${utxo.vout}`
      );
    }
    prevTx = Transaction.fromRaw(prevTxBytes, PREV_TX_PARSE_OPTS);
    prevTxCache.set(utxo.txid, prevTx);
  }

  let prevOutput: ReturnType<typeof prevTx.getOutput> | undefined;
  try {
    prevOutput = prevTx.getOutput(utxo.vout);
  } catch {
    prevOutput = undefined;
  }
  if (!prevOutput?.script || prevOutput.amount === undefined) {
    throw new Error(`Output ${utxo.vout} not found in previous transaction ${utxo.txid}`);
  }
  if (prevOutput.amount !== BigInt(utxo.amount)) {
    throw new Error(
      `Value mismatch for UTXO ${utxo.txid}:${utxo.vout}: ` +
      `previous transaction pays ${prevOutput.amount} sats, API reported ${utxo.amount}`
    );
  }
  if (bytesToHex(prevOutput.script) !== utxo.script.toLowerCase()) {
    throw new Error(`Script mismatch for UTXO ${utxo.txid}:${utxo.vout}`);
  }
}

/**
 * Consolidate bare multisig UTXOs using batch data from the recovery API
 * @param privateKey - Private key in hex format
 * @param sourceAddress - Bitcoin address owning the UTXOs
 * @param batchData - Consolidation data from the recovery API
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
  const utxos = batchData.utxos;
  if (!utxos || utxos.length === 0) {
    throw new Error('No UTXOs to consolidate in this batch');
  }

  const destination = destinationAddress || sourceAddress;
  const privateKeyBytes = hexToBytes(privateKey);

  try {
    const ourPubkeys = [getPublicKey(privateKeyBytes, true), getPublicKey(privateKeyBytes, false)];

    const tx = new Transaction();
    const scripts: Uint8Array[] = [];
    const prevTxCache = new Map<string, Transaction>();
    let totalInputSats = 0n;

    for (const utxo of utxos) {
      verifyUtxoAgainstPrevTx(utxo, prevTxCache);

      const script = hexToBytes(utxo.script);
      try {
        assertSignableBareMultisig(script, ourPubkeys);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Cannot sign UTXO ${utxo.txid}:${utxo.vout}: ${reason}`);
      }

      tx.addInput({
        txid: hexToBytes(utxo.txid),
        index: utxo.vout,
        sequence: RBF_SEQUENCE,
      });
      scripts.push(script);
      totalInputSats += BigInt(utxo.amount);
    }

    const inputCountVarintSize = utxos.length >= 253 ? 3 : 1;
    const estimateNetworkFee = (outputCount: number): bigint => BigInt(roundUp(multiply(
      utxos.length * BYTES_PER_INPUT + BASE_OVERHEAD + inputCountVarintSize + outputCount * BYTES_PER_OUTPUT,
      feeRateSatPerVByte
    )).toFixed());

    let networkFeeSats = estimateNetworkFee(1);
    let serviceFeeSats = 0n;
    let serviceFeeAddress: string | undefined;

    if (batchData.fee_config && batchData.fee_config.fee_percent > 0) {
      if (!batchData.fee_config.fee_address) {
        throw new Error('Recovery fee configuration is unavailable. Please try again later.');
      }
      const feeWithServiceOutput = estimateNetworkFee(2);
      const afterNetworkFee = totalInputSats - feeWithServiceOutput;
      if (afterNetworkFee > BigInt(batchData.fee_config.exemption_threshold)) {
        const candidate = (afterNetworkFee * BigInt(batchData.fee_config.fee_percent)) / 100n;
        // A sub-dust service output is unpayable; below that size the whole
        // amount stays with the user instead of becoming extra miner fee.
        if (candidate > DUST_LIMIT_SATS) {
          serviceFeeSats = candidate;
          serviceFeeAddress = batchData.fee_config.fee_address;
          networkFeeSats = feeWithServiceOutput;
        }
      }
    }

    const totalFeeSats = networkFeeSats + serviceFeeSats;
    const outputSats = totalInputSats - totalFeeSats;
    if (outputSats <= DUST_LIMIT_SATS) {
      throw new Error(
        `Output amount (${outputSats} sats) is below dust threshold. ` +
        `Total input: ${totalInputSats} sats, Total fees: ${totalFeeSats} sats`
      );
    }

    tx.addOutputAddress(destination, outputSats);
    if (serviceFeeSats > 0n && serviceFeeAddress) {
      tx.addOutputAddress(serviceFeeAddress, serviceFeeSats);
    }

    await signAndFinalizeBareMultisig(tx, privateKeyBytes, scripts);

    const signedTxHex = tx.hex;
    return {
      signedTxHex,
      totalInput: toSafeInteger(totalInputSats) ?? 0,
      // The outputs were constructed with the estimated fee, so that is the
      // exact fee the transaction pays; the recovery API rejects reports
      // where the fees don't reconcile against the raw transaction.
      networkFee: toSafeInteger(networkFeeSats) ?? 0,
      serviceFee: toSafeInteger(serviceFeeSats) ?? 0,
      outputAmount: toSafeInteger(outputSats) ?? 0,
      txSize: signedTxHex.length / 2,
    };
  } finally {
    // Zero out private key bytes after use (defense in depth)
    // See ADR-001 in sessionManager.ts for JS memory limitation context
    privateKeyBytes.fill(0);
  }
}
