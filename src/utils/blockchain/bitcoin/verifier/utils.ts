/**
 * Utility functions for message verification
 */

import { sha256 } from '@noble/hashes/sha2';
import { hmac } from '@noble/hashes/hmac';
import * as secp256k1 from '@noble/secp256k1';
import type { AddressType } from './types';
import { recoverPublicKeyFromSignature } from './secp-recovery';

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
 * Normalize message for cross-platform compatibility
 * Handles common edge cases without changing the spec implementations
 */
export function normalizeMessage(message: string): string {
  // Handle line ending variations (\r\n vs \n)
  let normalized = message.replace(/\r\n/g, '\n');

  // Ensure UTF-8 consistency (already handled by TextEncoder, but explicit)
  // No changes needed - TextEncoder handles UTF-8 properly

  return normalized;
}

/**
 * Validate message for common issues
 * Returns validation info without throwing
 */
export function validateMessage(message: string): {
  valid: boolean;
  issues: string[];
  normalized: string;
} {
  const issues: string[] = [];

  // Check for line ending inconsistencies
  if (message.includes('\r\n')) {
    issues.push('Contains Windows line endings (\\r\\n)');
  }

  // Check for very long messages (some wallets have limits)
  if (message.length > 65535) {
    issues.push('Message longer than 65535 characters');
  }

  // Check for empty message
  if (message.length === 0) {
    issues.push('Empty message');
  }

  const normalized = normalizeMessage(message);

  return {
    valid: issues.length === 0,
    issues,
    normalized
  };
}

/**
 * Format message according to Bitcoin standard
 * This is the CORRECT implementation per Bitcoin Core
 */
export function formatMessageForSigning(message: string): Uint8Array {
  // Normalize the message first for cross-platform compatibility
  const normalizedMessage = normalizeMessage(message);
  const messageBytes = new TextEncoder().encode(normalizedMessage);

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
 * Detect signature format and normalize to base64
 * Handles hex, base64, and other common formats
 */
export function detectAndNormalizeSignature(signature: string): {
  format: 'base64' | 'hex' | 'bip322' | 'unknown';
  normalized: string;
  valid: boolean;
  error?: string;
} {
  // Trim whitespace
  const trimmed = signature.trim();

  // BIP-322 signatures start with specific prefixes
  if (trimmed.startsWith('tr:')) {
    return {
      format: 'bip322',
      normalized: trimmed,
      valid: true
    };
  }

  // Try to detect hex (even length, only hex chars)
  if (trimmed.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    try {
      // Convert hex to base64
      const bytes = new Uint8Array(trimmed.length / 2);
      for (let i = 0; i < trimmed.length; i += 2) {
        bytes[i / 2] = parseInt(trimmed.substr(i, 2), 16);
      }
      const base64 = btoa(String.fromCharCode(...bytes));

      return {
        format: 'hex',
        normalized: base64,
        valid: true
      };
    } catch (error) {
      return {
        format: 'hex',
        normalized: trimmed,
        valid: false,
        error: 'Invalid hex encoding'
      };
    }
  }

  // Try to validate as base64
  try {
    // Test if it's valid base64
    const decoded = atob(trimmed);
    // Re-encode to normalize padding
    const normalized = btoa(decoded);

    return {
      format: 'base64',
      normalized,
      valid: true
    };
  } catch (error) {
    return {
      format: 'unknown',
      normalized: trimmed,
      valid: false,
      error: 'Invalid base64 encoding'
    };
  }
}

/**
 * Validate signature format for different Bitcoin signing methods
 */
export function validateSignatureFormat(signature: string): {
  valid: boolean;
  format: 'legacy' | 'bip322' | 'unknown';
  length?: number;
  issues: string[];
} {
  const issues: string[] = [];
  const detection = detectAndNormalizeSignature(signature);

  if (!detection.valid) {
    issues.push(detection.error || 'Invalid signature encoding');
  }

  // BIP-322 validation
  if (detection.format === 'bip322') {
    return {
      valid: true,
      format: 'bip322',
      issues
    };
  }

  // Legacy/BIP-137 validation (should be 65 bytes when decoded)
  if (detection.format === 'base64' || detection.format === 'hex') {
    try {
      const decoded = atob(detection.normalized);
      const length = decoded.length;

      if (length === 65) {
        return {
          valid: issues.length === 0,
          format: 'legacy',
          length,
          issues
        };
      } else {
        issues.push(`Invalid signature length: ${length} bytes (expected 65)`);
      }
    } catch (error) {
      issues.push('Failed to decode signature');
    }
  }

  return {
    valid: false,
    format: 'unknown',
    issues
  };
}

/**
 * Recover public key from ECDSA signature
 * Uses isolated recovery utility (currently tiny-secp256k1, will migrate to noble)
 */
export function recoverPublicKey(
  signature: Uint8Array,
  messageHash: Uint8Array,
  recoveryId: number,
  compressed: boolean = true
): Uint8Array | null {
  return recoverPublicKeyFromSignature(signature, messageHash, recoveryId, compressed);
}

/**
 * Convert bytes to BigInt (helper function)
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
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