/**
 * Legacy Bitcoin Message Verification - SPEC COMPLIANT
 * Pre-BIP era signing, still used by Bitcoin Core for P2PKH addresses
 *
 * THIS IS THE PURE SPEC IMPLEMENTATION - DO NOT MODIFY FOR COMPATIBILITY
 *
 * Format is essentially the same as BIP-137 but only supports:
 * - P2PKH addresses
 * - Flags 27-30 (uncompressed) and 31-34 (compressed)
 */

import * as btc from '@scure/btc-signer';
import { base64 } from '@scure/base';
import { VerificationResult } from '../types';
import { hashMessage, recoverPublicKey, getAddressType } from '../utils';

/**
 * Verify a legacy Bitcoin message signature
 * Only works with P2PKH addresses as per Bitcoin Core
 */
export async function verifyLegacy(
  message: string,
  signature: string,
  address: string
): Promise<VerificationResult> {
  try {
    // Check if address is P2PKH
    const addressType = getAddressType(address);
    if (addressType !== 'P2PKH') {
      return {
        valid: false,
        details: `Legacy signatures only support P2PKH addresses, got ${addressType}`
      };
    }

    // Decode base64 signature
    let sigBytes: Uint8Array;
    try {
      sigBytes = base64.decode(signature);
    } catch {
      return { valid: false, details: 'Invalid base64 signature' };
    }

    // Must be 65 bytes
    if (sigBytes.length !== 65) {
      return { valid: false, details: `Invalid signature length: ${sigBytes.length}` };
    }

    const flag = sigBytes[0];

    // Legacy only supports flags 27-34
    if (flag < 27 || flag > 34) {
      return {
        valid: false,
        details: `Invalid legacy flag: ${flag}. Expected 27-34`
      };
    }

    // Determine compression and recovery ID
    let recoveryId: number;
    let compressed: boolean;

    if (flag >= 27 && flag <= 30) {
      recoveryId = flag - 27;
      compressed = false;
    } else {
      recoveryId = flag - 31;
      compressed = true;
    }

    // Hash the message
    const messageHash = hashMessage(message);

    // Extract signature data (skip flag)
    const sigData = sigBytes.slice(1);

    // Recover public key
    const publicKey = recoverPublicKey(sigData, messageHash, recoveryId, compressed);
    if (!publicKey) {
      return { valid: false, details: 'Failed to recover public key' };
    }

    // Derive P2PKH address
    let derivedAddress: string;
    try {
      derivedAddress = btc.p2pkh(publicKey).address!;
    } catch (error) {
      return { valid: false, details: `Failed to derive address: ${error}` };
    }

    // Compare addresses
    const valid = derivedAddress.toLowerCase() === address.toLowerCase();

    return {
      valid,
      method: valid ? `Legacy (P2PKH, ${compressed ? 'compressed' : 'uncompressed'})` : undefined,
      details: valid ? undefined : `Derived ${derivedAddress}, expected ${address}`
    };
  } catch (error) {
    return {
      valid: false,
      details: `Legacy verification error: ${error}`
    };
  }
}