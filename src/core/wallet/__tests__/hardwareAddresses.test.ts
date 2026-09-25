import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { describe, expect, it } from 'vitest';
import { AddressFormat, getDerivationPathForAddressFormat } from '@/core/bitcoin/address';
import type { HardwareWalletSecret, WalletRecord } from '@/types/wallet';
import { deriveAddressesFromSecret, deriveHardwareAddress, deriveMnemonicAddresses } from '../addressDeriver';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const MASTER = HDKey.fromMasterSeed(mnemonicToSeedSync(MNEMONIC));
const ZPUB = { private: 0x04b2430c, public: 0x04b24746 };

/** What a Trezor connected through the account picker stores for this seed's first account. */
function trezorWallet(format: AddressFormat, addressCount: number, xpub?: string) {
  const branch = getDerivationPathForAddressFormat(format); // m/purpose'/0'/0'/0
  const accountPath = branch.slice(0, -'/0'.length);
  const secret: HardwareWalletSecret = {
    deviceType: 'trezor',
    publicKey: '',
    derivationPath: `${accountPath}/0/0`,
    accountIndex: 0,
    usePassphrase: false,
    xpub: xpub ?? MASTER.derive(accountPath).publicExtendedKey,
  };
  const record: WalletRecord = {
    id: 'hw',
    name: 'Trezor',
    type: 'hardware',
    addressFormat: format,
    addressCount,
    previewAddress: deriveMnemonicAddresses(MNEMONIC, format, 1)[0]!.address,
    encryptedSecret: '',
  };
  return { secret: JSON.stringify(secret), record };
}

const TREZOR_FORMATS = [
  AddressFormat.P2PKH,
  AddressFormat.P2SH_P2WPKH,
  AddressFormat.P2WPKH,
  AddressFormat.P2TR,
];

describe('hardware wallet addresses', () => {
  for (const format of TREZOR_FORMATS) {
    it(`derives the same ${format} receive addresses and paths the seed itself does`, () => {
      const { secret, record } = trezorWallet(format, 4);
      const expected = deriveMnemonicAddresses(MNEMONIC, format, 4);

      const addresses = deriveAddressesFromSecret(secret, record);

      expect(addresses.map(a => [a.name, a.path, a.address])).toEqual(
        expected.map(a => [a.name, a.path, a.address]),
      );
      expect(addresses.slice(1).map(a => a.pubKey)).toEqual(expected.slice(1).map(a => a.pubKey));
    });
  }

  it('reads a zpub account key', () => {
    const zpub = HDKey.fromMasterSeed(mnemonicToSeedSync(MNEMONIC), ZPUB).derive("m/84'/0'/0'").publicExtendedKey;
    const { secret, record } = trezorWallet(AddressFormat.P2WPKH, 1, zpub);
    expect(deriveHardwareAddress(secret, record, 1)?.address)
      .toBe(deriveMnemonicAddresses(MNEMONIC, AddressFormat.P2WPKH, 2)[1]!.address);
  });

  it('keeps a one-address wallet at the address the device reported', () => {
    const { secret, record } = trezorWallet(AddressFormat.P2WPKH, 1);
    const addresses = deriveAddressesFromSecret(secret, record);
    expect(addresses).toHaveLength(1);
    expect(addresses[0]!.address).toBe(record.previewAddress);
  });

  it('refuses to derive from an account key that does not reproduce the device address', () => {
    const other = MASTER.derive("m/84'/0'/1'").publicExtendedKey;
    const { secret, record } = trezorWallet(AddressFormat.P2WPKH, 3, other);

    expect(deriveHardwareAddress(secret, record, 1)).toBeNull();
    // Only the device-reported address survives.
    expect(deriveAddressesFromSecret(secret, record).map(a => a.address)).toEqual([record.previewAddress]);
  });

  it('refuses without an xpub, a /0/0 path, or a valid index', () => {
    const { secret, record } = trezorWallet(AddressFormat.P2WPKH, 1);
    const parsed = JSON.parse(secret) as HardwareWalletSecret;

    expect(deriveHardwareAddress(JSON.stringify({ ...parsed, xpub: undefined }), record, 1)).toBeNull();
    expect(deriveHardwareAddress(JSON.stringify({ ...parsed, derivationPath: "m/84'/0'/0'/1/0" }), record, 1)).toBeNull();
    expect(deriveHardwareAddress(secret, record, -1)).toBeNull();
    expect(deriveHardwareAddress(secret, record, 1.5)).toBeNull();
    expect(deriveHardwareAddress(secret, { ...record, type: 'mnemonic' }, 1)).toBeNull();
  });
});
