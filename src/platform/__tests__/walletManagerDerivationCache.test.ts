/**
 * The derivation caches a signing flow and the wallet screens lean on.
 *
 * Two kinds, held to different rules. The HD nodes held beside the unlocked mnemonic are key
 * material: every path that ends the unlocked state (lock, switch, removal, reset, password change,
 * expiry) must zero them. The address lists are public, but belong to an unlocked session: they
 * are reused only while the record they were derived from is unchanged, and dropped on lock.
 *
 * Real WalletManager, real session manager, real encryption and derivation; only browser storage
 * is replaced.
 */
import type { HDKey } from '@scure/bip32';
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { getPrivateKeyFromMnemonic } from '@/core/bitcoin/privateKey';
import { bufferToBase64 } from '@/core/encryption/buffer';
import { decryptWithKey, deriveKey, encryptWithKey } from '@/core/encryption/encryption';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { deriveAddressesFromSecret, deriveMnemonicAddress, deriveMnemonicAddresses, generateWalletId } from '@/core/wallet/addressDeriver';
import { encryptKeychainRecord } from '@/core/wallet/keychainCrypto';
import * as sessionManager from '@/platform/auth/sessionManager';
import type { SessionMetadata } from '@/platform/storage/sessionMetadataStorage';
import type { KeychainRecord, WalletRecord } from '@/types/wallet';
import { WalletManager } from '../walletManager';

const state = vi.hoisted(() => ({
  record: null as KeychainRecord | null,
  cachedKey: null as string | null,
}));
vi.mock('@/platform/storage/walletStorage', () => ({
  getKeychainRecord: vi.fn(async () => structuredClone(state.record)),
  saveKeychainRecord: vi.fn(async (record: KeychainRecord) => { state.record = structuredClone(record); }),
  assertNoKeychainRecord: vi.fn(async () => {}),
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
vi.mock('@/core/wallet/addressDeriver', async (original) => {
  const actual = await original<typeof import('@/core/wallet/addressDeriver')>();
  return { ...actual, deriveAddressesFromSecret: vi.fn(actual.deriveAddressesFromSecret) };
});
vi.mock('@/core/encryption/encryption', async (original) => {
  const actual = await original<typeof import('@/core/encryption/encryption')>();
  return { ...actual, decryptWithKey: vi.fn(actual.decryptWithKey) };
});

const PASSWORD = 'synthetic-vault-password';
const ITERATIONS = 500_000;
const MNEMONIC_A = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const MNEMONIC_B = generateMnemonic(wordlist);
const FORMAT = AddressFormat.P2WPKH;

/** The master key node the session holds for a wallet, or null if it holds none. */
function heldRoot(walletId: string, mnemonic: string): HDKey | null {
  let held: HDKey | null = null;
  try {
    held = sessionManager.unlockedHdNodeCache(walletId, mnemonic)('seed:bip39', () => {
      throw new Error('not held');
    });
  } catch {
    // Not held.
  }
  return held;
}

describe('wallet derivation caches', () => {
  let manager: WalletManager;
  let metadata: SessionMetadata | undefined;
  let idA: string;
  let idB: string;
  
  beforeEach(async () => {
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
    const key = await deriveKey(PASSWORD, salt, ITERATIONS);
    idA = await generateWalletId(MNEMONIC_A, FORMAT);
    idB = await generateWalletId(MNEMONIC_B, FORMAT);
    const record = async (id: string, mnemonic: string, name: string): Promise<WalletRecord> => ({
      id, name, type: 'mnemonic', addressFormat: FORMAT, addressCount: 3,
      encryptedSecret: await encryptWithKey(mnemonic, key),
      previewAddress: deriveMnemonicAddresses(mnemonic, FORMAT, 1)[0]!.address, createdAt: 1,
    });
    state.record = await encryptKeychainRecord(
      { version: 1, wallets: [await record(idA, MNEMONIC_A, 'Wallet 1'), await record(idB, MNEMONIC_B, 'Wallet 2')],
        settings: { ...DEFAULT_SETTINGS, lastActiveWalletId: idA } },
      key, bufferToBase64(salt), ITERATIONS,
    );
    manager = new WalletManager();
    await manager.unlockKeychain(PASSWORD);
    vi.mocked(deriveAddressesFromSecret).mockClear();
    vi.mocked(decryptWithKey).mockClear();
  });

  describe('HD nodes held for signing', () => {
    /** Sign-path lookups that populate the session's node cache for the active wallet. */
    async function useKeys(): Promise<HDKey> {
      const path = manager.getActiveWallet()!.addresses[1]!.path;
      expect((await manager.getPrivateKey(idA, path)).hex).toBe(getPrivateKeyFromMnemonic(MNEMONIC_A, path, FORMAT));
      const root = heldRoot(idA, MNEMONIC_A);
      expect(root?.privateKey).not.toBeNull();
      return root!;
    }

    it('serves the same keys the full derivation gives, from nodes held while unlocked', async () => {
      const root = await useKeys();
      for (const index of [0, 2, 7]) {
        const path = `m/84'/0'/0'/0/${index}`;
        expect((await manager.getPrivateKey(idA, path)).hex).toBe(getPrivateKeyFromMnemonic(MNEMONIC_A, path, FORMAT));
      }
      expect(heldRoot(idA, MNEMONIC_A)).toBe(root);
    });

    it.each([
      ['lock', (m: WalletManager) => m.lockKeychain()],
      ['a switch to another wallet', (m: WalletManager) => m.selectWallet(idB)],
      ['clearing the wallet secret', async (m: WalletManager) => { m.clearWalletSecret(idA); }],
      ['removing the wallet', (m: WalletManager) => m.removeWallet(idA)],
      ['a keychain reset', (m: WalletManager) => m.resetKeychain(PASSWORD)],
      ['a password change', (m: WalletManager) => m.updatePassword(PASSWORD, 'synthetic-new-password')],
      ['session expiry', async () => {
        const longAgo = Date.now() - 9 * 60 * 60 * 1000;
        metadata = { ...metadata!, lastActiveTime: longAgo, unlockedAt: longAgo };
        expect(await sessionManager.expireSessionIfNeeded()).toBe(true);
      }],
    ])('zeroes and drops them on %s', async (_label, end) => {
      const root = await useKeys();
      await end(manager);
      expect(root.privateKey).toBeNull();
      expect(heldRoot(idA, MNEMONIC_A)).toBeNull();
    });

    it('starts from nothing after a lock and a fresh unlock', async () => {
      const root = await useKeys();
      await manager.lockKeychain();
      await manager.unlockKeychain(PASSWORD);
      const again = heldRoot(idA, MNEMONIC_A);
      expect(again).not.toBe(root);
      expect(root.privateKey).toBeNull();
    });

    it('never holds nodes for a wallet that is not the unlocked one', async () => {
      await manager.isAddressInAnyWallet('bc1qnotmine0000000000000000000000000000000');
      expect(heldRoot(idB, MNEMONIC_B)).toBeNull();
    });
  });

  describe('paired addresses', () => {
    it('match fresh derivation and are dropped on lock', async () => {
      await manager.updateWalletAddressFormat(idA, AddressFormat.P2PKH);
      const paired = await manager.getPairedAddresses();
      expect(paired.legacy.address).toBe(deriveMnemonicAddress(MNEMONIC_A, AddressFormat.P2PKH, 0).address);
      expect(paired.segwit.address).toBe(deriveMnemonicAddress(MNEMONIC_A, AddressFormat.P2WPKH, 0).address);
      expect(await manager.getPairedAddresses()).toEqual(paired);
      expect(manager['pairedAddressMemo'].size).toBe(2);
      await manager.lockKeychain();
      expect(manager['pairedAddressMemo'].size).toBe(0);
      await expect(manager.getPairedAddresses()).rejects.toThrow();
    });
  });

  describe('address lists', () => {
    it('are not re-derived by a refresh when nothing changed', async () => {
      const before = manager.getActiveWallet()!.addresses;
      await manager.refreshWallets();
      await manager.refreshWallets();
      expect(deriveAddressesFromSecret).not.toHaveBeenCalled();
      expect(manager.getActiveWallet()!.addresses).toEqual(before);
      expect(manager.getActiveWallet()!.addresses).toEqual(deriveMnemonicAddresses(MNEMONIC_A, FORMAT, 3));
    });

    it('are re-derived when the record changes', async () => {
      await manager.addAddress(idA);
      await manager.refreshWallets();
      expect(manager.getActiveWallet()!.addresses).toEqual(deriveMnemonicAddresses(MNEMONIC_A, FORMAT, 4));
      await manager.updateWalletAddressFormat(idA, AddressFormat.P2TR);
      await manager.refreshWallets();
      expect(manager.getActiveWallet()!.addresses).toEqual(deriveMnemonicAddresses(MNEMONIC_A, AddressFormat.P2TR, 4));
    });

    it('let the send form find another wallet\'s address without decrypting it again', async () => {
      const otherAddress = deriveMnemonicAddresses(MNEMONIC_B, FORMAT, 3)[2]!.address;
      const stranger = deriveMnemonicAddresses(generateMnemonic(wordlist), FORMAT, 1)[0]!.address;
      expect(await manager.isAddressInAnyWallet(stranger)).toBe(false);
      expect(decryptWithKey).toHaveBeenCalledTimes(1);
      expect(await manager.isAddressInAnyWallet(stranger)).toBe(false);
      expect(await manager.isAddressInAnyWallet(otherAddress)).toBe(true);
      expect(decryptWithKey).toHaveBeenCalledTimes(1);
      expect(deriveAddressesFromSecret).toHaveBeenCalledTimes(1);
    });

    it('are dropped on lock, so nothing answers for a locked vault', async () => {
      const otherAddress = deriveMnemonicAddresses(MNEMONIC_B, FORMAT, 3)[2]!.address;
      expect(await manager.isAddressInAnyWallet(otherAddress)).toBe(true);
      expect(manager['derivedAddressSets'].size).toBe(2);
      await manager.lockKeychain();
      expect(manager['derivedAddressSets'].size).toBe(0);
      expect(await manager.isAddressInAnyWallet(otherAddress)).toBe(false);
      await manager.unlockKeychain(PASSWORD);
      vi.mocked(decryptWithKey).mockClear();
      expect(await manager.isAddressInAnyWallet(otherAddress)).toBe(true);
      expect(decryptWithKey).toHaveBeenCalledTimes(1);
    });

    it('are dropped on reset', async () => {
      await manager.isAddressInAnyWallet('bc1qnotmine0000000000000000000000000000000');
      expect(manager['derivedAddressSets'].size).toBe(2);
      await manager.resetKeychain(PASSWORD);
      expect(manager['derivedAddressSets'].size).toBe(0);
    });

    it('do not keep a list derived by a lookup that a lock overtook', async () => {
      const decrypt = vi.mocked(decryptWithKey);
      const real = decrypt.getMockImplementation()!;
      decrypt.mockImplementationOnce(async (...args) => {
        const secret = await real(...args);
        await manager.lockKeychain();
        return secret;
      });
      // Not the preview address, which is answered from the record without deriving anything.
      expect(await manager.isAddressInAnyWallet(deriveMnemonicAddresses(MNEMONIC_B, FORMAT, 3)[2]!.address)).toBe(true);
      expect(decrypt).toHaveBeenCalledTimes(1);
      expect(manager['derivedAddressSets'].size).toBe(0);
    });
  });
});
