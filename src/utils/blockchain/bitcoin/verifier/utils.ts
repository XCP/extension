/**
 * Utility functions for message verification
 */

import { sha256 } from '@noble/hashes/sha2';
import { hmac } from '@noble/hashes/hmac';
import * as secp256k1 from '@noble/secp256k1';
import { AddressType } from './types';

// Initialize secp256k1
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
 * Format message according to Bitcoin standard
 * This is the CORRECT implementation per Bitcoin Core
 */
export function formatMessageForSigning(message: string): Uint8Array {
  const messageBytes = new TextEncoder().encode(message);

  // Magic bytes including the length prefix
  const magicBytes = new TextEncoder().encode('\x18Bitcoin Signed Message:\n');

  // Encode message length as varint
  const messageLengthBytes = encodeVarInt(messageBytes.length);

  // Combine: magic + message_length + message
  const result = new Uint8Array(
    magicBytes.length +
    messageLengthBytes.length +
    messageBytes.length
  );

  let offset = 0;
  result.set(magicBytes, offset);
  offset += magicBytes.length;
  result.set(messageLengthBytes, offset);
  offset += messageLengthBytes.length;
  result.set(messageBytes, offset);

  return result;
}

/**
 * Encode variable-length integer (Bitcoin's CompactSize)
 */
export function encodeVarInt(n: number): Uint8Array {
  if (n < 0xfd) {
    return new Uint8Array([n]);
  } else if (n <= 0xffff) {
    return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff]);
  } else if (n <= 0xffffffff) {
    return new Uint8Array([
      0xfe,
      n & 0xff,
      (n >> 8) & 0xff,
      (n >> 16) & 0xff,
      (n >> 24) & 0xff
    ]);
  } else {
    throw new Error('Number too large for varint encoding');
  }
}

/**
 * Hash message for signing/verification
 */
export function hashMessage(message: string): Uint8Array {
  const formatted = formatMessageForSigning(message);
  return sha256(sha256(formatted));
}

/**
 * Detect address type from address string
 */
export function getAddressType(address: string): AddressType {
  // P2PKH - Legacy
  if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n')) {
    return 'P2PKH';
  }

  // P2SH - Could be many things, including P2SH-P2WPKH
  if (address.startsWith('3') || address.startsWith('2')) {
    return 'P2SH';
  }

  // P2WPKH - Native SegWit v0
  if (address.startsWith('bc1q') || address.startsWith('tb1q')) {
    return 'P2WPKH';
  }

  // P2WSH - Native SegWit v0 (longer addresses)
  if ((address.startsWith('bc1q') || address.startsWith('tb1q')) && address.length > 42) {
    return 'P2WSH';
  }

  // P2TR - Taproot
  if (address.startsWith('bc1p') || address.startsWith('tb1p')) {
    return 'P2TR';
  }

  return 'Unknown';
}

/**
 * Recover public key from ECDSA signature
 * This is the CRITICAL function that needs to work correctly
 */
export function recoverPublicKey(
  messageHash: Uint8Array,
  signature: Uint8Array,
  recoveryId: number,
  compressed: boolean = true
): Uint8Array | null {
  try {
    // Ensure we have a 64-byte signature (r + s)
    if (signature.length < 64) {
      return null;
    }

    // Extract r and s
    const r = signature.slice(0, 32);
    const s = signature.slice(32, 64);

    // Create signature object
    const sig = new secp256k1.Signature(
      BigInt('0x' + Buffer.from(r).toString('hex')),
      BigInt('0x' + Buffer.from(s).toString('hex'))
    );

    // Add recovery bit
    const sigWithRecovery = sig.addRecoveryBit(recoveryId);

    // Recover public key
    const point = sigWithRecovery.recoverPublicKey(messageHash);

    // Return in requested format
    return point.toRawBytes(compressed);
  } catch (error) {
    console.debug('Public key recovery failed:', error);
    return null;
  }
}

/**
 * Parse BIP-137 signature header flag
 */
export function parseSignatureFlag(flag: number): {
  addressType: 'P2PKH' | 'P2SH-P2WPKH' | 'P2WPKH' | null;
  recoveryId: number;
  compressed: boolean;
} {
  if (flag >= 27 && flag <= 30) {
    return {
      addressType: 'P2PKH',
      recoveryId: flag - 27,
      compressed: false
    };
  } else if (flag >= 31 && flag <= 34) {
    return {
      addressType: 'P2PKH',
      recoveryId: flag - 31,
      compressed: true
    };
  } else if (flag >= 35 && flag <= 38) {
    return {
      addressType: 'P2SH-P2WPKH',
      recoveryId: flag - 35,
      compressed: true
    };
  } else if (flag >= 39 && flag <= 42) {
    return {
      addressType: 'P2WPKH',
      recoveryId: flag - 39,
      compressed: true
    };
  }

  return {
    addressType: null,
    recoveryId: -1,
    compressed: false
  };
}