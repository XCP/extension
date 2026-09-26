import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { deriveAddressesFromSecret, deriveMnemonicAddresses } from '@/core/wallet/addressDeriver';
import { WalletManager } from '@/platform/walletManager';
import type { HardwareWalletSecret, WalletRecord } from '@/types/wallet';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const SECRET: HardwareWalletSecret = {
  deviceType: 'trezor',
  publicKey: '',
  derivationPath: "m/84'/0'/0'/0/0",
  accountIndex: 0,
  usePassphrase: false,
  xpub: HDKey.fromMasterSeed(mnemonicToSeedSync(MNEMONIC)).derive("m/84'/0'/0'").publicExtendedKey,
};
const { secret } = vi.hoisted(() => ({ secret: { value: '' } }));

vi.mock('@/core/hardware/trezorAdapter', () => ({ getTrezorAdapter: vi.fn() }));
vi.mock('@/platform/auth/sessionManager', async (original) => ({
  ...(await original<typeof import('@/platform/auth/sessionManager')>()),
  getUnlockedSecret: vi.fn(async () => secret.value),
}));

function managerWithTrezor(): { manager: WalletManager; record: WalletRecord } {
  secret.value = JSON.stringify(SECRET);
  const record: WalletRecord = {
    id: 'trezor', name: 'Trezor', type: 'hardware', addressFormat: AddressFormat.P2WPKH,
    addressCount: 1, encryptedSecret: '',
    previewAddress: deriveMnemonicAddresses(MNEMONIC, AddressFormat.P2WPKH, 1)[0]!.address,
  };
  const manager = new WalletManager();
  manager['keychain'] = { version: 1, wallets: [record], settings: {} } as never;
  manager['wallets'] = [{
    id: record.id, name: record.name, type: 'hardware', addressFormat: record.addressFormat,
    addressCount: 1, addresses: deriveAddressesFromSecret(secret.value, record),
    previewAddress: record.previewAddress,
  }];
  manager['activeWalletId'] = record.id;
  manager['persistKeychain'] = vi.fn(async () => {});
  return { manager, record };
}

describe('WalletManager.addAddress on a Trezor wallet', () => {
  it('adds the next receive address from the account xpub and persists the count', async () => {
    const { manager, record } = managerWithTrezor();
    const expected = deriveMnemonicAddresses(MNEMONIC, AddressFormat.P2WPKH, 3);

    const second = await manager.addAddress(record.id);
    const third = await manager.addAddress(record.id);

    expect([second.path, second.address]).toEqual([expected[1]!.path, expected[1]!.address]);
    expect([third.path, third.address]).toEqual([expected[2]!.path, expected[2]!.address]);
    // A saved change replaces the live keychain, so read the record back from it.
    const saved = manager['keychain']!.wallets[0]!;
    expect(saved.addressCount).toBe(3);
    expect(manager['persistKeychain']).toHaveBeenCalledTimes(2);
    // What the next unlock rebuilds is what was just added.
    expect(deriveAddressesFromSecret(secret.value, saved).map(a => a.address))
      .toEqual(expected.map(a => a.address));
  });

  it('adds nothing when the stored xpub does not reproduce the device address', async () => {
    const { manager, record } = managerWithTrezor();
    secret.value = JSON.stringify({
      ...SECRET,
      xpub: HDKey.fromMasterSeed(mnemonicToSeedSync(MNEMONIC)).derive("m/84'/0'/1'").publicExtendedKey,
    });

    await expect(manager.addAddress(record.id)).rejects.toThrow('Cannot derive another address');
    expect(record.addressCount).toBe(1);
    expect(manager['persistKeychain']).not.toHaveBeenCalled();
  });
});
