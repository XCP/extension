/**
 * Bitcore/bitcore-message specific verification
 *
 * Bitcore uses:
 * - BIP-137 format
 * - May have loose flag handling
 * - Standard message formatting
 */

import { VerificationResult } from '../types';
import { verifyBIP137Loose } from '../bip137';

export async function verifyBitcore(
  message: string,
  signature: string,
  address: string
): Promise<VerificationResult> {
  // Bitcore uses BIP-137 with potentially loose handling
  const result = await verifyBIP137Loose(message, signature, address);

  if (result.valid) {
    return {
      ...result,
      method: `Bitcore (${result.method})`
    };
  }

  return result;
}