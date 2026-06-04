/**
 * Pure address and wallet-id derivation — derives only from arguments, no
 * wallet state.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { HDKey } from '@scure/bip32';
import {
  getAddressFromMnemonic,
  getDerivationPathForAddressFormat,
  getSeedFromMnemonic,
  type AddressFormat,
} from '@/utils/blockchain/bitcoin/address';
import { getAddressFromPrivateKey, getPublicKeyFromPrivateKey } from '@/utils/blockchain/bitcoin/privateKey';
import type { Address, WalletRecord, HardwareWalletSecret } from '@/types/wallet';

export async function generateWalletId(mnemonic: string, addressFormat: AddressFormat): Promise<string> {
  const seed = getSeedFromMnemonic(mnemonic, addressFormat);
  const derivationPath = getDerivationPathForAddressFormat(addressFormat);
  const pathParts = derivationPath.split('/').slice(0, -1).join('/');
  const root = HDKey.fromMasterSeed(seed);
  const accountNode = root.derive(pathParts);
  if (!accountNode.publicKey) {
    throw new Error('Unable to derive public key for ID creation.');
  }
  const xpub = accountNode.publicExtendedKey;
  const xpubHash = sha256(utf8ToBytes(xpub));
  const typeHash = sha256(utf8ToBytes(addressFormat));
  const combined = new Uint8Array([...xpubHash, ...typeHash]);
  const finalHash = sha256(combined);
  return bytesToHex(finalHash);
}

export async function generateWalletIdFromPrivateKey(privateKeyHex: string, addressFormat: AddressFormat): Promise<string> {
  const pubkeyCompressed = getPublicKeyFromPrivateKey(privateKeyHex, true);
  const combined = utf8ToBytes(pubkeyCompressed + addressFormat);
  const hash = sha256(combined);
  return bytesToHex(hash);
}

export function deriveMnemonicAddress(mnemonic: string, addressFormat: AddressFormat, index: number): Address {
  const path = `${getDerivationPathForAddressFormat(addressFormat)}/${index}`;
  const address = getAddressFromMnemonic(mnemonic, path, addressFormat);
  const seed = getSeedFromMnemonic(mnemonic, addressFormat);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(path);
  if (!child.publicKey) {
    throw new Error('Unable to derive public key');
  }
  const pubKeyHex = bytesToHex(child.publicKey);
  return {
    name: `Address ${index + 1}`,
    path,
    address,
    pubKey: pubKeyHex,
  };
}

export function deriveAddressFromPrivateKey(privKeyData: string, addressFormat: AddressFormat): Address {
  const parsed = JSON.parse(privKeyData);
  const address = getAddressFromPrivateKey(parsed.hex, addressFormat, parsed.compressed);
  const pubKey = getPublicKeyFromPrivateKey(parsed.hex, parsed.compressed);
  return {
    name: 'Address 1',
    path: '',
    address,
    pubKey,
  };
}

/** Derives addresses from a decrypted secret based on wallet type */
export function deriveAddressesFromSecret(secret: string, record: WalletRecord): Address[] {
  if (record.type === 'mnemonic') {
    const count = record.addressCount || 1;
    return Array.from({ length: count }, (_, i) =>
      deriveMnemonicAddress(secret, record.addressFormat, i)
    );
  }

  if (record.type === 'hardware') {
    // Hardware wallet secret contains metadata, not private keys
    // The address is stored in the secret, no derivation needed
    try {
      const hardwareData: HardwareWalletSecret = JSON.parse(secret);
      // We need the address from the record's previewAddress since
      // hardware secrets don't store the address directly
      return [{
        name: 'Address 1',
        path: hardwareData.derivationPath,
        address: record.previewAddress,
        pubKey: hardwareData.publicKey,
      }];
    } catch {
      return [];
    }
  }

  if (record.isTestOnly) {
    try {
      const testData = JSON.parse(secret);
      if (testData.isTestWallet && testData.address) {
        return [{ name: "Test Address", path: "m/test", address: testData.address, pubKey: '' }];
      }
    } catch {
      return [];
    }
  }

  return [deriveAddressFromPrivateKey(secret, record.addressFormat)];
}
