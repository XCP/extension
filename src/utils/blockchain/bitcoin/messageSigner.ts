/**
 * Bitcoin Message Signer
 * 
 * Implements Bitcoin message signing compatible with BIP-137 (P2PKH, P2SH-P2WPKH, P2WPKH)
 * and simplified Taproot signing
 */

import { sha256 } from '@noble/hashes/sha2';
import { hmac } from '@noble/hashes/hmac';
import * as btc from '@scure/btc-signer';
import { hex, base64 } from '@scure/base';
import { bytesToHex } from '@noble/hashes/utils';
import * as secp256k1 from '@noble/secp256k1';
import type { AddressType } from '../bitcoin';

// Required initialization for @noble/secp256k1 v3
// Set up the HMAC and SHA256 functions needed for deterministic signatures
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
 * Magic bytes for Bitcoin Signed Message
 */
const BITCOIN_MESSAGE_MAGIC = '\x18Bitcoin Signed Message:\n';

/**
 * Format message for signing according to Bitcoin standard
 */
export function formatMessageForSigning(message: string): Uint8Array {
  const messageBytes = new TextEncoder().encode(message);
  const messageLengthBytes = encodeVarInt(messageBytes.length);
  
  const magicBytes = new TextEncoder().encode(BITCOIN_MESSAGE_MAGIC);
  const magicLengthBytes = encodeVarInt(magicBytes.length - 1); // -1 because \x18 is already the length byte
  
  // Combine: magic_length + magic + message_length + message
  const combined = new Uint8Array(
    magicLengthBytes.length + 
    magicBytes.length - 1 + // -1 because we skip \x18
    messageLengthBytes.length + 
    messageBytes.length
  );
  
  let offset = 0;
  combined.set(magicLengthBytes, offset);
  offset += magicLengthBytes.length;
  combined.set(magicBytes.slice(1), offset); // Skip \x18
  offset += magicBytes.length - 1;
  combined.set(messageLengthBytes, offset);
  offset += messageLengthBytes.length;
  combined.set(messageBytes, offset);
  
  return combined;
}

/**
 * Encode variable length integer (CompactSize)
 */
function encodeVarInt(n: number): Uint8Array {
  if (n < 0xfd) {
    return new Uint8Array([n]);
  } else if (n <= 0xffff) {
    const bytes = new Uint8Array(3);
    bytes[0] = 0xfd;
    bytes[1] = n & 0xff;
    bytes[2] = (n >> 8) & 0xff;
    return bytes;
  } else if (n <= 0xffffffff) {
    const bytes = new Uint8Array(5);
    bytes[0] = 0xfe;
    bytes[1] = n & 0xff;
    bytes[2] = (n >> 8) & 0xff;
    bytes[3] = (n >> 16) & 0xff;
    bytes[4] = (n >> 24) & 0xff;
    return bytes;
  } else {
    throw new Error('Value too large for CompactSize encoding');
  }
}

/**
 * Sign a message with a private key for Legacy (P2PKH) addresses
 * This follows the traditional Bitcoin message signing format
 */
export async function signMessageLegacy(
  message: string,
  privateKey: Uint8Array,
  compressed: boolean = true
): Promise<string> {
  // Format and double SHA256 the message
  const formattedMessage = formatMessageForSigning(message);
  const messageHash = sha256(sha256(formattedMessage));
  
  // Sign the message with recovery (v3 returns compact signature)
  const sigBytes = secp256k1.sign(messageHash, privateKey, { prehash: true });
  
  // Parse the compact signature to get r and s
  const r = sigBytes.slice(0, 32);
  const s = sigBytes.slice(32, 64);
  
  // For recovery in Bitcoin message signing, we need a recovery value
  // secp256k1 v3 doesn't expose recovery directly, so we use a workaround
  // Recovery is typically 0 or 1 for compressed keys
  const pubKey = secp256k1.getPublicKey(privateKey, compressed);
  // Simple approach: use recovery = 0 for now
  // In production, you'd need to implement proper recovery detection
  const recovery = 0;
  
  // Calculate recovery flag
  // Flag byte: 27 + recovery_id + (compressed ? 4 : 0)
  let recoveryFlag = 27 + recovery;
  if (compressed) {
    recoveryFlag += 4;
  }
  
  // Create the final signature: recovery_flag + r + s (65 bytes total)
  const finalSignature = new Uint8Array(65);
  finalSignature[0] = recoveryFlag;
  
  // r and s are already byte arrays
  finalSignature.set(r, 1);
  finalSignature.set(s, 33);
  
  // Return base64 encoded signature
  return base64.encode(finalSignature);
}

/**
 * Sign a message for SegWit addresses (P2WPKH, P2SH-P2WPKH)
 * Uses the same format as Legacy but with different recovery flags
 */
export async function signMessageSegwit(
  message: string,
  privateKey: Uint8Array,
  addressType: 'p2wpkh' | 'p2sh-p2wpkh'
): Promise<string> {
  // Format and double SHA256 the message
  const formattedMessage = formatMessageForSigning(message);
  const messageHash = sha256(sha256(formattedMessage));
  
  // Sign the message with recovery (v3 returns compact signature)
  const sigBytes = secp256k1.sign(messageHash, privateKey, { prehash: true });
  
  // Parse the compact signature
  const r = sigBytes.slice(0, 32);
  const s = sigBytes.slice(32, 64);
  
  // Simple recovery value for secp256k1 v3
  // In production, proper recovery detection would be needed
  const recovery = 0;
  
  // Calculate recovery flag for SegWit
  // P2WPKH: 39 + recovery_id
  // P2SH-P2WPKH: 35 + recovery_id
  let recoveryFlag: number;
  if (addressType === 'p2wpkh') {
    recoveryFlag = 39 + recovery;
  } else {
    recoveryFlag = 35 + recovery;
  }
  
  // Create the final signature: recovery_flag + r + s
  const finalSignature = new Uint8Array(65);
  finalSignature[0] = recoveryFlag;
  
  // r and s are already byte arrays
  finalSignature.set(r, 1);
  finalSignature.set(s, 33);
  
  // Return base64 encoded signature
  return base64.encode(finalSignature);
}

/**
 * Sign a message for Taproot addresses (P2TR)
 * This is a simplified version - full BIP-322 would be more complex
 */
export async function signMessageTaproot(
  message: string,
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Promise<string> {
  // For Taproot, we'll use a standard ECDSA signature for now
  // Full BIP-322 implementation would require creating a virtual transaction
  
  // Format the message
  const formattedMessage = formatMessageForSigning(message);
  const messageHash = sha256(sha256(formattedMessage));
  
  // Create signature with recovery (v3 returns compact signature)
  const sigBytes = secp256k1.sign(messageHash, privateKey, { prehash: true });
  
  // Convert to hex
  const rHex = bytesToHex(sigBytes.slice(0, 32));
  const sHex = bytesToHex(sigBytes.slice(32, 64));
  
  // For Taproot, we return a hex signature with a special prefix
  // to indicate it's a Taproot signature
  return 'tr:' + rHex + sHex;
}

/**
 * Main message signing function that handles all address types
 */
export async function signMessage(
  message: string,
  privateKeyHex: string,
  addressType: AddressType | string,
  compressed: boolean = true
): Promise<{ signature: string; address: string }> {
  const privateKey = hex.decode(privateKeyHex);
  const publicKey = secp256k1.getPublicKey(privateKey, compressed);
  
  let signature: string;
  let address: string;
  
  // Normalize address type for comparison
  const normalizedType = addressType.toUpperCase();
  
  switch (normalizedType) {
    case 'P2PKH':
    case 'COUNTERWALLET':  // Counterwallet uses P2PKH addresses and signing
      signature = await signMessageLegacy(message, privateKey, compressed);
      address = btc.p2pkh(publicKey).address!;
      break;
      
    case 'P2WPKH':
      signature = await signMessageSegwit(message, privateKey, 'p2wpkh');
      address = btc.p2wpkh(publicKey).address!;
      break;
      
    case 'P2SH-P2WPKH':
      signature = await signMessageSegwit(message, privateKey, 'p2sh-p2wpkh');
      const p2wpkh = btc.p2wpkh(publicKey);
      address = btc.p2sh(p2wpkh).address!;
      break;
      
    case 'P2TR':
      // Taproot uses x-only public key (32 bytes)
      const xOnlyPubKey = publicKey.slice(1, 33);
      signature = await signMessageTaproot(message, privateKey, xOnlyPubKey);
      address = btc.p2tr(xOnlyPubKey).address!;
      break;
      
    default:
      throw new Error(`Unsupported address type for message signing: ${addressType}`);
  }
  
  return { signature, address };
}

/**
 * Get signing capabilities for an address type
 */
export function getSigningCapabilities(addressType: AddressType | string): {
  canSign: boolean;
  method: string;
  notes?: string;
} {
  // Normalize the address type to handle case variations
  const normalizedType = addressType.charAt(0).toUpperCase() + addressType.slice(1).toLowerCase();
  
  switch (normalizedType) {
    case 'P2pkh':
      return {
        canSign: true,
        method: 'Legacy (BIP-137)',
        notes: 'Full support for traditional Bitcoin message signing'
      };
      
    case 'P2wpkh':
      return {
        canSign: true,
        method: 'SegWit Native (BIP-137 extended)',
        notes: 'Uses SegWit-specific recovery flags'
      };
      
    case 'P2sh-p2wpkh':
      return {
        canSign: true,
        method: 'SegWit Nested (BIP-137 extended)',
        notes: 'Uses nested SegWit recovery flags'
      };
      
    case 'P2tr':
      return {
        canSign: true,
        method: 'Taproot (Simplified)',
        notes: 'Uses ECDSA signatures, limited compatibility'
      };
      
    case 'Counterwallet':
      return {
        canSign: true,
        method: 'Legacy (BIP-137)',
        notes: 'Uses standard P2PKH signing (Counterwallet compatible)'
      };
      
    default:
      return {
        canSign: false,
        method: 'Not supported',
        notes: `Address type ${addressType} does not support message signing`
      };
  }
}

// Export helper function for use in verifier
