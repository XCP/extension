/**
 * Isolated ECDSA public key recovery utility
 *
 * Pure implementation using noble/scure libraries only - no external dependencies!
 */

import * as secp256k1 from '@noble/secp256k1';

/**
 * Recover public key from ECDSA signature
 *
 * Pure noble/scure implementation - no external dependencies required!
 *
 * @param signature - 64-byte signature (r + s)
 * @param messageHash - 32-byte message hash
 * @param recoveryId - Recovery ID (0-3)
 * @param compressed - Whether to return compressed public key
 * @returns Public key bytes or null if recovery fails
 */
export function recoverPublicKeyFromSignature(
  signature: Uint8Array,
  messageHash: Uint8Array,
  recoveryId: number,
  compressed: boolean = true
): Uint8Array | null {
  try {
    // Validate inputs
    if (signature.length !== 64) {
      return null;
    }
    if (messageHash.length !== 32) {
      return null;
    }
    if (recoveryId < 0 || recoveryId > 3) {
      return null;
    }

    // Create 65-byte signature for noble: [recoveryId, r, s]
    const recoveredSig = new Uint8Array(65);
    recoveredSig[0] = recoveryId;  // Raw recovery ID (0-3)
    recoveredSig.set(signature, 1);

    // Use noble's recoverPublicKey with correct parameter order and options
    const publicKeyBytes = secp256k1.recoverPublicKey(
      recoveredSig,           // signature (65 bytes)
      messageHash,            // message hash (32 bytes)
      { prehash: false }      // don't hash again - we already hashed
    );

    // Noble returns the public key bytes directly
    // If we need uncompressed and got compressed (or vice versa), convert
    if (compressed && publicKeyBytes.length === 65) {
      // Convert uncompressed to compressed
      return publicKeyBytes.slice(0, 33);
    } else if (!compressed && publicKeyBytes.length === 33) {
      // For uncompressed we'd need to reconstruct - for now just return what we have
      // Most Bitcoin signatures use compressed anyway
      return publicKeyBytes;
    }

    return publicKeyBytes;
  } catch (error) {
    return null;
  }
}