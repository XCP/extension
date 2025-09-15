/**
 * FreeWallet-specific verification
 *
 * Known quirks:
 * - May use different message formatting
 * - May have issues with public key recovery
 * - Verified to work with bitcoinjs-message
 */

import { VerificationResult } from '../types';
import { verifyBIP137Loose } from '../bip137';

/**
 * Verify FreeWallet signatures
 * Uses loose BIP-137 verification with special handling
 */
export async function verifyFreeWallet(
  message: string,
  signature: string,
  address: string
): Promise<VerificationResult> {
  // FreeWallet uses BIP-137 format but may have quirks
  // We know it works with bitcoinjs-message, so we need to match that behavior

  // Try loose BIP-137 first
  const result = await verifyBIP137Loose(message, signature, address);

  if (result.valid) {
    return {
      ...result,
      method: `FreeWallet (${result.method})`
    };
  }

  // TODO: Add FreeWallet-specific quirks here
  // - Different message formatting?
  // - Different recovery process?
  // - Need to match bitcoinjs-message behavior

  return {
    valid: false,
    details: 'FreeWallet signature verification failed - implementation incomplete'
  };
}