/**
 * BIP-137: Bitcoin Signed Message Standard
 * https://github.com/bitcoin/bips/blob/master/bip-0137.mediawiki
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
import { base64, hex } from '@scure/base';
import { VerificationResult } from './types';
import { hashMessage, recoverPublicKey, parseSignatureFlag, getAddressType } from './utils';

/**
 * Verify a BIP-137 signature (STRICT mode)
 * The header flag MUST match the address type
 */
export async function verifyBIP137Strict(
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
      return { valid: false, details: `Invalid signature length: ${sigBytes.length}` };
    }

    // Parse header flag
    const flag = sigBytes[0];
    const { addressType, recoveryId, compressed } = parseSignatureFlag(flag);

    if (addressType === null) {
      return { valid: false, details: `Invalid header flag: ${flag}` };
    }

    // Check if address type matches flag
    const actualAddressType = getAddressType(address);

    // Strict mode: must match exactly
    if (addressType === 'P2PKH' && actualAddressType !== 'P2PKH') {
      return { valid: false, details: `Flag indicates P2PKH but address is ${actualAddressType}` };
    }
    if (addressType === 'P2SH-P2WPKH' && actualAddressType !== 'P2SH') {
      return { valid: false, details: `Flag indicates P2SH-P2WPKH but address is ${actualAddressType}` };
    }
    if (addressType === 'P2WPKH' && actualAddressType !== 'P2WPKH') {
      return { valid: false, details: `Flag indicates P2WPKH but address is ${actualAddressType}` };
    }

    // Hash the message
    const messageHash = hashMessage(message);

    // Extract signature components (skip flag byte)
    const sigData = sigBytes.slice(1);

    // Recover public key
    const publicKey = recoverPublicKey(sigData, messageHash, recoveryId, compressed);
    if (!publicKey) {
      return { valid: false, details: 'Failed to recover public key' };
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
        return { valid: false, details: 'Unsupported address type' };
      }
    } catch (error) {
      return { valid: false, details: `Failed to derive address: ${error}` };
    }

    // Compare addresses
    const valid = derivedAddress.toLowerCase() === address.toLowerCase();

    return {
      valid,
      method: valid ? `BIP-137 Strict (${addressType})` : undefined,
      details: valid ? undefined : `Derived ${derivedAddress}, expected ${address}`
    };
  } catch (error) {
    return {
      valid: false,
      details: `BIP-137 verification error: ${error}`
    };
  }
}

/**
 * Verify a BIP-137 signature (LOOSE mode)
 * Tries all possible recovery combinations and address derivations
 * This handles wallets that use wrong header flags
 */
export async function verifyBIP137Loose(
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

    // Must be 65 bytes
    if (sigBytes.length !== 65) {
      return { valid: false, details: `Invalid signature length: ${sigBytes.length}` };
    }

    const flag = sigBytes[0];
    const messageHash = hashMessage(message);
    const sigData = sigBytes.slice(1);

    // Try all recovery combinations
    for (let recoveryId = 0; recoveryId <= 3; recoveryId++) {
      for (const compressed of [true, false]) {
        const publicKey = recoverPublicKey(sigData, messageHash, recoveryId, compressed);
        if (!publicKey) continue;

        // Try to derive all possible address types
        const possibleAddresses: { address: string; type: string }[] = [];

        // P2PKH
        try {
          possibleAddresses.push({
            address: btc.p2pkh(publicKey).address!,
            type: 'P2PKH'
          });
        } catch {}

        // Only try SegWit addresses with compressed keys
        if (compressed) {
          // P2WPKH
          try {
            possibleAddresses.push({
              address: btc.p2wpkh(publicKey).address!,
              type: 'P2WPKH'
            });
          } catch {}

          // P2SH-P2WPKH
          try {
            const p2wpkh = btc.p2wpkh(publicKey);
            possibleAddresses.push({
              address: btc.p2sh(p2wpkh).address!,
              type: 'P2SH-P2WPKH'
            });
          } catch {}

          // P2TR (for Ledger/Sparrow that incorrectly use BIP-137 for Taproot)
          try {
            const xOnlyPubKey = publicKey.slice(1, 33);
            possibleAddresses.push({
              address: btc.p2tr(xOnlyPubKey).address!,
              type: 'P2TR (non-standard)'
            });
          } catch {}
        }

        // Check if any derived address matches
        for (const derived of possibleAddresses) {
          if (derived.address.toLowerCase() === address.toLowerCase()) {
            return {
              valid: true,
              method: `BIP-137 Loose`,
              details: `Recovered as ${derived.type}, flag=${flag}, recoveryId=${recoveryId}, compressed=${compressed}`
            };
          }
        }
      }
    }

    return {
      valid: false,
      details: 'Could not recover matching public key'
    };
  } catch (error) {
    return {
      valid: false,
      details: `BIP-137 loose verification error: ${error}`
    };
  }
}

/**
 * Main BIP-137 verification - tries strict first, then loose
 */
export async function verifyBIP137(
  message: string,
  signature: string,
  address: string,
  strict: boolean = false
): Promise<VerificationResult> {
  // Try strict verification first
  const strictResult = await verifyBIP137Strict(message, signature, address);
  if (strictResult.valid) {
    return strictResult;
  }

  // If strict mode only, return the strict result
  if (strict) {
    return strictResult;
  }

  // Try loose verification as fallback
  return await verifyBIP137Loose(message, signature, address);
}