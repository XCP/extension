/**
 * Pure address and wallet-id derivation — derives only from arguments, no
 * wallet state.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { HDKey } from '@scure/bip32';
import {
  type AddressFormat,
  encodeAddress,
  getDerivationPathForAddressFormat,
  getSeedFromMnemonic,
} from '@/core/bitcoin/address';
import { getAddressFromPrivateKey, getPublicKeyFromPrivateKey } from '@/core/bitcoin/privateKey';
import { parseUtxoAddressPath } from '@/core/wallet/rarePepeWalletDiscovery';
import type { Address, HardwareWalletSecret, WalletRecord } from '@/types/wallet';

export function getPairedAddressFormats(addressFormat: AddressFormat): {
  legacy: AddressFormat;
  segwit: AddressFormat;
} | null {
  switch (addressFormat) {
    case 'counterwallet':
    case 'counterwallet-segwit':
      return { legacy: 'counterwallet', segwit: 'counterwallet-segwit' };
    case 'freewallet-bip39':
    case 'freewallet-bip39-segwit':
      return { legacy: 'freewallet-bip39', segwit: 'freewallet-bip39-segwit' };
    case 'p2pkh':
    case 'p2wpkh':
      return { legacy: 'p2pkh', segwit: 'p2wpkh' };
    default:
      return null;
  }
}

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

/**
 * One address from an already-derived master key.
 *
 * Split out so the single and batch entry points below share one definition of what an address at
 * an index *is*. Both previously spelled it out, and the encoding step differed: one called
 * `getAddressFromMnemonic`, which derives the seed all over again to reach the same public key.
 */
function addressAtIndex(
  root: HDKey,
  addressFormat: AddressFormat,
  index: number
): Address {
  const path = `${getDerivationPathForAddressFormat(addressFormat)}/${index}`;
  const child = root.derive(path);
  if (!child.publicKey) {
    throw new Error('Unable to derive public key');
  }
  return {
    name: `Address ${index + 1}`,
    path,
    address: encodeAddress(child.publicKey, addressFormat),
    pubKey: bytesToHex(child.publicKey),
  };
}

export function deriveMnemonicAddress(mnemonic: string, addressFormat: AddressFormat, index: number): Address {
  const root = HDKey.fromMasterSeed(getSeedFromMnemonic(mnemonic, addressFormat));
  return addressAtIndex(root, addressFormat, index);
}

/**
 * Every address of a mnemonic wallet, deriving the seed once for the batch.
 *
 * The seed is the expensive part and it does not depend on the index: for BIP-39 it is
 * PBKDF2-HMAC-SHA512 over 2048 rounds. Calling `deriveMnemonicAddress` in a loop paid for it
 * twice per address — once inside `getAddressFromMnemonic` and once again for the public key — so
 * a 20-address wallet ran 40 of them, about 460ms on a dev machine, synchronously on the thread
 * that draws the UI. Selecting such a wallet froze the popup, and because the state lock queues,
 * every impatient click during the freeze added another full pass.
 *
 * Hoisting the seed and the master key out of the loop takes the same wallet to about 43ms. The
 * per-index derivation is untouched, so the addresses are the ones this wallet has always had —
 * `addressDeriver.equivalence.test.ts` holds that to byte equality against the original routine.
 */
export function deriveMnemonicAddresses(
  mnemonic: string,
  addressFormat: AddressFormat,
  count: number
): Address[] {
  if (count <= 0) return [];
  const root = HDKey.fromMasterSeed(getSeedFromMnemonic(mnemonic, addressFormat));
  return Array.from({ length: count }, (_, index) => addressAtIndex(root, addressFormat, index));
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

/**
 * The extra addresses a record asks for, on top of its sequential run.
 *
 * Only paths this wallet knows how to name are honoured: a stored string that no longer parses is
 * dropped rather than derived, since it comes off disk and reaches `HDKey.derive`.
 */
function deriveExtraAddresses(
  root: HDKey,
  addressFormat: AddressFormat,
  extraPaths: string[]
): Address[] {
  const addresses: Address[] = [];
  for (const path of extraPaths) {
    const pairedIndex = parseUtxoAddressPath(path);
    if (pairedIndex === null) continue;
    const child = root.derive(path);
    if (!child.publicKey) continue;
    addresses.push({
      // Numbered after the address it is paired with, not its own position in this list.
      name: `UTXO Address ${pairedIndex + 1}`,
      path,
      address: encodeAddress(child.publicKey, addressFormat),
      pubKey: bytesToHex(child.publicKey),
    });
  }
  return addresses;
}

/** Derives addresses from a decrypted secret based on wallet type */
export function deriveAddressesFromSecret(secret: string, record: WalletRecord): Address[] {
  if (record.type === 'mnemonic') {
    const addresses = deriveMnemonicAddresses(secret, record.addressFormat, record.addressCount || 1);
    if (!record.extraPaths?.length) return addresses;
    const root = HDKey.fromMasterSeed(getSeedFromMnemonic(secret, record.addressFormat));
    return [...addresses, ...deriveExtraAddresses(root, record.addressFormat, record.extraPaths)];
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
