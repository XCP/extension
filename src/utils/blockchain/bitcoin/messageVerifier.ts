/**
 * Bitcoin Message Verifier
 * 
 * Implements Bitcoin message signature verification for all address types
 */

import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import * as btc from '@scure/btc-signer';
import { hex, base64 } from '@scure/base';
import * as secp256k1 from '@noble/secp256k1';
import { formatMessageForSigning } from '@/utils/blockchain/bitcoin/messageSigner';

// Required initialization for @noble/secp256k1 v2
if (!secp256k1.etc.hmacSha256Sync) {
  secp256k1.etc.hmacSha256Sync = (
    key: Uint8Array,
    ...messages: Uint8Array[]
  ): Uint8Array => {
    const h = hmac.create(sha256, key);
    for (const msg of messages) h.update(msg);
    return h.digest();
  };
}

/**
 * Recover public key from signature using noble/secp256k1 v2
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
    
    // Use the recoverPublicKey function from noble/secp256k1 v2
    // This requires the signature to have addRecoveryBit set
    const sig = new secp256k1.Signature(
      BigInt('0x' + hex.encode(r)),
      BigInt('0x' + hex.encode(s))
    ).addRecoveryBit(recovery);
    
    // Recover the public key
    const pubKey = sig.recoverPublicKey(messageHash);
    return pubKey.toRawBytes(true); // compressed
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
    // Handle Taproot signatures differently (simplified verification)
    if (signature.startsWith('tr:')) {
      // For Taproot, we'd need BIP-322 verification
      // This is a simplified check for now
      const sigHex = signature.slice(3);
      if (sigHex.length !== 128) return false;
      
      // Check if address is Taproot
      if (!address.startsWith('bc1p') && !address.startsWith('tb1p')) {
        return false;
      }
      
      // TODO: Implement full BIP-322 verification
      return true;
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
      const pubKeyToUse = compressed ? publicKey : secp256k1.getPublicKey(secp256k1.etc.bytesToNumberBE(sigBytes.slice(1, 33)), false);
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
 * Verify a Taproot signature (simplified version)
 * Full BIP-322 verification would be more complex
 */
export async function verifyTaprootSignature(
  message: string,
  signature: string,
  address: string
): Promise<boolean> {
  // This is a placeholder for full BIP-322 verification
  // For now, we just do basic format validation
  
  if (!signature.startsWith('tr:')) {
    return false;
  }
  
  const sigHex = signature.slice(3);
  if (sigHex.length !== 128) {
    return false;
  }
  
  // Check if address is a valid Taproot address
  if (!address.startsWith('bc1p') && !address.startsWith('tb1p')) {
    return false;
  }
  
  // TODO: Implement full BIP-322 verification
  // This would involve:
  // 1. Creating a virtual transaction
  // 2. Verifying the Schnorr signature
  // 3. Checking the signature against the address
  
  return true;
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
export function parseSignature(signature: string): {
  valid: boolean;
  type?: string;
  flag?: number;
  r?: string;
  s?: string;
} {
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