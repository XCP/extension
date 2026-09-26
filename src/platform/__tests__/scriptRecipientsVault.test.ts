/**
 * The script addresses a wallet has paid are kept in its encrypted keychain.
 *
 * They used to be kept in plaintext local storage, outside the vault, where they named this
 * wallet's addresses and whom they paid, and survived a wallet reset into the next wallet. In the
 * keychain they are encrypted with everything else, survive lock and restart so an acknowledged
 * notice is not repeated, and go with the vault when it is reset.
 *
 * Real encryption and wallet manager; only browser storage is replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bufferToBase64 } from '@/core/encryption/buffer';
import { deriveKey } from '@/core/encryption/encryption';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { decryptKeychain, encryptKeychainRecord, parseKeychain } from '@/core/wallet/keychainCrypto';
import * as sessionManager from '@/platform/auth/sessionManager';
import type { SessionMetadata } from '@/platform/storage/sessionMetadataStorage';
import { saveKeychainRecord } from '@/platform/storage/walletStorage';
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

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const P2TR = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';
const P2SH = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';

describe('script payment recipients in the vault', () => {
  const password = 'synthetic-vault-password';
  let manager: WalletManager;
  let metadata: SessionMetadata | undefined;
  let key: CryptoKey;
  let payer: string;

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
    key = await deriveKey(password, salt, 500_000);
    state.record = await encryptKeychainRecord(
      { version: 1, wallets: [], settings: { ...DEFAULT_SETTINGS } },
      key, bufferToBase64(salt), 500_000,
    );
    manager = new WalletManager();
    await manager.unlockKeychain(password);
    payer = (await manager.createMnemonicWallet(MNEMONIC, password)).addresses[0]!.address;
  });

  it('are written into the encrypted keychain and survive lock and unlock', async () => {
    await manager.recordScriptRecipients(payer, [P2TR]);
    expect(manager.getKnownScriptRecipients(payer)).toEqual([P2TR]);
    expect(JSON.stringify(state.record)).not.toContain(P2TR);
    expect((await decryptKeychain(state.record!, key)).scriptPaymentRecipients).toEqual([`${payer} ${P2TR}`]);

    await manager.lockKeychain();
    expect(manager.getKnownScriptRecipients(payer)).toEqual([]);
    await manager.unlockKeychain(password);
    expect(manager.getKnownScriptRecipients(payer)).toEqual([P2TR]);
  });

  it('write nothing when every recipient is already known', async () => {
    await manager.recordScriptRecipients(payer, [P2TR]);
    vi.mocked(saveKeychainRecord).mockClear();
    await manager.recordScriptRecipients(payer, [P2TR]);
    await manager.recordScriptRecipients(payer, []);
    expect(saveKeychainRecord).not.toHaveBeenCalled();
    await manager.recordScriptRecipients(payer, [P2TR, P2SH]);
    expect(saveKeychainRecord).toHaveBeenCalledTimes(1);
    expect(manager.getKnownScriptRecipients(payer)).toEqual([P2TR, P2SH]);
  });

  it('are gone after a reset, so a new wallet repeats nothing it never acknowledged', async () => {
    await manager.recordScriptRecipients(payer, [P2TR]);
    await manager.resetKeychain(password);
    await manager.createMnemonicWallet(MNEMONIC, 'another-synthetic-password');
    expect(manager.getKnownScriptRecipients(payer)).toEqual([]);
  });

  it('survive a password change', async () => {
    await manager.recordScriptRecipients(payer, [P2TR]);
    await manager.updatePassword(password, 'another-synthetic-password');
    await manager.unlockKeychain('another-synthetic-password');
    expect(manager.getKnownScriptRecipients(payer)).toEqual([P2TR]);
  });

  it('are kept alongside other changes to the keychain', async () => {
    await manager.recordScriptRecipients(payer, [P2TR]);
    await manager.updateSettings({ fiat: 'eur' });
    await manager.addAddress(manager.getActiveWallet()!.id);
    expect((await decryptKeychain(state.record!, key)).scriptPaymentRecipients).toEqual([`${payer} ${P2TR}`]);
  });

  it('cannot be recorded while locked, or from malformed input', async () => {
    await expect(manager.recordScriptRecipients(payer, ['x', 7 as unknown as string])).rejects.toThrow('Invalid');
    await expect(manager.recordScriptRecipients(payer, Array.from({ length: 101 }, () => P2TR))).rejects.toThrow('Invalid');
    await manager.lockKeychain();
    await expect(manager.recordScriptRecipients(payer, [P2TR])).rejects.toThrow();
  });

  it('never make a keychain unreadable when the stored list is malformed', () => {
    const keychain = parseKeychain({
      version: 1, wallets: [], settings: { ...DEFAULT_SETTINGS }, scriptPaymentRecipients: [`${payer} ${P2TR}`, 7],
    });
    expect(keychain.scriptPaymentRecipients).toEqual([`${payer} ${P2TR}`]);
    expect(parseKeychain({ version: 1, wallets: [], settings: { ...DEFAULT_SETTINGS } }).scriptPaymentRecipients)
      .toBeUndefined();
  });
});
