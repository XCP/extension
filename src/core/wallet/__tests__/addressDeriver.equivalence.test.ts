/**
 * The batch derivation returns exactly the addresses the per-address routine always did.
 *
 * This is the one change in this codebase where being wrong is unrecoverable rather than merely
 * broken: an address that differs by a byte is an address the user cannot see and cannot spend
 * from, holding funds that were sent to it. Speed is worth nothing next to that, so the
 * optimisation is held to byte equality rather than to "looks right".
 *
 * The oracle is the original routine, written out here in full rather than imported — importing
 * the thing under test and comparing it to itself is what a round-trip test does, and the segwit
 * BIP-322 bug is what that costs. What made the old version slow was doing this twice per address;
 * what makes it a fair oracle is that it is the same arithmetic, in the same order, from the same
 * inputs.
 */

import { bytesToHex } from '@noble/hashes/utils.js';
import { HDKey } from '@scure/bip32';
import { describe, expect, it } from 'vitest';
import {
  type AddressFormat,
  getAddressFromMnemonic,
  getDerivationPathForAddressFormat,
  getSeedFromMnemonic,
} from '@/core/bitcoin/address';
import type { Address, WalletRecord } from '@/types/wallet';
import {
  deriveAddressesFromSecret,
  deriveMnemonicAddress,
  deriveMnemonicAddresses,
} from '../addressDeriver';

/** BIP-39's own test vector. */
const BIP39 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/**
 * Counterwallet has its own wordlist, so BIP-39's vector is not a phrase it can read — the same
 * twelve words that work everywhere else throw "Invalid mnemonic word" here. Each format is
 * therefore paired with a phrase its own seed routine accepts.
 */
const COUNTERWALLET = 'like just love know never want time out there make look eye';

/** Every format `getDerivationPathForAddressFormat` accepts, with a mnemonic it can read. */
const FORMATS: Array<[AddressFormat, string]> = [
  ['p2pkh', BIP39],
  ['p2wpkh', BIP39],
  ['p2sh-p2wpkh', BIP39],
  ['p2tr', BIP39],
  ['counterwallet', COUNTERWALLET],
  ['counterwallet-segwit', COUNTERWALLET],
  ['freewallet-bip39', BIP39],
  ['freewallet-bip39-segwit', BIP39],
];

/** The routine as it stood before the seed was hoisted out of the loop. */
function originalDeriveMnemonicAddress(
  mnemonic: string,
  addressFormat: AddressFormat,
  index: number
): Address {
  const path = `${getDerivationPathForAddressFormat(addressFormat)}/${index}`;
  const address = getAddressFromMnemonic(mnemonic, path, addressFormat);
  const seed = getSeedFromMnemonic(mnemonic, addressFormat);
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(path);
  if (!child.publicKey) {
    throw new Error('Unable to derive public key');
  }
  return {
    name: `Address ${index + 1}`,
    path,
    address,
    pubKey: bytesToHex(child.publicKey),
  };
}

describe('batch derivation matches the routine it replaced', () => {
  const COUNT = 5;

  it.each(FORMATS)('derives identical addresses for %s', (addressFormat, mnemonic) => {
    const expected = Array.from({ length: COUNT }, (_, index) =>
      originalDeriveMnemonicAddress(mnemonic, addressFormat, index)
    );

    expect(deriveMnemonicAddresses(mnemonic, addressFormat, COUNT)).toEqual(expected);
  });

  it.each(FORMATS)('keeps the single-address entry point identical for %s', (addressFormat, mnemonic) => {
    for (let index = 0; index < COUNT; index++) {
      expect(deriveMnemonicAddress(mnemonic, addressFormat, index)).toEqual(
        originalDeriveMnemonicAddress(mnemonic, addressFormat, index)
      );
    }
  });

  // The formats differ in seed *and* in encoding, so a wrong hoist could still agree within one of
  // them. Distinct output across formats is what makes the per-format checks above meaningful.
  it('gives each format its own addresses, so the checks above are not comparing constants', () => {
    const first = FORMATS.map(
      ([addressFormat, mnemonic]) => deriveMnemonicAddresses(mnemonic, addressFormat, 1)[0]!.address
    );

    expect(new Set(first).size).toBe(FORMATS.length);
  });

  it('walks the index, rather than repeating address 0', () => {
    const addresses = deriveMnemonicAddresses(BIP39, 'p2wpkh', COUNT);

    expect(new Set(addresses.map((a) => a.address)).size).toBe(COUNT);
    expect(addresses.map((a) => a.path)).toEqual([
      "m/84'/0'/0'/0/0",
      "m/84'/0'/0'/0/1",
      "m/84'/0'/0'/0/2",
      "m/84'/0'/0'/0/3",
      "m/84'/0'/0'/0/4",
    ]);
    expect(addresses.map((a) => a.name)).toEqual([
      'Address 1',
      'Address 2',
      'Address 3',
      'Address 4',
      'Address 5',
    ]);
  });

  it('returns nothing for a count of zero rather than one address', () => {
    expect(deriveMnemonicAddresses(BIP39, 'p2wpkh', 0)).toEqual([]);
    expect(deriveMnemonicAddresses(BIP39, 'p2wpkh', -1)).toEqual([]);
  });

  // What the wallet actually calls. A record with no addressCount still means one address, not
  // none — an empty list here would present an unlocked wallet as having nowhere to receive.
  it('derives what a wallet record asks for, defaulting to one', () => {
    const record = (addressCount?: number) =>
      ({
        type: 'mnemonic',
        addressFormat: 'p2wpkh',
        addressCount,
      }) as unknown as WalletRecord;

    expect(deriveAddressesFromSecret(BIP39, record(3))).toEqual(
      deriveMnemonicAddresses(BIP39, 'p2wpkh', 3)
    );
    expect(deriveAddressesFromSecret(BIP39, record())).toHaveLength(1);
    expect(deriveAddressesFromSecret(BIP39, record(0))).toHaveLength(1);
  });
});
