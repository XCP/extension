/**
 * Electrum wallet specific verification
 *
 * Electrum:
 * - Uses its own message format historically
 * - Now supports standard BIP-137
 * - May have different prefix handling
 */

import { VerificationResult } from '../types';
import { verifyBIP137 } from '../bip137';

export async function verifyElectrum(
  message: string,
  signature: string,
  address: string
): Promise<VerificationResult> {
  // Modern Electrum uses standard BIP-137
  const result = await verifyBIP137(message, signature, address, false);

  if (result.valid) {
    return {
      ...result,
      method: `Electrum (${result.method})`
    };
  }

  // TODO: Add support for old Electrum format if needed
  // - Different message prefix
  // - Different encoding

  return {
    valid: false,
    details: 'Electrum signature verification failed'
  };
}