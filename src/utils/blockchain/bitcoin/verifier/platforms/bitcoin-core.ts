/**
 * Bitcoin Core specific verification
 *
 * Bitcoin Core uses:
 * - Legacy format for P2PKH addresses only
 * - Strict BIP-137 compliance
 * - Standard message formatting
 */

import { VerificationResult } from '../types';
import { verifyLegacy } from '../legacy';
import { getAddressType } from '../utils';

export async function verifyBitcoinCore(
  message: string,
  signature: string,
  address: string
): Promise<VerificationResult> {
  // Bitcoin Core only supports P2PKH with legacy format
  const addressType = getAddressType(address);

  if (addressType !== 'P2PKH') {
    return {
      valid: false,
      details: `Bitcoin Core only supports P2PKH addresses, got ${addressType}`
    };
  }

  const result = await verifyLegacy(message, signature, address);

  if (result.valid) {
    return {
      ...result,
      method: `Bitcoin Core (${result.method})`
    };
  }

  return result;
}