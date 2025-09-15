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
import { AddressFormat } from '@/utils/blockchain/bitcoin';
import { encodeAddress } from './address';
import {
  signBIP322P2PKH,
  signBIP322P2WPKH,
  signBIP322P2SH_P2WPKH,
  signBIP322P2TR,
} from './bip322';

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

  // The magic string already includes \x18 which is its length
  const magicBytes = new TextEncoder().encode(BITCOIN_MESSAGE_MAGIC);

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
  const combined = new Uint8Array(
    magicBytes.length +
    messageLengthBytes.length +
    messageBytes.length
  );

  let offset = 0;
  combined.set(magicBytes, offset);
  offset += magicBytes.length;
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
 * [DEPRECATED] Sign a message with a private key for Legacy (P2PKH) addresses
 * This follows the traditional Bitcoin message signing format
 * @deprecated Use BIP-322 signing instead
 */
async function signMessageLegacy(
  message: string,
  privateKey: Uint8Array,
  compressed: boolean = true
): Promise<string> {
  // Format and double SHA256 the message
  const formattedMessage = formatMessageForSigning(message);
  const messageHash = sha256(sha256(formattedMessage));
  
  // Sign the message with recovery (v3 supports 'recovered' format)
  const sigBytes = secp256k1.sign(messageHash, privateKey, { 
    prehash: true,
    format: 'recovered' 
  });
  
  // With 'recovered' format, signature is 65 bytes: recovery (1) + r (32) + s (32)
  const recovery = sigBytes[0];
  const r = sigBytes.slice(1, 33);
  const s = sigBytes.slice(33, 65);
  
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
 * [DEPRECATED] Sign a message for SegWit addresses (P2WPKH, P2SH-P2WPKH)
 * Uses the same format as Legacy but with different recovery flags
 * @deprecated Use BIP-322 signing instead
 */
async function signMessageSegwit(
  message: string,
  privateKey: Uint8Array,
  addressFormat: 'p2wpkh' | 'p2sh-p2wpkh'
): Promise<string> {
  // Format and double SHA256 the message
  const formattedMessage = formatMessageForSigning(message);
  const messageHash = sha256(sha256(formattedMessage));
  
  // Sign the message with recovery (v3 supports 'recovered' format)
  const sigBytes = secp256k1.sign(messageHash, privateKey, { 
    prehash: true,
    format: 'recovered' 
  });
  
  // With 'recovered' format, signature is 65 bytes: recovery (1) + r (32) + s (32)
  const recovery = sigBytes[0];
  const r = sigBytes.slice(1, 33);
  const s = sigBytes.slice(33, 65);
  
  // Calculate recovery flag for SegWit
  // P2WPKH: 39 + recovery_id
  // P2SH-P2WPKH: 35 + recovery_id
  let recoveryFlag: number;
  if (addressFormat === 'p2wpkh') {
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
 * Uses BIP-322 compatible Schnorr signatures
 */
export async function signMessageTaproot(
  message: string,
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Promise<string> {
  // Use BIP-322 signing for Taproot
  return await signBIP322P2TR(message, privateKey);
}

/**
 * Main message signing function that handles all address types
 * Uses BIP-322 exclusively for all address types
 *
 * Note: This function returns an address for backward compatibility with tests,
 * but real usage should use the actual wallet address
 */
export async function signMessage(
  message: string,
  privateKeyHex: string,
  addressFormat: AddressFormat | string,
  compressed: boolean = true
): Promise<{ signature: string; address: string }> {
  const privateKey = hex.decode(privateKeyHex);
  const publicKey = secp256k1.getPublicKey(privateKey, compressed);

  // Use BIP-322 exclusively for all address types
  let signature: string;
  let address: string = '';

  switch (addressFormat) {
    case AddressFormat.P2PKH:
    case AddressFormat.Counterwallet:
      // Use BIP-322 for P2PKH
      signature = await signBIP322P2PKH(message, privateKey, compressed);
      // Generate address for test compatibility
      address = encodeAddress(publicKey, AddressFormat.P2PKH);
      break;

    case AddressFormat.P2WPKH:
      // Use BIP-322 for P2WPKH
      signature = await signBIP322P2WPKH(message, privateKey);
      address = encodeAddress(publicKey, AddressFormat.P2WPKH);
      break;

    case AddressFormat.P2SH_P2WPKH:
      // Use BIP-322 for P2SH-P2WPKH
      signature = await signBIP322P2SH_P2WPKH(message, privateKey);
      address = encodeAddress(publicKey, AddressFormat.P2SH_P2WPKH);
      break;

    case AddressFormat.P2TR:
      // Use BIP-322 for Taproot (Schnorr signatures)
      signature = await signBIP322P2TR(message, privateKey);
      // For Taproot, use the same raw encoding as the wallet
      address = encodeAddress(publicKey, AddressFormat.P2TR);
      break;

    default:
      throw new Error(`Unsupported address type for message signing: ${addressFormat}`);
  }

  return { signature, address };
}

/**
 * Get signing capabilities for an address type
 */
export function getSigningCapabilities(addressFormat: AddressFormat | string): {
  canSign: boolean;
  method: string;
  notes?: string;
} {
  // Normalize the address type to handle case variations
  const normalizedType = addressFormat.charAt(0).toUpperCase() + addressFormat.slice(1).toLowerCase();

  switch (normalizedType) {
    case 'P2pkh':
      return {
        canSign: true,
        method: 'BIP-322',
        notes: 'Generic signed message format (BIP-322) with P2PKH virtual transaction'
      };

    case 'P2wpkh':
      return {
        canSign: true,
        method: 'BIP-322',
        notes: 'Generic signed message format (BIP-322) with P2WPKH witness'
      };

    case 'P2sh-p2wpkh':
      return {
        canSign: true,
        method: 'BIP-322',
        notes: 'Generic signed message format (BIP-322) with P2SH-P2WPKH witness'
      };

    case 'P2tr':
      return {
        canSign: true,
        method: 'BIP-322',
        notes: 'Generic signed message format (BIP-322) with Schnorr signatures'
      };

    case 'Counterwallet':
      return {
        canSign: true,
        method: 'BIP-322',
        notes: 'Generic signed message format (BIP-322) with P2PKH virtual transaction'
      };

    default:
      return {
        canSign: false,
        method: 'Not supported',
        notes: `Address type ${ addressFormat } does not support message signing`
      };
  }
}

// Export helper function for use in verifier
