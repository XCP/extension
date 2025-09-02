import { ripemd160 } from '@noble/hashes/legacy';
import { sha256 } from '@noble/hashes/sha2';
import { bech32, bech32m, base58, createBase58check } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { getCounterwalletSeed } from '@/utils/blockchain/counterwallet';

/**
 * Bitcoin address formats supported by the wallet.
 * Using const assertion pattern for better tree-shaking and type safety.
 */
export const AddressFormat = {
  /** Counterwallet style (P2PKH with custom derivation) */
  Counterwallet: 'counterwallet',
  /** Taproot (Pay-to-Taproot) */
  P2TR: 'p2tr',
  /** Native SegWit (Pay-to-Witness-PubKey-Hash) */
  P2WPKH: 'p2wpkh',
  /** Nested SegWit (P2WPKH nested in P2SH) */
  P2SH_P2WPKH: 'p2sh-p2wpkh',
  /** Legacy address (Pay-to-PubKey-Hash) */
  P2PKH: 'p2pkh',
} as const;

/**
 * Type representing valid address format values.
 * This creates a union type: 'counterwallet' | 'p2tr' | 'p2wpkh' | 'p2sh-p2wpkh' | 'p2pkh'
 */
export type AddressFormat = typeof AddressFormat[keyof typeof AddressFormat];

/**
 * Type guard to check if a value is a valid AddressFormat.
 */
export function isAddressFormat(value: unknown): value is AddressFormat {
  return typeof value === 'string' && 
    Object.values(AddressFormat).includes(value as AddressFormat);
}

/**
 * Check if an address format is a SegWit format (P2WPKH, P2SH-P2WPKH, or P2TR).
 */
export function isSegwitFormat(format: AddressFormat): boolean {
  return format === AddressFormat.P2WPKH || 
         format === AddressFormat.P2SH_P2WPKH || 
         format === AddressFormat.P2TR;
}

/**
 * Get human-readable label for an address format.
 */
export function getAddressFormatLabel(format: AddressFormat): string {
  switch (format) {
    case AddressFormat.P2PKH:
      return 'Legacy';
    case AddressFormat.P2SH_P2WPKH:
      return 'Nested SegWit';
    case AddressFormat.P2WPKH:
      return 'Native SegWit';
    case AddressFormat.P2TR:
      return 'Taproot';
    case AddressFormat.Counterwallet:
      return 'Counterwallet';
    default:
      // TypeScript will error if we miss a case
      const exhaustive: never = format;
      return exhaustive;
  }
}

/**
 * Get address prefix hint for an address format.
 */
export function getAddressFormatHint(format: AddressFormat): string {
  switch (format) {
    case AddressFormat.P2PKH:
      return '1...';
    case AddressFormat.P2SH_P2WPKH:
      return '3...';
    case AddressFormat.P2WPKH:
      return 'bc1q...';
    case AddressFormat.P2TR:
      return 'bc1p...';
    case AddressFormat.Counterwallet:
      return '1...';
    default:
      const exhaustive: never = format;
      return exhaustive;
  }
}

// Create a base58check encoder instance using SHA-256.
const base58check = createBase58check(sha256);

/**
 * Returns the default derivation path for a given Bitcoin address type.
 *
 * @param addressType - The address type.
 * @returns The derivation path as a string.
 * @throws Error if the address type is unsupported.
 */
export function getDerivationPathForAddressFormat(addressFormat: AddressFormat): string {
  switch (addressFormat) {
    case AddressFormat.P2PKH:
      return "m/44'/0'/0'/0";
    case AddressFormat.P2SH_P2WPKH:
      return "m/49'/0'/0'/0";
    case AddressFormat.P2WPKH:
      return "m/84'/0'/0'/0";
    case AddressFormat.P2TR:
      return "m/86'/0'/0'/0";
    case AddressFormat.Counterwallet:
      return "m/0'/0";
    default:
      throw new Error(`Unsupported address type: ${ addressFormat }`);
  }
}

/**
 * Encodes a public key (Uint8Array) into a Bitcoin address string based on the address type.
 *
 * @param publicKey - The public key bytes.
 * @param addressType - The address type.
 * @returns The Bitcoin address string.
 * @throws Error if the address type is unsupported.
 */
export function encodeAddress(publicKey: Uint8Array, addressFormat: AddressFormat): string {
  switch (addressFormat) {
    case AddressFormat.P2PKH: {
      const pubKeyHash = ripemd160(sha256(publicKey));
      const payload = new Uint8Array(1 + pubKeyHash.length);
      payload[0] = 0x00; // mainnet prefix for P2PKH
      payload.set(pubKeyHash, 1);
      return base58check.encode(payload);
    }
    case AddressFormat.P2SH_P2WPKH: {
      // Create redeemScript: OP_0 + OP_PUSH(0x14) + 20-byte hash.
      const pubKeyHash = ripemd160(sha256(publicKey));
      const redeemScript = new Uint8Array(2 + pubKeyHash.length);
      redeemScript[0] = 0x00;
      redeemScript[1] = 0x14;
      redeemScript.set(pubKeyHash, 2);

      const scriptHash = ripemd160(sha256(redeemScript));
      const payload = new Uint8Array(1 + scriptHash.length);
      payload[0] = 0x05; // mainnet prefix for P2SH
      payload.set(scriptHash, 1);
      return base58check.encode(payload);
    }
    case AddressFormat.P2WPKH: {
      const pubKeyHash = ripemd160(sha256(publicKey));
      const words = bech32.toWords(pubKeyHash);
      return bech32.encode('bc', [0, ...words]);
    }
    case AddressFormat.P2TR: {
      // For Taproot, assume an x-only public key (skip first byte).
      const xOnlyPubKey = publicKey.slice(1, 33);
      const words = bech32.toWords(xOnlyPubKey);
      return bech32m.encode('bc', [1, ...words]);
    }
    case AddressFormat.Counterwallet: {
      // For Counterwallet, we use a legacy P2PKH scheme.
      const pubKeyHash = ripemd160(sha256(publicKey));
      const payload = new Uint8Array(1 + pubKeyHash.length);
      payload[0] = 0x00;
      payload.set(pubKeyHash, 1);
      return base58check.encode(payload);
    }
    default:
      throw new Error(`Unsupported address type: ${ addressFormat }`);
  }
}

/**
 * Derives a Bitcoin address from a mnemonic phrase, a derivation path, and an address type.
 *
 * @param mnemonic - The mnemonic phrase.
 * @param path - The derivation path (e.g., "m/84'/0'/0'/0/0").
 * @param addressType - The address type.
 * @returns The derived Bitcoin address.
 * @throws Error if unable to derive the public key.
 */
export function getAddressFromMnemonic(
  mnemonic: string,
  path: string,
  addressFormat: AddressFormat
): string {
  // Use a specialized seed for Counterwallet; otherwise use standard BIP39 seed.
  const seed: Uint8Array =
    addressFormat === AddressFormat.Counterwallet ? getCounterwalletSeed(mnemonic) : mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(path);
  if (!child.publicKey) {
    throw new Error('Unable to derive public key');
  }
  return encodeAddress(child.publicKey, addressFormat);
}

/**
 * Checks whether a string is a valid Base58 Bitcoin address.
 *
 * @param address - The address to validate.
 * @returns True if valid; otherwise false.
 */
export const isValidBase58Address = (address: string): boolean => {
  try {
    // Attempt to decode the address. If an error is thrown, the address is invalid.
    base58.decode(address);
    // Basic length check for Bitcoin addresses (usually 26-35 characters).
    return address.length >= 26 && address.length <= 35;
  } catch {
    return false;
  }
};

