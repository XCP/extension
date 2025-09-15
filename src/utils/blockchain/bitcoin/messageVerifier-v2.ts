/**
 * Bitcoin Message Verifier V2
 * Based on bip322-js implementation with Loose BIP-137 support
 *
 * Verification order:
 * 1. BIP-322 (modern standard)
 * 2. BIP-137 with loose verification (cross-wallet compatibility)
 * 3. Legacy format (original Bitcoin signing)
 */

import { sha256 } from '@noble/hashes/sha2';
import { hmac } from '@noble/hashes/hmac';
import * as btc from '@scure/btc-signer';
import { hex, base64 } from '@scure/base';
import * as secp256k1 from '@noble/secp256k1';

// Required initialization for @noble/secp256k1
import { hashes } from '@noble/secp256k1';

if (!hashes.hmacSha256) {
  hashes.hmacSha256 = (key: Uint8Array, msg: Uint8Array): Uint8Array => {
    return hmac(sha256, key, msg);
  };
  hashes.sha256 = sha256;

  hashes.hmacSha256Async = async (key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> => {
    return hmac(sha256, key, msg);
  };
  hashes.sha256Async = async (msg: Uint8Array): Promise<Uint8Array> => {
    return sha256(msg);
  };
}

/**
 * Format message for signing/verification according to Bitcoin standard
 */
export function formatMessageForSigning(message: string): Uint8Array {
  const messageBytes = new TextEncoder().encode(message);

  // The magic string already includes \x18 which is its length
  const magicBytes = new TextEncoder().encode('\x18Bitcoin Signed Message:\n');

  // Encode message length as varint
  let messageLengthBytes: Uint8Array;
  if (messageBytes.length < 0xfd) {
    messageLengthBytes = new Uint8Array([messageBytes.length]);
  } else if (messageBytes.length <= 0xffff) {
    messageLengthBytes = new Uint8Array([0xfd, messageBytes.length & 0xff, (messageBytes.length >> 8) & 0xff]);
  } else {
    throw new Error('Message too long for signing');
  }

  // Combine: magic + message_length_varint + message
  const formatted = new Uint8Array(
    magicBytes.length +
    messageLengthBytes.length +
    messageBytes.length
  );

  let offset = 0;
  formatted.set(magicBytes, offset);
  offset += magicBytes.length;
  formatted.set(messageLengthBytes, offset);
  offset += messageLengthBytes.length;
  formatted.set(messageBytes, offset);

  return formatted;
}

/**
 * Recover public key from BIP-137 signature
 */
function recoverPublicKey(
  messageHash: Uint8Array,
  signature: Uint8Array,
  recovery: number,
  compressed: boolean = true
): Uint8Array | null {
  try {
    // Extract r and s from signature
    const r = signature.slice(1, 33);
    const s = signature.slice(33, 65);

    // Create signature object
    const sig = new secp256k1.Signature(
      BigInt('0x' + hex.encode(r)),
      BigInt('0x' + hex.encode(s))
    );

    // Add recovery information
    const sigWithRecovery = sig.addRecoveryBit(recovery);

    // Recover the public key
    const point = sigWithRecovery.recoverPublicKey(messageHash);

    // Return in appropriate format
    return point.toRawBytes(compressed);
  } catch (error) {
    console.debug('Public key recovery failed:', error);
    return null;
  }
}

/**
 * Get address type from string
 */
export function getAddressType(address: string): string {
  if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n')) {
    return 'P2PKH';
  } else if (address.startsWith('3') || address.startsWith('2')) {
    return 'P2SH';
  } else if (address.startsWith('bc1q') || address.startsWith('tb1q')) {
    return 'P2WPKH';
  } else if (address.startsWith('bc1p') || address.startsWith('tb1p')) {
    return 'P2TR';
  }
  return 'Unknown';
}

/**
 * Verify BIP-137/Legacy signature with LOOSE verification
 * This is the key to cross-wallet compatibility
 *
 * Loose verification:
 * - Ignores the header flag's address type indication
 * - Recovers the public key from the signature
 * - Derives ALL possible address types from that public key
 * - Returns true if ANY derived address matches the target
 */
async function verifyBIP137Loose(
  message: string,
  signature: string,
  address: string
): Promise<{ valid: boolean; method?: string }> {
  try {
    // Decode base64 signature
    let sigBytes: Uint8Array;
    try {
      sigBytes = base64.decode(signature);
    } catch {
      return { valid: false };
    }

    // Signature must be 65 bytes (flag + r + s)
    if (sigBytes.length !== 65) {
      return { valid: false };
    }

    const flag = sigBytes[0];

    // Format and hash the message
    const formattedMessage = formatMessageForSigning(message);
    const messageHash = sha256(sha256(formattedMessage));

    // Try all possible recovery IDs and compression states
    // This is the "loose" part - we ignore what the flag says and try everything
    const attempts = [
      { recoveryId: 0, compressed: false },
      { recoveryId: 1, compressed: false },
      { recoveryId: 2, compressed: false },
      { recoveryId: 3, compressed: false },
      { recoveryId: 0, compressed: true },
      { recoveryId: 1, compressed: true },
      { recoveryId: 2, compressed: true },
      { recoveryId: 3, compressed: true },
    ];

    for (const { recoveryId, compressed } of attempts) {
      const publicKey = recoverPublicKey(messageHash, sigBytes, recoveryId, compressed);
      if (!publicKey) continue;

      // Try to derive all possible address types from this public key
      const possibleAddresses: string[] = [];

      // P2PKH
      try {
        possibleAddresses.push(btc.p2pkh(publicKey).address!);
      } catch {}

      // P2WPKH (only for compressed keys)
      if (compressed) {
        try {
          possibleAddresses.push(btc.p2wpkh(publicKey).address!);
        } catch {}

        // P2SH-P2WPKH
        try {
          const p2wpkh = btc.p2wpkh(publicKey);
          possibleAddresses.push(btc.p2sh(p2wpkh).address!);
        } catch {}

        // P2TR (Taproot) - for Ledger/Sparrow compatibility
        try {
          const xOnlyPubKey = publicKey.slice(1, 33);
          possibleAddresses.push(btc.p2tr(xOnlyPubKey).address!);
        } catch {}
      }

      // Check if any derived address matches (case-insensitive)
      const match = possibleAddresses.some(addr =>
        addr.toLowerCase() === address.toLowerCase()
      );

      if (match) {
        // Determine which type matched
        const addressType = getAddressType(address);
        let method = 'BIP-137 Loose';

        if (flag >= 27 && flag <= 30) method += ' (flag: P2PKH uncompressed)';
        else if (flag >= 31 && flag <= 34) method += ' (flag: P2PKH compressed)';
        else if (flag >= 35 && flag <= 38) method += ' (flag: P2SH-P2WPKH)';
        else if (flag >= 39 && flag <= 42) method += ' (flag: P2WPKH)';

        method += ` -> ${addressType}`;

        return { valid: true, method };
      }
    }

    return { valid: false };
  } catch (error) {
    console.debug('BIP-137 loose verification failed:', error);
    return { valid: false };
  }
}

/**
 * Verify BIP-137/Legacy signature with STRICT verification
 * The flag must match the address type exactly
 */
async function verifyBIP137Strict(
  message: string,
  signature: string,
  address: string
): Promise<{ valid: boolean; method?: string }> {
  try {
    // Decode base64 signature
    let sigBytes: Uint8Array;
    try {
      sigBytes = base64.decode(signature);
    } catch {
      return { valid: false };
    }

    // Signature must be 65 bytes (flag + r + s)
    if (sigBytes.length !== 65) {
      return { valid: false };
    }

    const flag = sigBytes[0];

    // Format and hash the message
    const formattedMessage = formatMessageForSigning(message);
    const messageHash = sha256(sha256(formattedMessage));

    // Determine recovery id and compression from flag (STRICT)
    let recoveryId: number;
    let compressed: boolean;
    let expectedAddressType: string;

    if (flag >= 27 && flag <= 30) {
      // P2PKH uncompressed
      recoveryId = flag - 27;
      compressed = false;
      expectedAddressType = 'P2PKH';
    } else if (flag >= 31 && flag <= 34) {
      // P2PKH compressed
      recoveryId = flag - 31;
      compressed = true;
      expectedAddressType = 'P2PKH';
    } else if (flag >= 35 && flag <= 38) {
      // P2SH-P2WPKH
      recoveryId = flag - 35;
      compressed = true;
      expectedAddressType = 'P2SH';
    } else if (flag >= 39 && flag <= 42) {
      // P2WPKH
      recoveryId = flag - 39;
      compressed = true;
      expectedAddressType = 'P2WPKH';
    } else {
      return { valid: false };
    }

    // Check if address type matches what the flag indicates
    const actualAddressType = getAddressType(address);
    if (actualAddressType !== expectedAddressType) {
      return { valid: false };
    }

    // Recover public key
    const publicKey = recoverPublicKey(messageHash, sigBytes, recoveryId, compressed);
    if (!publicKey) {
      return { valid: false };
    }

    // Derive the specific address type indicated by the flag
    let derivedAddress: string;

    if (flag >= 27 && flag <= 34) {
      // P2PKH
      derivedAddress = btc.p2pkh(publicKey).address!;
    } else if (flag >= 35 && flag <= 38) {
      // P2SH-P2WPKH
      const p2wpkh = btc.p2wpkh(publicKey);
      derivedAddress = btc.p2sh(p2wpkh).address!;
    } else if (flag >= 39 && flag <= 42) {
      // P2WPKH
      derivedAddress = btc.p2wpkh(publicKey).address!;
    } else {
      return { valid: false };
    }

    // Compare addresses (case-insensitive)
    if (derivedAddress.toLowerCase() === address.toLowerCase()) {
      return { valid: true, method: `BIP-137 Strict (${expectedAddressType})` };
    }

    return { valid: false };
  } catch (error) {
    console.debug('BIP-137 strict verification failed:', error);
    return { valid: false };
  }
}

/**
 * Main verification function - tries all methods in order
 */
export async function verifyMessage(
  message: string,
  signature: string,
  address: string
): Promise<boolean> {
  const result = await verifyMessageWithMethod(message, signature, address);
  return result.valid;
}

/**
 * Verify with method information
 */
export async function verifyMessageWithMethod(
  message: string,
  signature: string,
  address: string
): Promise<{ valid: boolean; method?: string }> {
  // 1. Try BIP-322 (would need to import from bip322.ts)
  // Skipping for now as we focus on BIP-137/Legacy

  // 2. Try BIP-137 Strict (Bitcoin Core style)
  const strictResult = await verifyBIP137Strict(message, signature, address);
  if (strictResult.valid) {
    return strictResult;
  }

  // 3. Try BIP-137 Loose (cross-wallet compatibility)
  const looseResult = await verifyBIP137Loose(message, signature, address);
  if (looseResult.valid) {
    return looseResult;
  }

  return { valid: false };
}

/**
 * Export for testing
 */
export { verifyBIP137Loose, verifyBIP137Strict };