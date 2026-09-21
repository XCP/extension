import { beforeEach, describe, expect, it, vi } from 'vitest';
import { base64ToBuffer, bufferToBase64 } from '@/core/encryption/buffer';
import { deriveKey } from '@/core/encryption/encryption';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { decryptKeychain, encryptKeychainRecord } from '@/core/wallet/keychainCrypto';
import * as sessionManager from '@/platform/auth/sessionManager';
import type { SessionMetadata } from '@/platform/storage/sessionMetadataStorage';
import type { KeychainRecord } from '@/types/wallet';
import { WalletManager } from '../walletManager';

interface ReadBarrier {
  entered: Promise<void>;
  enter: () => void;
  released: Promise<void>;
  release: () => void;
}
function barrier(): ReadBarrier {
  let enter = () => {};
  let release = () => {};
  return {
    entered: new Promise<void>(resolve => { enter = resolve; }),
    released: new Promise<void>(resolve => { release = resolve; }),
    enter: () => enter(),
    release: () => release(),
  };
}

const state = vi.hoisted(() => ({
  record: null as KeychainRecord | null,
  cachedKey: null as string | null,
  readBarrier: null as ReadBarrier | null,
}));
vi.mock('@/platform/storage/walletStorage', () => ({
  getKeychainRecord: vi.fn(async () => {
    const pending = state.readBarrier;
    state.readBarrier = null;
    if (pending) { pending.enter(); await pending.released; }
    return structuredClone(state.record);
  }),
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

// Real encryption and production wallet/session methods. Only browser storage is replaced; barriers
// control when a storage read completes to exercise service-worker interleavings deterministically.
describe('vault mutation lifecycle', () => {
  const password = 'synthetic-vault-password';
  let manager: WalletManager;
  let metadata: SessionMetadata | undefined;
  let originalKey: CryptoKey;

  beforeEach(async () => {
    state.readBarrier = null;
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
    await sessionManager.clearAllUnlockedSecrets();
    const salt = new Uint8Array(16).fill(7);
    originalKey = await deriveKey(password, salt, 500_000);
    state.record = await encryptKeychainRecord(
      { version: 1, wallets: [], settings: { ...DEFAULT_SETTINGS } },
      originalKey, bufferToBase64(salt), 500_000,
    );
    manager = new WalletManager();
    await manager.unlockKeychain(password);
  });

  it('rejects a pending settings write after lock and preserves the encrypted vault', async () => {
    const originalRecord = structuredClone(state.record);
    const pending = barrier();
    state.readBarrier = pending;
    const mutation = manager.updateSettings({ fiat: 'eur' });
    const rejected = expect(mutation).rejects.toThrow('Wallet session changed');
    await pending.entered;
    await manager.lockKeychain();
    expect(await manager.isKeychainUnlocked()).toBe(false);
    pending.release();
    await rejected;
    expect(state.record).toEqual(originalRecord);
    expect((await decryptKeychain(state.record!, originalKey)).settings.fiat).toBe('usd');
  });

  it('serializes password rotation after prior mutations and preserves their settings', async () => {
    const pending = barrier();
    state.readBarrier = pending;
    const mutation = manager.updateSettings({ fiat: 'eur' });
    await pending.entered;
    const rotation = manager.updatePassword(password, 'synthetic-new-password');
    pending.release();
    await Promise.all([mutation, rotation]);
    const record = state.record!;
    const newKey = await deriveKey('synthetic-new-password', base64ToBuffer(record.salt), record.kdf.iterations);
    expect((await decryptKeychain(record, newKey)).settings.fiat).toBe('eur');
    await expect(decryptKeychain(record, originalKey)).rejects.toThrow();
    expect(await manager.isKeychainUnlocked()).toBe(false);
  });

  it('applies an auto-lock setting to the persisted session as well as the vault', async () => {
    const unlockedAt = metadata!.unlockedAt;
    await manager.updateSettings({ autoLockTimer: '1m' });
    await manager.setLastActiveTime();
    await sessionManager.rearmSessionExpiry();
    expect(metadata?.timeout).toBe(60_000);
    expect(metadata?.unlockedAt).toBe(unlockedAt);
    expect(chrome.alarms.create).toHaveBeenLastCalledWith('session-expiry', {
      when: metadata!.lastActiveTime + 60_000,
    });
    expect((await decryptKeychain(state.record!, originalKey)).settings.autoLockTimer).toBe('1m');
  });

  it('rejects queued work from the locked session but permits an explicitly new unlock', async () => {
    const originalRecord = structuredClone(state.record);
    const pending = barrier();
    state.readBarrier = pending;
    const first = manager.updateSettings({ fiat: 'eur' });
    const firstRejected = expect(first).rejects.toThrow('Wallet session changed');
    await pending.entered;
    const queued = manager.updateSettings({ priceUnit: 'sats' });
    const queuedRejected = expect(queued).rejects.toThrow('Wallet session changed');
    await manager.lockKeychain();
    pending.release();
    await Promise.all([firstRejected, queuedRejected]);
    expect(state.record).toEqual(originalRecord);
    await manager.unlockKeychain(password);
    expect(await manager.isKeychainUnlocked()).toBe(true);
    expect(manager.getSettings().priceUnit).toBe('btc');
  });

  it('does not republish a session when an in-flight unlock finishes after locking', async () => {
    await manager.lockKeychain();
    const pending = barrier();
    state.readBarrier = pending;
    const unlocking = manager.unlockKeychain(password);
    const rejected = expect(unlocking).rejects.toThrow('Wallet session changed');
    await pending.entered;
    await manager.lockKeychain();
    pending.release();
    await rejected;
    expect(state.cachedKey).toBeNull();
    expect(metadata).toBeUndefined();
    expect(await manager.isKeychainUnlocked()).toBe(false);
  });

  it('preserves simultaneous website grants and their capabilities in one encrypted vault', async () => {
    const firstIdentity = { walletId: 'wallet-first', address: 'address-first' };
    const secondIdentity = { walletId: 'wallet-second', address: 'address-second' };
    const pending = barrier();
    state.readBarrier = pending;
    const first = manager.addConnectedWebsite('https://first.example', firstIdentity);
    await pending.entered;
    const second = manager.addConnectedWebsite('https://second.example', secondIdentity);
    pending.release();
    await Promise.all([first, second]);

    const { settings } = await decryptKeychain(state.record!, originalKey);
    expect(settings.connectedWebsites).toEqual(['https://first.example', 'https://second.example']);
    expect(settings.providerCapabilities).toEqual({
      'https://first.example': { pairedAddresses: true, ...firstIdentity },
      'https://second.example': { pairedAddresses: true, ...secondIdentity },
    });
  });

  it('rejects a capability grant queued behind website revocation', async () => {
    const origin = 'https://first.example';
    const identity = { walletId: 'wallet-first', address: 'address-first' };
    await manager.addConnectedWebsite(origin, identity);
    const pending = barrier();
    state.readBarrier = pending;
    const revocation = manager.removeConnectedWebsite(origin);
    await pending.entered;
    const elevation = manager.setPairedAddressPermission(origin, identity);
    const rejected = expect(elevation).rejects.toThrow('Site disconnected');
    pending.release();
    await Promise.all([revocation, rejected]);

    const { settings } = await decryptKeychain(state.record!, originalKey);
    expect(settings.connectedWebsites).toEqual([]);
    expect(settings.providerCapabilities).toEqual({});
  });
});
