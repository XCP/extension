/**
 * Isolated ECDSA public key recovery utility
 *
 * Pure implementation using noble/scure libraries only - no external dependencies!
 */

import * as secp256k1 from '@noble/secp256k1';
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

    // Ask noble for the exact SEC encoding carried by the BIP-137 header. Compressed and
    // uncompressed encodings hash to different P2PKH addresses, so this is semantic rather than
    // cosmetic.
    return secp256k1.recoverPublicKey(
      recoveredSig,           // signature (65 bytes)
      messageHash,            // message hash (32 bytes)
      {
        prehash: false,       // don't hash again - we already hashed
        isCompressed: compressed,
      }
    );
  } catch (_error) {
    return null;
  }
}
