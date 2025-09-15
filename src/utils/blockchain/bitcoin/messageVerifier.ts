/**
 * Bitcoin Message Verifier
 * 
 * Implements Bitcoin message signature verification for all address types
 */

import { sha256 } from '@noble/hashes/sha2';
import { hmac } from '@noble/hashes/hmac';
import * as btc from '@scure/btc-signer';
import { hex, base64 } from '@scure/base';
import * as secp256k1 from '@noble/secp256k1';
import { formatMessageForSigning } from '@/utils/blockchain/bitcoin/messageSigner';
import {
  verifyBIP322Signature,
  verifySimpleBIP322,
  parseBIP322Signature,
  getAddressType
} from '@/utils/blockchain/bitcoin/bip322';

// Required initialization for @noble/secp256k1 v3
import { hashes } from '@noble/secp256k1';

if (!hashes.hmacSha256) {
  hashes.hmacSha256 = (key: Uint8Array, msg: Uint8Array): Uint8Array => {
    return hmac(sha256, key, msg);
  };
  hashes.sha256 = sha256;
  
  // Also set async versions if needed
  hashes.hmacSha256Async = async (key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> => {
    return hmac(sha256, key, msg);
  };
  hashes.sha256Async = async (msg: Uint8Array): Promise<Uint8Array> => {
    return sha256(msg);
  };
}

/**
 * Recover public key from signature using noble/secp256k1 v3
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

    // Create signature object for noble/secp256k1
    const sig = new secp256k1.Signature(
      BigInt('0x' + hex.encode(r)),
      BigInt('0x' + hex.encode(s))
    );

    // Add recovery information
    const sigWithRecovery = sig.addRecoveryBit(recovery);

    // Recover the public key
    const point = sigWithRecovery.recoverPublicKey(messageHash);

    // Return in appropriate format
    if (compressed) {
      return point.toRawBytes(true);
    } else {
      return point.toRawBytes(false);
    }
  } catch (error) {
    console.error('Public key recovery failed:', error);
    return null;
  }
}

/**
 * Verify using legacy BIP-137 format with optional loose verification
 * Loose verification allows signatures with incorrect header flags to be validated
 * by checking if the recovered public key can derive the target address
 */
async function verifyLegacyFormat(
  message: string,
  signature: string,
  address: string,
  useLooseVerification: boolean = true
): Promise<boolean> {
  try {
    // Decode base64 signature
    let sigBytes: Uint8Array;
    try {
      sigBytes = base64.decode(signature);
    } catch {
      return false;
    }

    // Signature must be 65 bytes (flag + r + s)
    if (sigBytes.length !== 65) {
      return false;
    }

    // Extract recovery flag and signature components
    const flag = sigBytes[0];

    // Format and hash the message
    const formattedMessage = formatMessageForSigning(message);
    const messageHash = sha256(sha256(formattedMessage));

    // Determine recovery id and compression from flag
    let recoveryId: number;
    let compressed: boolean;

    if (flag >= 27 && flag <= 30) {
      // P2PKH uncompressed
      recoveryId = flag - 27;
      compressed = false;
    } else if (flag >= 31 && flag <= 34) {
      // P2PKH compressed
      recoveryId = flag - 31;
      compressed = true;
    } else if (flag >= 35 && flag <= 38) {
      // P2SH-P2WPKH
      recoveryId = flag - 35;
      compressed = true;
    } else if (flag >= 39 && flag <= 42) {
      // P2WPKH
      recoveryId = flag - 39;
      compressed = true;
    } else {
      return false;
    }

    // Recover public key with correct compression
    const publicKey = recoverPublicKey(messageHash, sigBytes, recoveryId, compressed);
    if (!publicKey) {
      return false;
    }

    // Use the recovered public key
    const finalPublicKey = publicKey;

    if (useLooseVerification) {
      // Loose verification: Check if the recovered public key can derive the target address
      // This allows signatures with "wrong" header flags to still verify
      // as long as the public key matches

      // Try to derive different address types from the recovered public key
      const possibleAddresses: string[] = [];

      // P2PKH (handle both compressed and uncompressed)
      try {
        if (finalPublicKey.length === 65) {
          // Uncompressed key - also try compressed version
          const compressed = secp256k1.Point.fromHex(hex.encode(finalPublicKey)).toRawBytes(true);
          possibleAddresses.push(btc.p2pkh(compressed).address!);
        }
        possibleAddresses.push(btc.p2pkh(finalPublicKey).address!);
      } catch {}

      // P2WPKH
      try {
        possibleAddresses.push(btc.p2wpkh(finalPublicKey).address!);
      } catch {}

      // P2SH-P2WPKH
      try {
        const p2wpkh = btc.p2wpkh(finalPublicKey);
        possibleAddresses.push(btc.p2sh(p2wpkh).address!);
      } catch {}

      // P2TR (Taproot) - for compatibility with Ledger/Sparrow
      try {
        const xOnlyPubKey = finalPublicKey.length === 33 ? finalPublicKey.slice(1, 33) : finalPublicKey;
        if (xOnlyPubKey.length === 32) {
          possibleAddresses.push(btc.p2tr(xOnlyPubKey).address!);
        }
      } catch {}

      // Check if any derived address matches the target address
      return possibleAddresses.some(addr =>
        addr.toLowerCase() === address.toLowerCase()
      );
    } else {
      // Strict verification: Address must match the flag type exactly
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
        return false;
      }

      // Compare addresses (case-insensitive for compatibility)
      return derivedAddress.toLowerCase() === address.toLowerCase();
    }
  } catch (error) {
    return false;
  }
}

/**
 * Determine if an address is P2PKH
 */
function isP2PKH(address: string): boolean {
  return address.startsWith('1') || address.startsWith('m') || address.startsWith('n');
}

/**
 * Determine if an address is P2WPKH
 */
function isP2WPKH(address: string): boolean {
  if (!address.startsWith('bc1q') && !address.startsWith('tb1q')) {
    return false;
  }
  // P2WPKH addresses are shorter than P2WSH
  return address.length === 42 || address.length === 62; // mainnet or testnet
}

/**
 * Determine if an address is P2SH
 */
function isP2SH(address: string): boolean {
  return address.startsWith('3') || address.startsWith('2');
}

/**
 * Verify a signed message with full validation
 * Implements fallback chain: BIP-322 → BIP-137 → Legacy
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
 * Verify a signed message and return the method used
 */
export async function verifyMessageWithMethod(
  message: string,
  signature: string,
  address: string
): Promise<{ valid: boolean; method?: string }> {
  try {
    // 1. Try BIP-322 verification first (works for all address types)
    try {
      const isValid = await verifyBIP322Signature(message, signature, address);
      if (isValid) {
        const addressType = getAddressType(address);
        if (addressType === 'P2TR') {
          return { valid: true, method: 'BIP-322 (Taproot/Schnorr)' };
        } else if (addressType === 'P2WPKH') {
          return { valid: true, method: 'BIP-322 (Native SegWit)' };
        } else if (addressType === 'P2SH') {
          return { valid: true, method: 'BIP-322 (Nested SegWit)' };
        } else {
          return { valid: true, method: 'BIP-322' };
        }
      }
    } catch (e) {
      // BIP-322 verification failed, continue to fallback
      console.debug('BIP-322 verification failed, trying fallback:', e);
    }

    // 2. Try BIP-137/Legacy format as fallback
    const addressType = getAddressType(address);

    // BIP-137/Legacy only works for certain address types
    if (addressType === 'P2PKH' || addressType === 'P2WPKH' || addressType === 'P2SH') {
      try {
        const isValid = await verifyLegacyFormat(message, signature, address);
        if (isValid) {
          if (addressType === 'P2WPKH') {
            return { valid: true, method: 'BIP-137 (Native SegWit)' };
          } else if (addressType === 'P2SH') {
            return { valid: true, method: 'BIP-137 (Nested SegWit)' };
          } else {
            return { valid: true, method: 'BIP-137/Legacy' };
          }
        }
      } catch (e) {
        console.debug('BIP-137/Legacy verification failed:', e);
      }
    }

    // If all verification methods fail
    return { valid: false };
  } catch (error) {
    console.error('Message verification failed:', error);
    return { valid: false };
  }
}

/**
 * Verify a Taproot signature using BIP-322
 * This implements full BIP-322 verification for Taproot addresses
 */
export async function verifyTaprootSignature(
  message: string,
  signature: string,
  address: string
): Promise<boolean> {
  // Validate signature format
  if (!signature.startsWith('tr:')) {
    return false;
  }

  // Check if address is a valid Taproot address
  if (!address.startsWith('bc1p') && !address.startsWith('tb1p')) {
    return false;
  }

  // Use the full BIP-322 verification implementation
  try {
    // Try full BIP-322 verification first
    const isValid = await verifyBIP322Signature(message, signature, address);

    if (!isValid) {
      // Fall back to simple BIP-322 verification as some wallets may use simplified format
      return await verifySimpleBIP322(message, signature, address);
    }

    return isValid;
  } catch (error) {
    console.error('Taproot signature verification failed:', error);
    return false;
  }
}

/**
 * Get the address type from a recovery flag
 */
export function getAddressTypeFromFlag(flag: number): string | null {
  if (flag >= 27 && flag <= 30) {
    return 'P2PKH (uncompressed)';
  } else if (flag >= 31 && flag <= 34) {
    return 'P2PKH (compressed)';
  } else if (flag >= 35 && flag <= 38) {
    return 'P2SH-P2WPKH';
  } else if (flag >= 39 && flag <= 42) {
    return 'P2WPKH';
  }
  return null;
}

/**
 * Verify a message with explicit loose/strict BIP-137 verification
 * @param message - The message to verify
 * @param signature - The signature to verify
 * @param address - The Bitcoin address
 * @param useLooseVerification - Whether to use loose BIP-137 verification (default: true)
 */
export async function verifyMessageWithLooseBIP137(
  message: string,
  signature: string,
  address: string,
  useLooseVerification: boolean = true
): Promise<boolean> {
  // First try BIP-322
  try {
    const isValid = await verifyBIP322Signature(message, signature, address);
    if (isValid) return true;
  } catch {}

  // Then try BIP-137 with specified loose/strict mode
  return await verifyLegacyFormat(message, signature, address, useLooseVerification);
}

/**
 * Parse a signature to extract its components
 */
export async function parseSignature(signature: string): Promise<{
  valid: boolean;
  type?: string;
  flag?: number;
  r?: string;
  s?: string;
}> {
  // Try BIP-322 parser first
  const bip322Parsed = await parseBIP322Signature(signature);
  if (bip322Parsed) {
    if (bip322Parsed.type === 'taproot') {
      // Taproot Schnorr signature (64 bytes)
      const sigHex = hex.encode(bip322Parsed.data);
      return {
        valid: true,
        type: 'Taproot',
        r: sigHex.slice(0, 64),
        s: sigHex.slice(64, 128)
      };
    } else if ((bip322Parsed.type === 'legacy' || bip322Parsed.type === 'segwit') && bip322Parsed.data.length === 65) {
      // Classic signature format (65 bytes with recovery flag)
      const flag = bip322Parsed.data[0];
      const r = hex.encode(bip322Parsed.data.slice(1, 33));
      const s = hex.encode(bip322Parsed.data.slice(33, 65));

      const addressType = getAddressTypeFromFlag(flag);
      if (!addressType) {
        return { valid: false };
      }

      return {
        valid: true,
        type: addressType,
        flag,
        r,
        s
      };
    } else if (bip322Parsed.type === 'segwit' && bip322Parsed.data.length > 65) {
      // Witness data format from BIP-322 signing
      // This is valid BIP-322 but we can't extract r/s easily
      return {
        valid: true,
        type: 'BIP-322 Witness'
      };
    }
  }

  // Fallback to manual parsing if BIP-322 parser doesn't recognize it
  // Handle Taproot signatures
  if (signature.startsWith('tr:')) {
    const sigData = signature.slice(3);

    // Check for extended format (signature:pubkey)
    const parts = sigData.split(':');
    if (parts.length === 2 && parts[0].length === 128 && parts[1].length === 64) {
      // Extended format with public key
      return {
        valid: true,
        type: 'Taproot',
        r: parts[0].slice(0, 64),
        s: parts[0].slice(64, 128)
      };
    } else if (sigData.length === 128) {
      // Simple format
      return {
        valid: true,
        type: 'Taproot',
        r: sigData.slice(0, 64),
        s: sigData.slice(64, 128)
      };
    }
    return { valid: false };
  }

  // Try to decode as base64
  try {
    const sigBytes = base64.decode(signature);

    if (sigBytes.length !== 65) {
      return { valid: false };
    }

    const flag = sigBytes[0];
    const r = hex.encode(sigBytes.slice(1, 33));
    const s = hex.encode(sigBytes.slice(33, 65));

    const addressType = getAddressTypeFromFlag(flag);
    if (!addressType) {
      return { valid: false };
    }

    return {
      valid: true,
      type: addressType,
      flag,
      r,
      s
    };
  } catch {
    return { valid: false };
  }
}