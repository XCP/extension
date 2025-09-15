/**
 * Ledger hardware wallet specific verification
 *
 * Ledger:
 * - Uses BIP-137 for all address types
 * - Incorrectly uses BIP-137 for Taproot (known issue)
 * - May have different flag handling
 */

import { VerificationResult } from '../types';
import { verifyBIP137Loose } from '../bip137';
import { getAddressType } from '../utils';

export async function verifyLedger(
  message: string,
  signature: string,
  address: string
): Promise<VerificationResult> {
  const addressType = getAddressType(address);

  // Ledger uses BIP-137 for everything, including Taproot (incorrectly)
  const result = await verifyBIP137Loose(message, signature, address);

  if (result.valid) {
    let method = `Ledger (${result.method})`;
    let details = result.details;

    if (addressType === 'P2TR') {
      method = `Ledger Taproot Quirk (${result.method})`;
      details = 'Ledger incorrectly uses BIP-137 for Taproot addresses';
    }

    return {
      ...result,
      method,
      details
    };
  }

  return {
    valid: false,
    details: 'Ledger signature verification failed'
  };
}