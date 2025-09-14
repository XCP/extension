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
import { verifyBIP322Signature, verifySimpleBIP322, parseBIP322Signature } from '@/utils/blockchain/bitcoin/bip322';

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
  recovery: number
): Uint8Array | null {
  try {
    // Extract r and s from signature
    const r = signature.slice(1, 33);
    const s = signature.slice(33, 65);
    
    // Create signature with recovery byte for recoverPublicKey
    // v3 expects: recovery (1 byte) + r (32 bytes) + s (32 bytes)
    const sigWithRecovery = new Uint8Array(65);
    sigWithRecovery[0] = recovery;
    sigWithRecovery.set(r, 1);
    sigWithRecovery.set(s, 33);
    
    // Recover the public key using the recovered format
    const pubKey = secp256k1.recoverPublicKey(sigWithRecovery, messageHash, { prehash: true });
    return pubKey; // Already compressed bytes
  } catch (error) {
    console.error('Public key recovery failed:', error);
    return null;
  }
}

/**
 * Verify a signed message with full validation
 */
export async function verifyMessage(
  message: string,
  signature: string,
  address: string
): Promise<boolean> {
  try {
    // Handle Taproot signatures with BIP-322 verification
    if (signature.startsWith('tr:')) {
      // Use full BIP-322 verification for Taproot addresses
      return await verifyBIP322Signature(message, signature, address);
    }
    
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
    
    // Recover public key
    const publicKey = recoverPublicKey(messageHash, sigBytes, recoveryId);
    if (!publicKey) {
      return false;
    }
    
    // Derive address from recovered public key based on flag
    let derivedAddress: string;
    
    if (flag >= 27 && flag <= 34) {
      // P2PKH
      // Use the recovered public key directly
      const pubKeyToUse = publicKey;
      derivedAddress = btc.p2pkh(pubKeyToUse).address!;
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
  } catch (error) {
    console.error('Message verification failed:', error);
    return false;
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
        type: 'Taproot (BIP-322)',
        r: sigHex.slice(0, 64),
        s: sigHex.slice(64, 128)
      };
    } else if (bip322Parsed.type === 'legacy' || bip322Parsed.type === 'segwit') {
      // Classic signature format
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
    }
  }

  // Fallback to manual parsing if BIP-322 parser doesn't recognize it
  // Handle Taproot signatures
  if (signature.startsWith('tr:')) {
    const sigHex = signature.slice(3);
    if (sigHex.length === 128) {
      return {
        valid: true,
        type: 'Taproot',
        r: sigHex.slice(0, 64),
        s: sigHex.slice(64, 128)
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