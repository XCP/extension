/**
 * BIP-322: Generic Signed Message Format - SPEC COMPLIANT
 * https://github.com/bitcoin/bips/blob/master/bip-0322.mediawiki
 *
 * THIS IS THE PURE SPEC IMPLEMENTATION - DO NOT MODIFY FOR COMPATIBILITY
 *
 * Verifies the *simple* format: the base64 witness stack of the `to_sign` spend, for P2WPKH,
 * P2SH-P2WPKH and P2TR key-path. P2PKH is also accepted as the two-item `[signature, pubkey]`
 * stack over the legacy sighash that this wallet signs (see `bip322.ts`).
 *
 * The *full* format — a whole serialized `to_sign` transaction — is not verified. It is recognised
 * and refused with a reason, rather than run through the simple verifier and reported under a
 * "Full" label it never checked.
 */

import { base64 } from '@scure/base';
import { verifyBIP322Signature } from '@/core/bitcoin/bip322';
import type { VerificationResult } from '@/core/bitcoin/messageVerifier/types';
import { getAddressType } from '@/core/bitcoin/messageVerifier/utils';

/**
 * Whether the decoded signature is shaped like a serialized `to_sign` transaction, which BIP-322
 * fixes at version 0. A simple signature starts with its witness item count instead, which is
 * never 0 for a real signature, so the two cannot be mistaken for each other.
 */
function looksLikeFullSignature(signature: string): boolean {
  try {
    const bytes = base64.decode(signature);
    return bytes.length >= 60 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0;
  } catch {
    return false;
  }
}

/**
 * Verify a BIP-322 simple signature.
 */
export async function verifyBIP322(
  message: string,
  signature: string,
  address: string
): Promise<VerificationResult> {
  try {
    const addressType = getAddressType(address);

    if (await verifyBIP322Signature(message, signature, address)) {
      return {
        valid: true,
        method: `BIP-322 Simple (${addressType})`,
        details: 'Verified using BIP-322 simple (witness stack of the to_sign spend)'
      };
    }

    if (looksLikeFullSignature(signature)) {
      return {
        valid: false,
        details: 'BIP-322 full-format signatures (a serialized to_sign transaction) are not supported'
      };
    }

    return {
      valid: false,
      details: 'BIP-322 simple verification failed'
    };
  } catch (error) {
    return {
      valid: false,
      details: `BIP-322 verification error: ${error}`
    };
  }
}
