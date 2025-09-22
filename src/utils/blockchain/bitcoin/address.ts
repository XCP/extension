import { ripemd160 } from '@noble/hashes/legacy';
import { sha256 } from '@noble/hashes/sha2';
import { bech32, base58, createBase58check } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import * as btc from '@scure/btc-signer';
import { getCounterwalletSeed } from '@/utils/blockchain/counterwallet';
import { fetchTokenBalances } from '@/utils/blockchain/counterparty/api';
import { hasAddressActivity } from './balance';

/**
 * Bitcoin address formats supported by the wallet.
 * Using const assertion pattern for better tree-shaking and type safety.
 */
export const AddressFormat = {
  /** Counterwallet style (P2PKH with custom derivation) */
  Counterwallet: 'counterwallet',
  /** FreeWallet Style SegWit (Native SegWit with Counterwallet derivation) */
  CounterwalletSegwit: 'counterwallet-segwit',
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
 * This creates a union type: 'counterwallet' | 'counterwallet-segwit' | 'p2tr' | 'p2wpkh' | 'p2sh-p2wpkh' | 'p2pkh'
 */
export type AddressFormat = typeof AddressFormat[keyof typeof AddressFormat];

/**
 * Check if an address format is a SegWit format (P2WPKH, P2SH-P2WPKH, CounterwalletSegwit, or P2TR).
 */
export function isSegwitFormat(format: AddressFormat): boolean {
  return format === AddressFormat.P2WPKH ||
         format === AddressFormat.P2SH_P2WPKH ||
         format === AddressFormat.CounterwalletSegwit ||
         format === AddressFormat.P2TR;
}

/**
 * Check if an address format is a Counterwallet/FreeWallet style format.
 */
export function isCounterwalletFormat(format: AddressFormat): boolean {
  return format === AddressFormat.Counterwallet ||
         format === AddressFormat.CounterwalletSegwit;
}


// Create a base58check encoder instance using SHA-256.
const base58check = createBase58check(sha256);

/**
 * Returns the default derivation path for a given Bitcoin address type.
 *
 * @param addressFormat - The address format.
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
    case AddressFormat.CounterwalletSegwit:
      return "m/0'/0";
    default:
      throw new Error(`Unsupported address type: ${ addressFormat }`);
  }
}

/**
 * Encodes a public key (Uint8Array) into a Bitcoin address string based on the address type.
 *
 * @param publicKey - The public key bytes.
 * @param addressFormat - The address format.
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
    case AddressFormat.CounterwalletSegwit: {
      // CounterwalletSegwit uses Native SegWit (P2WPKH) encoding
      const pubKeyHash = ripemd160(sha256(publicKey));
      const words = bech32.toWords(pubKeyHash);
      return bech32.encode('bc', [0, ...words]);
    }
    case AddressFormat.P2TR: {
      // For Taproot, use BIP341 tweaking (best practice)
      const xOnlyPubKey = publicKey.slice(1, 33);
      // Use btc.p2tr to apply BIP341 tweaking
      const p2tr = btc.p2tr(xOnlyPubKey, undefined, btc.NETWORK);
      return p2tr.address!;
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
 * @param addressFormat - The address format.
 * @returns The derived Bitcoin address.
 * @throws Error if unable to derive the public key.
 */
export function getAddressFromMnemonic(
  mnemonic: string,
  path: string,
  addressFormat: AddressFormat
): string {
  // Use a specialized seed for Counterwallet and CounterwalletSegwit; otherwise use standard BIP39 seed.
  const seed: Uint8Array = isCounterwalletFormat(addressFormat)
    ? getCounterwalletSeed(mnemonic)
    : mnemonicToSeedSync(mnemonic);
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

// Address Type Detection functions (previously in addressTypeDetector.ts)

/**
 * Check if an address has any transaction history using existing API utilities
 * Returns true if any provider confirms transactions or token balances
 */
async function checkAddressActivity(address: string): Promise<boolean> {
  // First check Counterparty API for token balances - most specific indicator
  try {
    const balances = await fetchTokenBalances(address, { limit: 1 });
    if (balances && balances.length > 0) {
      console.log(`Address ${address} has Counterparty token activity`);
      return true;
    }
  } catch (error) {
    console.warn('Counterparty balance check failed:', error);
  }

  // Check Bitcoin transaction history using our balance module helper
  try {
    const hasActivity = await hasAddressActivity(address);
    if (hasActivity) {
      console.log(`Address ${address} has Bitcoin transaction history`);
      return true;
    }
  } catch (error) {
    console.warn('Bitcoin activity check failed:', error);
  }

  // No activity found
  return false;
}

/**
 * Detect the most likely address format for a mnemonic by checking blockchain activity
 * @param mnemonic The mnemonic phrase to check
 * @param cachedPreviews Optional cached address previews to avoid re-derivation
 * @returns The detected address format, or P2TR as default
 */
export async function detectAddressFormat(
  mnemonic: string,
  cachedPreviews?: Partial<Record<AddressFormat, string>>
): Promise<AddressFormat> {
  // Check these formats for activity (skip Taproot since it's the fallback)
  const addressFormatsToCheck: AddressFormat[] = [
    AddressFormat.P2PKH,              // Legacy (most common)
    AddressFormat.P2WPKH,             // Native SegWit (bc1)
    AddressFormat.P2SH_P2WPKH,        // Nested SegWit (3)
    AddressFormat.Counterwallet,      // Counterwallet P2PKH
    AddressFormat.CounterwalletSegwit,// Counterwallet SegWit
  ];

  // First, generate all preview addresses (or use cached ones)
  const formatAddressMap: Map<AddressFormat, string> = new Map();

  for (const format of addressFormatsToCheck) {
    try {
      let address: string;
      if (cachedPreviews?.[format]) {
        address = cachedPreviews[format];
      } else {
        // Generate the first address (index 0) for this format
        const path = `${getDerivationPathForAddressFormat(format)}/0`;
        address = getAddressFromMnemonic(mnemonic, path, format);
      }
      formatAddressMap.set(format, address);
    } catch (error) {
      console.warn(`Failed to generate address for ${format}:`, error);
    }
  }

  // Check each address for activity in order of priority
  for (const [format, address] of formatAddressMap.entries()) {
    try {
      const hasActivity = await checkAddressActivity(address);
      if (hasActivity) {
        console.log(`Detected address format: ${format}`);
        return format;
      }
    } catch (error) {
      console.warn(`Failed to check ${format}:`, error);
    }
  }

  // Default to P2TR (Taproot) for best efficiency
  console.log('No activity detected or API failed, defaulting to P2TR');
  return AddressFormat.P2TR;
}

/**
 * Get preview addresses for all address formats
 * Used in settings to show users what addresses would look like
 */
export function getPreviewAddresses(mnemonic: string): Record<AddressFormat, string> {
  const formats = [
    AddressFormat.P2PKH,
    AddressFormat.P2SH_P2WPKH,
    AddressFormat.P2WPKH,
    AddressFormat.P2TR,
    AddressFormat.Counterwallet,
    AddressFormat.CounterwalletSegwit,
  ];

  const previews: Partial<Record<AddressFormat, string>> = {};

  for (const format of formats) {
    try {
      const path = `${getDerivationPathForAddressFormat(format)}/0`;
      previews[format] = getAddressFromMnemonic(mnemonic, path, format);
    } catch (error) {
      console.warn(`Failed to generate preview for ${format}:`, error);
    }
  }

  return previews as Record<AddressFormat, string>;
}

/**
 * Detect address format from cached previews only (no derivation needed)
 * Useful for checking existing wallets where we already have the preview addresses
 */
export async function detectAddressFormatFromPreviews(
  previews: Partial<Record<AddressFormat, string>>
): Promise<AddressFormat> {
  // Check these formats for activity (skip Taproot since it's the fallback)
  const addressFormatsToCheck: AddressFormat[] = [
    AddressFormat.P2PKH,              // Legacy (most common)
    AddressFormat.P2WPKH,             // Native SegWit (bc1)
    AddressFormat.P2SH_P2WPKH,        // Nested SegWit (3)
    AddressFormat.Counterwallet,      // Counterwallet P2PKH
    AddressFormat.CounterwalletSegwit,// Counterwallet SegWit
  ];

  // Check each preview address for activity
  for (const format of addressFormatsToCheck) {
    const address = previews[format];
    if (!address) continue;

    try {
      const hasActivity = await checkAddressActivity(address);
      if (hasActivity) {
        console.log(`Detected format ${format} from cached preview`);
        return format;
      }
    } catch (error) {
      console.warn(`Failed to check ${format} preview:`, error);
    }
  }

  // Default to P2TR (Taproot) for best efficiency
  return AddressFormat.P2TR;
}