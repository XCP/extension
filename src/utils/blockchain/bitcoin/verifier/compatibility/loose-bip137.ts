/**
 * Loose BIP-137 Verification - COMPATIBILITY LAYER
 *
 * This is NOT spec-compliant BIP-137. This is for compatibility with wallets that:
 * - Use wrong header flags
 * - Sign Taproot addresses with BIP-137 (Ledger, Sparrow)
 * - Have other non-standard behaviors
 *
 * Based on the "Loose BIP-137" concept from bip322-js
 */

import * as btc from '@scure/btc-signer';
import { base64 } from '@scure/base';
import { VerificationResult } from '../types';
import { hashMessage, recoverPublicKey } from '../utils';

/**
 * Verify with loose BIP-137 rules
 * Ignores header flags and tries all possible combinations
 */
export async function verifyLooseBIP137(
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

    // Try ALL recovery combinations, ignoring what the flag says
    for (let recoveryId = 0; recoveryId <= 3; recoveryId++) {
      for (const compressed of [true, false]) {
        const publicKey = recoverPublicKey(sigData, messageHash, recoveryId, compressed);
        if (!publicKey) continue;

        // Try to derive ALL possible address types from this public key
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

          // P2TR (Taproot) - NOT STANDARD but Ledger/Sparrow do this
          try {
            const xOnlyPubKey = publicKey.slice(1, 33);
            possibleAddresses.push({
              address: btc.p2tr(xOnlyPubKey).address!,
              type: 'P2TR (non-standard BIP-137)'
            });
          } catch {}
        }

        // Check if any derived address matches
        for (const derived of possibleAddresses) {
          if (derived.address.toLowerCase() === address.toLowerCase()) {
            return {
              valid: true,
              method: `Loose BIP-137`,
              details: `Matched as ${derived.type}, flag=${flag}, recoveryId=${recoveryId}, compressed=${compressed}`
            };
          }
        }
      }
    }

    return {
      valid: false,
      details: 'Could not recover matching public key with loose BIP-137'
    };
  } catch (error) {
    return {
      valid: false,
      details: `Loose BIP-137 error: ${error}`
    };
  }
}