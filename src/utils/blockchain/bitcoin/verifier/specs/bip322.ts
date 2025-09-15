/**
 * BIP-322: Generic Signed Message Format - SPEC COMPLIANT
 * https://github.com/bitcoin/bips/blob/master/bip-0322.mediawiki
 *
 * THIS IS THE PURE SPEC IMPLEMENTATION - DO NOT MODIFY FOR COMPATIBILITY
 *
 * Supports all address types including SegWit and Taproot
 * Uses virtual transactions for verification
 */

import { VerificationResult } from '../types';
import { getAddressType } from '../utils';

// Import from our existing BIP-322 implementation
import {
  verifyBIP322Signature as verifyBIP322Full,
  verifySimpleBIP322
} from '../../bip322';

/**
 * Verify a BIP-322 signature according to the specification
 * Supports both simple and full formats
 */
export async function verifyBIP322(
  message: string,
  signature: string,
  address: string
): Promise<VerificationResult> {
  try {
    const addressType = getAddressType(address);

    // Try full BIP-322 first
    try {
      const isValid = await verifyBIP322Full(message, signature, address);
      if (isValid) {
        return {
          valid: true,
          method: `BIP-322 Full (${addressType})`,
          details: 'Verified using full BIP-322 with virtual transactions'
        };
      }
    } catch (error) {
      console.debug('Full BIP-322 verification failed:', error);
    }

    // Try simple BIP-322 as fallback
    try {
      const isValid = await verifySimpleBIP322(message, signature, address);
      if (isValid) {
        return {
          valid: true,
          method: `BIP-322 Simple (${addressType})`,
          details: 'Verified using simple BIP-322'
        };
      }
    } catch (error) {
      console.debug('Simple BIP-322 verification failed:', error);
    }

    return {
      valid: false,
      details: 'BIP-322 verification failed for both full and simple formats'
    };
  } catch (error) {
    return {
      valid: false,
      details: `BIP-322 verification error: ${error}`
    };
  }
}