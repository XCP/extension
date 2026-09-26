/**
 * Revealing a recovery phrase or private key checks the password in the background.
 *
 * The reveal pages used to verify the password themselves and then ask the background for the
 * secret, which it returned to any extension page without a password. revealSecret does both in
 * one call: the password is checked against the vault (and a wrong one counts towards the same
 * limit as unlocking) before any secret is decrypted.
 *
 * Real encryption and session manager; only browser storage and the attempt limiter are replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { bufferToBase64 } from '@/core/encryption/buffer';
import { deriveKey } from '@/core/encryption/encryption';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { encryptKeychainRecord } from '@/core/wallet/keychainCrypto';
import * as sessionManager from '@/platform/auth/sessionManager';
import { assertUnlockAllowed, clearUnlockAttempts, recordFailedUnlockAttempt } from '@/platform/auth/unlockRateLimiter';
import type { SessionMetadata } from '@/platform/storage/sessionMetadataStorage';
import type { KeychainRecord } from '@/types/wallet';
import { WalletManager } from '../walletManager';

const state = vi.hoisted(() => ({ record: null as KeychainRecord | null, cachedKey: null as string | null }));
vi.mock('@/platform/storage/walletStorage', () => ({
  getKeychainRecord: vi.fn(async () => structuredClone(state.record)),
  saveKeychainRecord: vi.fn(async (record: KeychainRecord) => { state.record = structuredClone(record); }),
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

// BIP-84 test vector: the first receive key of this phrase.
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const FIRST_KEY_WIF = 'KyZpNDKnfs94vbrwhJneDi77V6jF64PWPF8x5cdJb8ifgg2DUc9d';
const OTHER_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const PRIVATE_KEY = 'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn';

describe('revealSecret', () => {
  const password = 'synthetic-vault-password';
  let manager: WalletManager;
  let metadata: SessionMetadata | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
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
    const key = await deriveKey(password, salt, 500_000);
    state.record = await encryptKeychainRecord(
      { version: 1, wallets: [], settings: { ...DEFAULT_SETTINGS } },
      key, bufferToBase64(salt), 500_000,
    );
    manager = new WalletManager();
    await manager.unlockKeychain(password);
  });

  it('returns the recovery phrase for the right password', async () => {
    const wallet = await manager.createMnemonicWallet(MNEMONIC, password);
    vi.mocked(clearUnlockAttempts).mockClear();
    await expect(manager.revealSecret({ walletId: wallet.id, password, kind: 'mnemonic' })).resolves.toBe(MNEMONIC);
    expect(clearUnlockAttempts).toHaveBeenCalled();
  });

  it('returns nothing for a wrong password, and counts it as a failed attempt', async () => {
    const wallet = await manager.createMnemonicWallet(MNEMONIC, password);
    await expect(manager.revealSecret({ walletId: wallet.id, password: 'not-the-password', kind: 'mnemonic' }))
      .resolves.toBeNull();
    await expect(manager.revealSecret({
      walletId: wallet.id, password: 'not-the-password', kind: 'privateKey', path: "m/84'/0'/0'/0/0",
    })).resolves.toBeNull();
    expect(recordFailedUnlockAttempt).toHaveBeenCalledTimes(2);
  });

  it('refuses while unlocking is locked out, before trying the password', async () => {
    const wallet = await manager.createMnemonicWallet(MNEMONIC, password);
    vi.mocked(assertUnlockAllowed).mockRejectedValueOnce(new Error('Too many failed attempts'));
    await expect(manager.revealSecret({ walletId: wallet.id, password, kind: 'mnemonic' }))
      .rejects.toThrow('Too many failed attempts');
  });

  it('returns the private key for an address path of a mnemonic wallet', async () => {
    const wallet = await manager.createMnemonicWallet(MNEMONIC, password);
    await expect(manager.revealSecret({
      walletId: wallet.id, password, kind: 'privateKey', path: "m/84'/0'/0'/0/0",
    })).resolves.toBe(FIRST_KEY_WIF);
  });

  it('asks for a path only after the password is right', async () => {
    const wallet = await manager.createMnemonicWallet(MNEMONIC, password);
    await expect(manager.revealSecret({ walletId: wallet.id, password: 'not-the-password', kind: 'privateKey' }))
      .resolves.toBeNull();
    await expect(manager.revealSecret({ walletId: wallet.id, password, kind: 'privateKey' }))
      .rejects.toThrow('derivation path');
  });

  it('returns the key of a private-key wallet', async () => {
    const wallet = await manager.createPrivateKeyWallet(PRIVATE_KEY, password, undefined, AddressFormat.P2WPKH);
    await expect(manager.revealSecret({ walletId: wallet.id, password, kind: 'privateKey' })).resolves.toBe(PRIVATE_KEY);
    await expect(manager.revealSecret({ walletId: wallet.id, password, kind: 'mnemonic' }))
      .rejects.toThrow('recovery phrase');
  });

  it('reveals a wallet that is not the active one without switching to it', async () => {
    const first = await manager.createMnemonicWallet(MNEMONIC, password);
    const second = await manager.createMnemonicWallet(OTHER_MNEMONIC, password);
    expect(manager.getActiveWallet()?.id).toBe(second.id);
    expect(await sessionManager.getUnlockedSecret(first.id)).toBeNull();

    await expect(manager.revealSecret({ walletId: first.id, password, kind: 'mnemonic' })).resolves.toBe(MNEMONIC);
    expect(manager.getActiveWallet()?.id).toBe(second.id);
    expect(await sessionManager.getUnlockedSecret(first.id)).toBeNull();
  });

  it('refuses when the wallet is locked or unknown', async () => {
    const wallet = await manager.createMnemonicWallet(MNEMONIC, password);
    await expect(manager.revealSecret({ walletId: 'f'.repeat(64), password, kind: 'mnemonic' }))
      .rejects.toThrow('Wallet not found');
    await manager.lockKeychain();
    await expect(manager.revealSecret({ walletId: wallet.id, password, kind: 'mnemonic' }))
      .rejects.toThrow('locked');
  });
});
