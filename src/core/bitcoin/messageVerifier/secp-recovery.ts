/**
 * Isolated ECDSA public key recovery utility
 *
 * Pure implementation using noble/scure libraries only - no external dependencies!
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import type { SignatureInfo } from '@/core/bitcoin/messageVerifier/types';

/**
 * Recover public key from ECDSA signature
 *
 * Pure noble/scure implementation - no external dependencies required!
 *
 * @param signature - The parsed signature: 64 raw bytes plus its recovery id.
 * @param messageHash - 32-byte message hash
 * @returns Public key bytes or null if recovery fails
 */
export function recoverPublicKeyFromSignature(
  signature: SignatureInfo,
  messageHash: Uint8Array
): Uint8Array | null {
  try {
    const { raw, recoveryId, compressed = true } = signature;
    // Validate inputs
    if (raw.length !== 64) {
      return null;
    }
    if (messageHash.length !== 32) {
      return null;
    }
    if (recoveryId === undefined || recoveryId < 0 || recoveryId > 3) {
      return null;
    }

    // Create 65-byte signature for noble: [recoveryId, r, s]
    const recoveredSig = new Uint8Array(65);
    recoveredSig[0] = recoveryId;  // Raw recovery ID (0-3)
    recoveredSig.set(raw, 1);

    // Return the exact SEC encoding carried by the BIP-137 header. Compressed and uncompressed
    // encodings hash to different P2PKH addresses, so this is semantic rather than cosmetic.
    // `Signature.recoverPublicKey` takes the digest as given (no prehash) and returns the point, so
    // the encoding is chosen here; the top-level `secp256k1.recoverPublicKey` only returns the
    // compressed form.
    return secp256k1.Signature.fromBytes(recoveredSig, 'recovered')
      .recoverPublicKey(messageHash)  // message hash (32 bytes), not hashed again
      .toBytes(compressed);
  } catch (_error) {
    return null;
  }
}
