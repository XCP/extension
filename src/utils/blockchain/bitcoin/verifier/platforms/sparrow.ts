/**
 * Sparrow Wallet specific verification
 *
 * Sparrow:
 * - Implements BIP-322 for all address types
 * - Falls back to BIP-137 for older formats
 * - Incorrectly uses BIP-137 for Taproot (known issue)
 */

import { VerificationResult } from '../types';
import { verifyBIP322 } from '../bip322';
import { verifyBIP137Loose } from '../bip137';
import { getAddressType } from '../utils';

export async function verifySparrow(
  message: string,
  signature: string,
  address: string
): Promise<VerificationResult> {
  const addressType = getAddressType(address);

  // Try BIP-322 first (Sparrow's preferred format)
  const bip322Result = await verifyBIP322(message, signature, address);
  if (bip322Result.valid) {
    return {
      ...bip322Result,
      method: `Sparrow (${bip322Result.method})`
    };
  }

  // Known issue: Sparrow uses BIP-137 for Taproot
  if (addressType === 'P2TR') {
    const bip137Result = await verifyBIP137Loose(message, signature, address);
    if (bip137Result.valid) {
      return {
        ...bip137Result,
        method: `Sparrow Taproot Quirk (${bip137Result.method})`,
        details: 'Sparrow incorrectly uses BIP-137 for Taproot addresses'
      };
    }
  }

  // Fall back to regular BIP-137
  const bip137Result = await verifyBIP137Loose(message, signature, address);
  if (bip137Result.valid) {
    return {
      ...bip137Result,
      method: `Sparrow (${bip137Result.method})`
    };
  }

  return {
    valid: false,
    details: 'Sparrow signature verification failed'
  };
}