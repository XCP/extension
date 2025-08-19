import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { createBase58check } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { AddressType, encodeAddress } from '@/utils/blockchain/bitcoin/address';
import { getCounterwalletSeed } from '@/utils/blockchain/counterwallet';

// Create a base58check encoder instance for WIF usage.
const base58check = createBase58check(sha256);

/**
 * Generates a new BIP39 mnemonic phrase using the English wordlist.
 *
 * @returns A mnemonic phrase string.
 */
export function generateNewMnemonic(): string {
  return generateMnemonic(wordlist);
}

/**
 * Decodes a WIF (Wallet Import Format) private key.
 *
 * @param wif - The WIF string.
 * @returns An object containing the private key in hexadecimal and a flag indicating if it is compressed.
 * @throws Error if the WIF version byte is invalid.
 */
export function decodeWIF(wif: string): { privateKey: string; compressed: boolean } {
  const decoded = base58check.decode(wif);
  if (decoded[0] !== 0x80) {
    throw new Error('Invalid WIF version byte');
  }
  const compressed = decoded.length === 34;
  const privBytes = decoded.slice(1, 33);
  return {
    privateKey: bytesToHex(privBytes),
    compressed,
  };
}

/**
 * Checks if a string is in valid WIF format.
 *
 * @param key - The key string to check.
 * @returns True if valid, false otherwise.
 */
export function isWIF(key: string): boolean {
  try {
    const decoded = base58check.decode(key);
    return decoded[0] === 0x80 && (decoded.length === 33 || decoded.length === 34);
  } catch {
    return false;
  }
}

/**
 * Returns the public key (in hexadecimal) from a given private key (hex string).
 *
 * @param privateKeyHex - The private key as a hexadecimal string.
 * @param compressed - Whether the returned public key should be compressed (default true).
 * @returns The public key as a hexadecimal string.
 * @throws Error if the private key is invalid.
 */
export function getPublicKeyFromPrivateKey(privateKeyHex: string, compressed = true): string {
  try {
    const privBytes = hexToBytes(privateKeyHex);
    const pubKey = secp256k1.getPublicKey(privBytes, compressed);
    return bytesToHex(pubKey);
  } catch {
    throw new Error('Invalid private key');
  }
}

/**
 * Generates a Bitcoin address from a raw private key.
 *
 * @param privateKeyHex - The private key in hexadecimal.
 * @param addressType - The Bitcoin address type.
 * @param compressed - Whether to use the compressed public key (default true).
 * @returns The Bitcoin address as a string.
 */
export function getAddressFromPrivateKey(
  privateKeyHex: string,
  addressType: AddressType,
  compressed = true
): string {
  const pubHex = getPublicKeyFromPrivateKey(privateKeyHex, compressed);
  const pubBytes = hexToBytes(pubHex);
  return encodeAddress(pubBytes, addressType);
}

/**
 * Derives a private key (in hexadecimal) from a mnemonic and a derivation path.
 *
 * @param mnemonic - The mnemonic phrase.
 * @param path - The derivation path (e.g., "m/84'/0'/0'/0/0").
 * @param addressType - The address type. For Counterwallet, a custom seed is used.
 * @returns The derived private key as a hexadecimal string.
 * @throws Error if unable to derive the private key.
 */
export function getPrivateKeyFromMnemonic(
  mnemonic: string,
  path: string,
  addressType: AddressType
): string {
  let seed: Uint8Array;
  if (addressType === AddressType.Counterwallet) {
    seed = getCounterwalletSeed(mnemonic);
  } else {
    seed = mnemonicToSeedSync(mnemonic);
  }
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(path);
  if (!child.privateKey) {
    throw new Error('Unable to derive private key');
  }
  return bytesToHex(child.privateKey);
}
