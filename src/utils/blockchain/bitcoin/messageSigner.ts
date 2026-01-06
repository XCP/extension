/**
 * Bitcoin Message Signer
 * 
 * Implements Bitcoin message signing compatible with BIP-137 (P2PKH, P2SH-P2WPKH, P2WPKH)
 * and simplified Taproot signing
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { hex } from '@scure/base';
import * as secp256k1 from '@noble/secp256k1';
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
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
    case AddressFormat.CounterwalletSegwit:
      // Use BIP-322 for P2WPKH (Native SegWit)
      signature = await signBIP322P2WPKH(message, privateKey);
      address = encodeAddress(publicKey, addressFormat as AddressFormat);
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

    case 'Counterwallet-segwit':
      return {
        canSign: true,
        method: 'BIP-322',
        notes: 'Generic signed message format (BIP-322) with P2WPKH witness'
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
