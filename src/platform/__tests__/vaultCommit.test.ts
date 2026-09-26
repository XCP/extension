/**
 * A vault change is published only once it is on disk.
 *
 * Every mutator used to change the in-memory keychain first and persist afterwards. When the
 * persist failed (encryption, storage, or a lock between the two), memory kept the change the disk
 * never saw, and the next unrelated write committed it. Worse, the create paths check for a
 * duplicate against the runtime wallet list, which a failed create never reached, so retrying the
 * create pushed a second record with the same ID — and a keychain with duplicate IDs no longer
 * passes validation, so the next unlock failed.
 *
 * Real encryption, real session manager; only browser storage is replaced, with a switch that fails
 * the next keychain write.
 */
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { bufferToBase64 } from '@/core/encryption/buffer';
import { deriveKey } from '@/core/encryption/encryption';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { deriveMnemonicAddresses } from '@/core/wallet/addressDeriver';
import { decryptKeychain, encryptKeychainRecord } from '@/core/wallet/keychainCrypto';
import * as sessionManager from '@/platform/auth/sessionManager';
import type { SessionMetadata } from '@/platform/storage/sessionMetadataStorage';
import type { Keychain, KeychainRecord } from '@/types/wallet';
import { WalletManager } from '../walletManager';

const state = vi.hoisted(() => ({
  record: null as KeychainRecord | null,
  cachedKey: null as string | null,
  failNextSave: false,
  readBarrier: null as null | { enter: () => void; released: Promise<void> },
  utxoFound: true,
}));
vi.mock('@/platform/storage/walletStorage', () => ({
  getKeychainRecord: vi.fn(async () => {
    const pending = state.readBarrier;
    state.readBarrier = null;
    if (pending) { pending.enter(); await pending.released; }
    return structuredClone(state.record);
  }),
  saveKeychainRecord: vi.fn(async (record: KeychainRecord) => {
    if (state.failNextSave) {
      state.failNextSave = false;
      throw new Error('Failed to save keychain');
    }
    state.record = structuredClone(record);
  }),
  assertNoKeychainRecord: vi.fn(async () => {
    if (state.record) throw new Error('A keychain already exists');
  }),
  deleteKeychain: vi.fn(async () => { state.record = null; }),
}));
vi.mock('@/platform/storage/keyStorage', () => ({
  getCachedKeychainMasterKey: vi.fn(async () => state.cachedKey),
  setCachedKeychainMasterKey: vi.fn(async (key: string) => { state.cachedKey = key; }),
  clearCachedKeychainMasterKey: vi.fn(async () => { state.cachedKey = null; }),
}));
vi.mock('@/platform/auth/unlockRateLimiter', () => ({
  assertUnlockAllowed: vi.fn(async () => {}),
  clearUnlockAttempts: vi.fn(async () => {}),
  recordFailedUnlockAttempt: vi.fn(async () => {}),
}));
// The UTXO lookup asks an API whether an address was ever used; answer it here.
vi.mock('@/core/wallet/rarePepeWallet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/wallet/rarePepeWallet')>()),
  detectUtxoAddress: vi.fn(async () => ({ status: state.utxoFound ? 'found' : 'empty' })),
}));

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const OTHER_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
// Every word is on the Counterwallet wordlist.
const COUNTERWALLET_MNEMONIC = 'like just love know never want time out there make look eye';
const PRIVATE_KEY = 'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn';

const TREZOR_XPUB = HDKey.fromMasterSeed(mnemonicToSeedSync(OTHER_MNEMONIC)).derive("m/84'/0'/0'").publicExtendedKey;
const TREZOR_ADDRESS = deriveMnemonicAddresses(OTHER_MNEMONIC, AddressFormat.P2WPKH, 1)[0]!.address;
vi.mock('@/platform/suiteAccess', () => ({ assertTrezorSuiteAccess: vi.fn(async () => {}) }));
vi.mock('@/core/hardware/trezorAdapter', () => ({
  resetTrezorAdapter: vi.fn(async () => {}),
  getTrezorAdapter: vi.fn(() => ({
    init: vi.fn(async () => {}),
    discoverAccount: vi.fn(async () => ({
      path: "m/84'/0'/0'",
      address: TREZOR_ADDRESS,
      addressFormat: AddressFormat.P2WPKH,
      accountIndex: 0,
      xpub: TREZOR_XPUB,
    })),
  })),
}));

describe('vault commit-then-publish', () => {
  const password = 'synthetic-vault-password';
  let manager: WalletManager;
  let metadata: SessionMetadata | undefined;
  let key: CryptoKey;

  /** What the disk holds, decrypted. */
  const onDisk = async (): Promise<Keychain> => decryptKeychain(state.record!, key);
  /** What memory holds. */
  const inMemory = (): Keychain => structuredClone(manager['keychain'] as Keychain);
  /** Memory and disk agree, and the runtime list mirrors the keychain's records. */
  const expectMemoryMatchesDisk = async () => {
    expect(inMemory()).toEqual(await onDisk());
    expect(manager.getWallets().map(wallet => [wallet.id, wallet.name, wallet.addressFormat, wallet.addressCount]))
      .toEqual((await onDisk()).wallets.map(record => [record.id, record.name, record.addressFormat, record.addressCount]));
  };
  /** An unrelated write: under the old order it committed whatever the failed one left behind. */
  const unrelatedWrite = () => manager.updateSettings({ fiat: 'eur' });

  beforeEach(async () => {
    state.readBarrier = null;
    state.failNextSave = false;
    state.utxoFound = true;
    metadata = undefined;
    globalThis.chrome = {
      ...globalThis.chrome,
      alarms: { create: vi.fn(async () => {}), clear: vi.fn(async () => true) },
      storage: { session: {
        get: vi.fn(async () => ({ sessionMetadata: metadata ? { ...metadata } : undefined })),
        set: vi.fn(async (data: { sessionMetadata: SessionMetadata }) => { metadata = { ...data.sessionMetadata }; }),
        remove: vi.fn(async () => { metadata = undefined; }),
      } },
    } as unknown as typeof chrome;
    sessionManager.registerSessionExpiredHandler(null);
    await sessionManager.clearAllUnlockedSecrets();
    const salt = new Uint8Array(16).fill(7);
    key = await deriveKey(password, salt, 500_000);
    state.record = await encryptKeychainRecord(
      { version: 1, wallets: [], settings: { ...DEFAULT_SETTINGS } },
      key, bufferToBase64(salt), 500_000,
    );
    manager = new WalletManager();
    await manager.unlockKeychain(password);
  });

  describe('a failed create', () => {
    it('leaves no mnemonic wallet behind, and a retry creates exactly one', async () => {
      state.failNextSave = true;
      await expect(manager.createMnemonicWallet(MNEMONIC, password)).rejects.toThrow('Failed to save keychain');
      expect(manager.getWallets()).toEqual([]);

      await unrelatedWrite();
      expect((await onDisk()).wallets).toEqual([]);
      await expectMemoryMatchesDisk();

      const wallet = await manager.createMnemonicWallet(MNEMONIC, password);
      expect((await onDisk()).wallets.map(record => record.id)).toEqual([wallet.id]);
      await expectMemoryMatchesDisk();

      // The vault still opens: a duplicate ID would fail keychain validation here.
      await manager.lockKeychain();
      await manager.unlockKeychain(password);
      expect(manager.getWallets().map(entry => entry.id)).toEqual([wallet.id]);
    });

    it('leaves no private-key wallet behind, and a retry creates exactly one', async () => {
      state.failNextSave = true;
      await expect(manager.createPrivateKeyWallet(PRIVATE_KEY, password)).rejects.toThrow('Failed to save keychain');
      expect(manager.getWallets()).toEqual([]);

      const wallet = await manager.createPrivateKeyWallet(PRIVATE_KEY, password);
      expect((await onDisk()).wallets.map(record => record.id)).toEqual([wallet.id]);
      await expectMemoryMatchesDisk();
      await manager.lockKeychain();
      await manager.unlockKeychain(password);
      expect(manager.getWallets()).toHaveLength(1);
    });

    it('leaves no hardware wallet behind, and a retry connects exactly one', async () => {
      state.failNextSave = true;
      await expect(manager.createHardwareWalletWithDiscovery('trezor')).rejects.toThrow('Failed to save keychain');
      expect(manager.getWallets()).toEqual([]);

      const wallet = await manager.createHardwareWalletWithDiscovery('trezor');
      expect((await onDisk()).wallets.map(record => record.id)).toEqual([wallet.id]);
      await expectMemoryMatchesDisk();
      await manager.lockKeychain();
      await manager.unlockKeychain(password);
      expect(manager.getWallets()).toHaveLength(1);
    });

    it('leaves nothing behind when the wallet locks while the create is being written', async () => {
      let enter = () => {};
      let release = () => {};
      const entered = new Promise<void>(resolve => { enter = resolve; });
      state.readBarrier = { enter: () => enter(), released: new Promise<void>(resolve => { release = resolve; }) };
      const creating = manager.createMnemonicWallet(MNEMONIC, password);
      const rejected = expect(creating).rejects.toThrow('Wallet session changed');
      await entered;
      await manager.lockKeychain();
      release();
      await rejected;

      await manager.unlockKeychain(password);
      expect(manager.getWallets()).toEqual([]);
      await expectMemoryMatchesDisk();
    });
  });

  describe('a failed change to an existing wallet', () => {
    it('does not add the address it could not save', async () => {
      const wallet = await manager.createMnemonicWallet(MNEMONIC, password);
      state.failNextSave = true;
      await expect(manager.addAddress(wallet.id)).rejects.toThrow('Failed to save keychain');
      expect(manager.getWalletById(wallet.id)?.addressCount).toBe(1);
      expect(manager.getWalletById(wallet.id)?.addresses).toHaveLength(1);

      await unrelatedWrite();
      expect((await onDisk()).wallets[0]!.addressCount).toBe(1);
      await expectMemoryMatchesDisk();

      const second = await manager.addAddress(wallet.id);
      expect(second.path).toBe("m/84'/0'/0'/0/1");
      expect((await onDisk()).wallets[0]!.addressCount).toBe(2);
      await expectMemoryMatchesDisk();
    });

    it('keeps a wallet it could not remove, with its secret still unlocked', async () => {
      const first = await manager.createMnemonicWallet(MNEMONIC, password);
      const second = await manager.createMnemonicWallet(OTHER_MNEMONIC, password);
      state.failNextSave = true;
      await expect(manager.removeWallet(second.id)).rejects.toThrow('Failed to save keychain');
      expect(manager.getWallets().map(wallet => wallet.id)).toEqual([first.id, second.id]);
      expect(manager.getActiveWallet()?.id).toBe(second.id);
      expect(await sessionManager.getUnlockedSecret(second.id)).toBe(OTHER_MNEMONIC);
      expect(manager.getActiveWallet()?.addresses).toHaveLength(1);

      await unrelatedWrite();
      expect((await onDisk()).wallets).toHaveLength(2);
      await expectMemoryMatchesDisk();

      await manager.removeWallet(second.id);
      expect(manager.getWallets().map(wallet => wallet.id)).toEqual([first.id]);
      expect(await sessionManager.getUnlockedSecret(second.id)).toBeNull();
      await expectMemoryMatchesDisk();
    });

    it('renumbers default names only once the removal is saved', async () => {
      const first = await manager.createMnemonicWallet(MNEMONIC, password);
      const second = await manager.createMnemonicWallet(OTHER_MNEMONIC, password);
      expect(manager.getWalletById(second.id)?.name).toBe('Wallet 2');
      state.failNextSave = true;
      await expect(manager.removeWallet(first.id)).rejects.toThrow('Failed to save keychain');
      expect(manager.getWalletById(second.id)?.name).toBe('Wallet 2');
      await expectMemoryMatchesDisk();

      await manager.removeWallet(first.id);
      expect(manager.getWalletById(second.id)?.name).toBe('Wallet 1');
      await expectMemoryMatchesDisk();
    });

    it('does not switch an address format it could not save', async () => {
      const wallet = await manager.createMnemonicWallet(MNEMONIC, password);
      await manager.updateSettings({ lastActiveAddress: manager.getActiveWallet()!.addresses[0]!.address });
      const before = { ...manager.getWalletById(wallet.id)!, addresses: [...manager.getWalletById(wallet.id)!.addresses] };
      const activeAddress = manager.getSettings().lastActiveAddress;

      state.failNextSave = true;
      await expect(manager.updateWalletAddressFormat(wallet.id, AddressFormat.P2TR)).rejects.toThrow('Failed to save keychain');
      expect(manager.getWalletById(wallet.id)).toEqual(before);
      expect(manager.getSettings().lastActiveAddress).toBe(activeAddress);

      await unrelatedWrite();
      expect((await onDisk()).wallets[0]!.addressFormat).toBe(AddressFormat.P2WPKH);
      await expectMemoryMatchesDisk();

      await manager.updateWalletAddressFormat(wallet.id, AddressFormat.P2TR);
      expect(manager.getWalletById(wallet.id)?.addressFormat).toBe(AddressFormat.P2TR);
      expect(manager.getSettings().lastActiveAddress).toMatch(/^bc1p/);
      await expectMemoryMatchesDisk();
    });

    it('does not keep a UTXO address it could not save, nor forget one it could not drop', async () => {
      const wallet = await manager.createMnemonicWallet(COUNTERWALLET_MNEMONIC, password, undefined, AddressFormat.Counterwallet);
      state.failNextSave = true;
      await expect(manager.addUtxoAddress(wallet.id, 0)).rejects.toThrow('Failed to save keychain');
      expect(manager.getWalletById(wallet.id)?.extraPaths).toBeUndefined();
      expect(manager.getWalletById(wallet.id)?.addresses).toHaveLength(1);
      await unrelatedWrite();
      expect((await onDisk()).wallets[0]!.extraPaths).toBeUndefined();
      await expectMemoryMatchesDisk();

      const kept = await manager.addUtxoAddress(wallet.id, 0);
      expect(kept).not.toBeNull();
      expect((await onDisk()).wallets[0]!.extraPaths).toEqual([kept!.path]);
      expect(manager.getWalletById(wallet.id)?.addresses).toHaveLength(2);
      await expectMemoryMatchesDisk();

      state.failNextSave = true;
      await expect(manager.removeUtxoAddress(wallet.id, kept!.path)).rejects.toThrow('Failed to save keychain');
      expect(manager.getWalletById(wallet.id)?.extraPaths).toEqual([kept!.path]);
      expect(manager.getWalletById(wallet.id)?.addresses).toHaveLength(2);
      await expectMemoryMatchesDisk();

      await manager.removeUtxoAddress(wallet.id, kept!.path);
      expect(manager.getWalletById(wallet.id)?.extraPaths).toEqual([]);
      expect(manager.getWalletById(wallet.id)?.addresses).toHaveLength(1);
      await expectMemoryMatchesDisk();
    });

    it('does not keep settings it could not save', async () => {
      state.failNextSave = true;
      await expect(manager.updateSettings({ priceUnit: 'sats' })).rejects.toThrow('Failed to save keychain');
      expect(manager.getSettings().priceUnit).toBe('btc');
      await expectMemoryMatchesDisk();
    });

    it('does not keep a website grant it could not save', async () => {
      state.failNextSave = true;
      await expect(manager.addConnectedWebsite('https://site.example')).rejects.toThrow('Failed to save keychain');
      expect(manager.getSettings().connectedWebsites).toEqual([]);
      await unrelatedWrite();
      expect((await onDisk()).settings.connectedWebsites).toEqual([]);
    });
  });

  describe('activating a new wallet', () => {
    it('clears the previously active wallet when a hardware wallet is added', async () => {
      const mnemonicWallet = await manager.createMnemonicWallet(MNEMONIC, password);
      expect(await sessionManager.getUnlockedSecret(mnemonicWallet.id)).toBe(MNEMONIC);
      expect(manager.getWalletById(mnemonicWallet.id)?.addresses).toHaveLength(1);

      const trezor = await manager.createHardwareWalletWithDiscovery('trezor');

      expect(manager.getActiveWallet()?.id).toBe(trezor.id);
      // Only one wallet's secret is held at a time; the mnemonic (and the HD nodes derived from it,
      // which are cleared with it) must not stay behind when another wallet becomes active.
      expect(await sessionManager.getUnlockedSecret(mnemonicWallet.id)).toBeNull();
      expect(manager.getWalletById(mnemonicWallet.id)?.addresses).toEqual([]);
      expect(manager.getSettings()).toMatchObject({ lastActiveWalletId: trezor.id, lastActiveAddress: TREZOR_ADDRESS });
      expect(manager.getActiveWallet()?.addresses.map(address => address.address)).toEqual([TREZOR_ADDRESS]);
      await expectMemoryMatchesDisk();
    });

    it('clears the previously active wallet when a test address is imported', async () => {
      const mnemonicWallet = await manager.createMnemonicWallet(MNEMONIC, password);
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      try {
        const test = await manager.importTestAddress(TREZOR_ADDRESS);
        expect(manager.getActiveWallet()?.id).toBe(test.id);
      } finally {
        process.env.NODE_ENV = previous;
      }
      expect(await sessionManager.getUnlockedSecret(mnemonicWallet.id)).toBeNull();
      expect(manager.getWalletById(mnemonicWallet.id)?.addresses).toEqual([]);
      expect(manager.getSettings().lastActiveAddress).toBe(TREZOR_ADDRESS);
      await expectMemoryMatchesDisk();
    });

    it('does not reject re-selecting the active wallet however often it is asked', async () => {
      const wallet = await manager.createMnemonicWallet(MNEMONIC, password);
      for (let i = 0; i < 12; i++) await manager.selectWallet(wallet.id);
      expect(await sessionManager.getUnlockedSecret(wallet.id)).toBe(MNEMONIC);
    });
  });
});
