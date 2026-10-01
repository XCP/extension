/**
 * Bitcoin Message Signer
 *
 * Software-wallet message signing. P2PKH (and the Counterwallet / FreeWallet legacy formats) sign
 * the classic 65-byte recoverable signed-message format (BIP-137 header, Bitcoin Core's
 * `signmessage`), which is what BIP-322 itself prescribes for P2PKH and what a Trezor returns.
 * SegWit and Taproot addresses sign BIP-322 simple: the base64 witness stack of the `to_sign`
 * spend. Trezor signs on the device instead (see `trezorAdapter.signMessage`).
 *
 * Wallet versions before this one signed P2PKH as a two-item BIP-322 `[signature, pubkey]` stack
 * over the legacy sighash (`signBIP322P2PKH`); the wallet's verifier still accepts those.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { base64, hex } from '@scure/base';
import { encodeAddress } from '@/core/bitcoin/address';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { signBIP322P2SH_P2WPKH, signBIP322P2TR, signBIP322P2WPKH } from '@/core/bitcoin/bip322';
import { hashMessage } from '@/core/bitcoin/messageVerifier/utils';

/**
 * How a software-wallet message signature is to be verified, as reported to sites alongside it
 * (`verification` on a connection proof). Same labels as a Trezor's signature for P2PKH.
 */
export type MessageSignatureScheme =
  | { method: 'BIP-322'; format: string }
  | { method: 'BIP-137'; format: 'legacy_recoverable' };

/** The address formats whose software signature is the classic 65-byte recoverable form. */
function signsClassicMessage(addressFormat: AddressFormat | string): boolean {
  const format = addressFormat.toLowerCase();
  return format === AddressFormat.P2PKH
    || format === AddressFormat.Counterwallet
    || format === AddressFormat.FreewalletBIP39;
}

/** The scheme a software wallet signs messages with for an address of this format. */
export function softwareMessageSignatureScheme(addressFormat: AddressFormat | string): MessageSignatureScheme {
  return signsClassicMessage(addressFormat)
    ? { method: 'BIP-137', format: 'legacy_recoverable' }
    : { method: 'BIP-322', format: addressFormat };
}

/**
 * Classic signed-message signature for a P2PKH address: base64 of `header || r || s`, 65 bytes,
 * over `sha256d("\x18Bitcoin Signed Message:\n" || CompactSize(len) || message)`, the message's
 * exact UTF-8 bytes (`hashMessage`, the digest the verifier checks). The header is 27 + recovery
 * id, plus 4 when the key is compressed (31-34; 27-30 for an uncompressed imported WIF key), so a
 * verifier recovers the public key in the encoding the address was made from. RFC 6979
 * deterministic, low-S, as Bitcoin Core's `signmessage`.
 */
export function signClassicMessage(message: string, privateKey: Uint8Array, compressed: boolean): string {
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }
  // `hashMessage` is already the digest: noble must not hash it again.
  const recovered = secp256k1.sign(hashMessage(message), privateKey, {
    prehash: false,
    lowS: true,
    format: 'recovered',
  });
  const recoveryId = recovered[0]!;
  if (recoveryId > 3) {
    throw new Error(`Unexpected recovery id ${recoveryId}`);
  }
  const signature = new Uint8Array(65);
  signature[0] = 27 + recoveryId + (compressed ? 4 : 0);
  signature.set(recovered.subarray(1), 1);
  return base64.encode(signature);
}

/**
 * Main message signing function that handles all address types: classic (BIP-137 header) for
 * P2PKH, BIP-322 simple for everything else.
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

  try {
    const publicKey = secp256k1.getPublicKey(privateKey, compressed);

    let signature: string;
    let address: string = '';

    switch (addressFormat) {
      case AddressFormat.P2PKH:
      case AddressFormat.Counterwallet:
      case AddressFormat.FreewalletBIP39:
        signature = signClassicMessage(message, privateKey, compressed);
        // Generate address for test compatibility
        address = encodeAddress(publicKey, AddressFormat.P2PKH);
        break;

      case AddressFormat.P2WPKH:
      case AddressFormat.CounterwalletSegwit:
      case AddressFormat.FreewalletBIP39Segwit:
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
  } finally {
    // Zero out private key bytes after use (defense in depth)
    // See the memory-clearing note in sessionManager.ts for JS memory limitation context
    privateKey.fill(0);
  }
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
        method: 'BIP-137',
        notes: 'Classic signed message format (BIP-137 header, Bitcoin Core signmessage)'
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
        method: 'BIP-137',
        notes: 'Classic signed message format (BIP-137 header, Bitcoin Core signmessage)'
      };

    case 'Counterwallet-segwit':
      return {
        canSign: true,
        method: 'BIP-322',
        notes: 'Generic signed message format (BIP-322) with P2WPKH witness'
      };

    case 'Freewallet-bip39':
      return {
        canSign: true,
        method: 'BIP-137',
        notes: 'Classic signed message format (BIP-137 header, Bitcoin Core signmessage)'
      };

    case 'Freewallet-bip39-segwit':
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

