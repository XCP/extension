/**
 * BIP-137: Bitcoin Signed Message Standard - SPEC COMPLIANT
 * https://github.com/bitcoin/bips/blob/master/bip-0137.mediawiki
 *
 * THIS IS THE PURE SPEC IMPLEMENTATION - DO NOT MODIFY FOR COMPATIBILITY
 *
 * Signature format:
 * - 1 byte: header flag (27-42)
 * - 32 bytes: r value
 * - 32 bytes: s value
 *
 * Header flags:
 * - 27-30: P2PKH uncompressed
 * - 31-34: P2PKH compressed
 * - 35-38: P2SH-P2WPKH (nested SegWit)
 * - 39-42: P2WPKH (native SegWit)
 */

import * as btc from '@scure/btc-signer';
import { base64 } from '@scure/base';
import { VerificationResult } from '../types';
import { hashMessage, recoverPublicKey, parseSignatureFlag, getAddressType } from '../utils';

/**
 * Verify a BIP-137 signature according to the specification
 * This is STRICT mode - the flag MUST match the address type
 */
export async function verifyBIP137(
  message: string,
  signature: string,
  address: string
): Promise<VerificationResult> {
  try {
    // Decode base64 signature
    let sigBytes: Uint8Array;
    try {
      sigBytes = base64.decode(signature);
    } catch {
      return { valid: false, details: 'Invalid base64 signature' };
    }

    // BIP-137 signature must be exactly 65 bytes
    if (sigBytes.length !== 65) {
      return { valid: false, details: `Invalid signature length: ${sigBytes.length}, expected 65` };
    }

    // Parse header flag
    const flag = sigBytes[0];
    const { addressType, recoveryId, compressed } = parseSignatureFlag(flag);

    if (addressType === null) {
      return { valid: false, details: `Invalid BIP-137 header flag: ${flag}` };
    }

    // Verify address type matches what the flag indicates
    const actualAddressType = getAddressType(address);

    // BIP-137 spec: flag must match address type
    if (addressType === 'P2PKH' && actualAddressType !== 'P2PKH') {
      return {
        valid: false,
        details: `BIP-137: Flag ${flag} indicates P2PKH but address is ${actualAddressType}`
      };
    }
    if (addressType === 'P2SH-P2WPKH' && actualAddressType !== 'P2SH') {
      return {
        valid: false,
        details: `BIP-137: Flag ${flag} indicates P2SH-P2WPKH but address is ${actualAddressType}`
      };
    }
    if (addressType === 'P2WPKH' && actualAddressType !== 'P2WPKH') {
      return {
        valid: false,
        details: `BIP-137: Flag ${flag} indicates P2WPKH but address is ${actualAddressType}`
      };
    }

    // Hash the message
    const messageHash = hashMessage(message);

    // Extract signature components (skip flag byte)
    const sigData = sigBytes.slice(1);

    // Recover public key
    const publicKey = recoverPublicKey(sigData, messageHash, recoveryId, compressed);
    if (!publicKey) {
      return { valid: false, details: 'Failed to recover public key from signature' };
    }

    // Derive address from recovered public key
    let derivedAddress: string;

    try {
      if (addressType === 'P2PKH') {
        derivedAddress = btc.p2pkh(publicKey).address!;
      } else if (addressType === 'P2SH-P2WPKH') {
        const p2wpkh = btc.p2wpkh(publicKey);
        derivedAddress = btc.p2sh(p2wpkh).address!;
      } else if (addressType === 'P2WPKH') {
        derivedAddress = btc.p2wpkh(publicKey).address!;
      } else {
        return { valid: false, details: `Unsupported address type: ${addressType}` };
      }
    } catch (error) {
      return { valid: false, details: `Failed to derive address: ${error}` };
    }

    // Compare addresses
    const valid = derivedAddress.toLowerCase() === address.toLowerCase();

    return {
      valid,
      method: valid ? `BIP-137 (${addressType})` : undefined,
      details: valid ? undefined : `Derived ${derivedAddress}, expected ${address}`
    };
  } catch (error) {
    return {
      valid: false,
      details: `BIP-137 verification error: ${error}`
    };
  }
}