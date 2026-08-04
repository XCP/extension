/**
 * Fee Estimation Utilities
 *
 * Provides functions for estimating Bitcoin transaction sizes and fees
 * based on address types and UTXO counts.
 */

/**
 * Gets the input size in vbytes based on address type.
 * - P2PKH (legacy, starts with 1): ~148 vbytes
 * - P2SH (wrapped segwit, starts with 3): ~91 vbytes
 * - P2WPKH (native segwit, starts with bc1q): ~68 vbytes
 * - P2TR (taproot, starts with bc1p): ~58 vbytes
 */
export function getInputSizeForAddress(address: string): number {
  if (address.startsWith('bc1p') || address.startsWith('tb1p')) {
    return 58; // P2TR (taproot)
  }
  if (address.startsWith('bc1q') || address.startsWith('tb1q')) {
    return 68; // P2WPKH (native segwit)
  }
  if (address.startsWith('3') || address.startsWith('2')) {
    return 91; // P2SH (often wrapped segwit)
  }
  // Legacy P2PKH (starts with 1 or m/n for testnet)
  return 148;
}

/**
 * Estimates transaction vsize based on UTXO count and address type.
 * - Fixed overhead: ~10.5 vbytes
 * - Per input: varies by address type
 * - Per output: ~31 vbytes (P2WPKH) or ~34 vbytes (P2PKH)
 *
 * @param utxoCount - Number of inputs (UTXOs being spent)
 * @param outputCount - Number of outputs
 * @param address - Source address (used to determine input size)
 * @returns Estimated transaction vsize in vbytes
 */
export function estimateVsize(utxoCount: number, outputCount: number, address: string): number {
  const overhead = 10.5;
  const inputSize = getInputSizeForAddress(address);
  const outputSize = 31; // Assume segwit outputs
  return Math.ceil(overhead + (utxoCount * inputSize) + (outputCount * outputSize));
}

/**
 * Estimates the transaction fee in satoshis.
 *
 * @param utxoCount - Number of inputs
 * @param outputCount - Number of outputs
 * @param address - Source address
 * @param feeRate - Fee rate in sat/vB
 * @returns Estimated fee in satoshis
 */
export function estimateFee(
  utxoCount: number,
  outputCount: number,
  address: string,
  feeRate: number
): number {
  const vsize = estimateVsize(utxoCount, outputCount, address);
  return Math.ceil(vsize * feeRate);
}
