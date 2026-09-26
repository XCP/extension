/**
 * Revoking a site's access fails closed.
 *
 * A change that grants something (a wallet, an address, a connection) is published only once it is
 * saved. A change that only removes access is the other way round: the revocation takes effect in
 * memory before the write, so permission and delivery checks refuse while it is being written, and
 * it stays in memory if the write fails (memory more restrictive than disk is safe; the next
 * successful write saves it).
 *
 * Real encryption, the real wallet manager singleton (which the delivery guard reads), and a real
 * ConnectionService; only browser storage is replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bufferToBase64 } from '@/core/encryption/buffer';
import { deriveKey } from '@/core/encryption/encryption';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { decryptKeychain, encryptKeychainRecord } from '@/core/wallet/keychainCrypto';
import * as sessionManager from '@/platform/auth/sessionManager';
import { assertSignDeliveryAuthorized } from '@/platform/provider/signDelivery';
import type { SessionMetadata } from '@/platform/storage/sessionMetadataStorage';
import { walletManager } from '@/platform/walletManager';
import type { KeychainRecord } from '@/types/wallet';

const state = vi.hoisted(() => ({
  record: null as KeychainRecord | null,
  cachedKey: null as string | null,
  failNextSave: false,
  failNextDelete: false,
  saveBarrier: null as null | { enter: () => void; released: Promise<void> },
}));
vi.mock('@/platform/storage/walletStorage', () => ({
  getKeychainRecord: vi.fn(async () => structuredClone(state.record)),
  saveKeychainRecord: vi.fn(async (record: KeychainRecord) => {
    const pending = state.saveBarrier;
    state.saveBarrier = null;
    if (pending) { pending.enter(); await pending.released; }
    if (state.failNextSave) {
      state.failNextSave = false;
      throw new Error('Failed to save keychain');
    }
    state.record = structuredClone(record);
  }),
  assertNoKeychainRecord: vi.fn(async () => {
    if (state.record) throw new Error('A keychain already exists');
  }),
  deleteKeychain: vi.fn(async () => {
    if (state.failNextDelete) {
      state.failNextDelete = false;
      throw new Error('Failed to delete keychain');
    }
    state.record = null;
  }),
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
vi.mock('@/platform/fathom', () => ({ analytics: { track: vi.fn(async () => {}) } }));
vi.mock('@/services/eventEmitterService', () => ({ eventEmitterService: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } }));
vi.mock('@/services/approvalService', () => ({
  getApprovalService: () => ({ requestApproval: vi.fn(async () => ({ approved: true })), registerCompletionHandler: vi.fn() }),
}));
// The wallet service over the real manager, as the background wires it.
vi.mock('@/services/walletService', async () => {
  const { walletManager: manager } = await import('@/platform/walletManager');
  const service = {
    getSettings: async () => manager.getSettings(),
    isKeychainUnlocked: async () => manager.isKeychainUnlocked(),
    getActiveWallet: async () => manager.getActiveWallet(),
    getActiveAddress: async () => {
      const wallet = manager.getActiveWallet();
      const last = manager.getSettings().lastActiveAddress;
      return wallet?.addresses.find(address => address.address === last) ?? wallet?.addresses[0];
    },
    getPairedAddresses: async () => manager.getPairedAddresses(),
    addConnectedWebsite: (origin: string, identity?: { walletId: string; address: string }) => manager.addConnectedWebsite(origin, identity),
    removeConnectedWebsite: (origin: string) => manager.removeConnectedWebsite(origin),
    clearConnectedWebsites: () => manager.clearConnectedWebsites(),
    setPairedAddressPermission: (origin: string, identity: { walletId: string; address: string } | null) =>
      manager.setPairedAddressPermission(origin, identity),
  };
  return { getWalletService: () => service };
});
vi.mock('@/services/connectionService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/connectionService')>();
  const instance = new actual.ConnectionService();
  return { ...actual, getConnectionService: () => instance };
});

import { getConnectionService } from '@/services/connectionService';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ORIGIN = 'https://site.example';
const OTHER_ORIGIN = 'https://other.example';

function barrier() {
  let enter = () => {};
  let release = () => {};
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  state.saveBarrier = { enter: () => enter(), released };
  return { entered, release: () => release() };
}

describe('revoking access fails closed', () => {
  const password = 'synthetic-vault-password';
  let metadata: SessionMetadata | undefined;
  let key: CryptoKey;
  let identity: { walletId: string; address: string };

  const onDisk = async () => (await decryptKeychain(state.record!, key)).settings;
  const permission = () => getConnectionService().hasPermission(ORIGIN);
  /** The synchronous guard a signing flow holds, obtained while the site was connected. */
  const deliveryGuard = async (paired = false) => assertSignDeliveryAuthorized({
    id: 'request', origin: ORIGIN, timestamp: Date.now(), ...identity,
  } as never, paired, sessionManager.getSessionGeneration(), false);

  beforeEach(async () => {
    state.failNextSave = false;
    state.failNextDelete = false;
    state.saveBarrier = null;
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
    await walletManager.lockKeychain();
    await sessionManager.clearAllUnlockedSecrets();
    const salt = new Uint8Array(16).fill(7);
    key = await deriveKey(password, salt, 500_000);
    state.record = await encryptKeychainRecord(
      { version: 1, wallets: [], settings: { ...DEFAULT_SETTINGS } },
      key, bufferToBase64(salt), 500_000,
    );
    await walletManager.unlockKeychain(password);
    const wallet = await walletManager.createMnemonicWallet(MNEMONIC, password);
    identity = { walletId: wallet.id, address: wallet.addresses[0]!.address };
    await walletManager.addConnectedWebsite(ORIGIN, identity);
    await walletManager.addConnectedWebsite(OTHER_ORIGIN);
    expect(await permission()).toBe(true);
  });

  it('refuses permission and delivery while a disconnect is being written', async () => {
    const guard = await deliveryGuard(true);
    const pending = barrier();
    const revoking = walletManager.removeConnectedWebsite(ORIGIN);
    await pending.entered;

    expect(walletManager.getSettings().connectedWebsites).not.toContain(ORIGIN);
    expect(() => guard()).toThrow('no longer connected');
    await expect(deliveryGuard()).rejects.toThrow('no longer connected');
    // Still on disk until the write lands; memory is the stricter of the two.
    expect((await onDisk()).connectedWebsites).toContain(ORIGIN);

    pending.release();
    await revoking;
    expect(await permission()).toBe(false);
    expect((await onDisk()).connectedWebsites).toEqual([OTHER_ORIGIN]);
    expect((await onDisk()).providerCapabilities).toEqual({});
  });

  it('refuses paired delivery while a paired-grant revocation is being written', async () => {
    const guard = await deliveryGuard(true);
    const pending = barrier();
    const revoking = walletManager.setPairedAddressPermission(ORIGIN, null);
    await pending.entered;
    expect(() => guard()).toThrow('Paired address access was revoked');
    expect(await getConnectionService().hasPairedAddressPermission(ORIGIN, identity.walletId, identity.address)).toBe(false);
    pending.release();
    await revoking;
    expect((await onDisk()).providerCapabilities).toEqual({});
  });

  it('refuses every site while disconnect-all is being written', async () => {
    const pending = barrier();
    const revoking = walletManager.clearConnectedWebsites();
    await pending.entered;
    expect(await permission()).toBe(false);
    expect(await getConnectionService().hasPermission(OTHER_ORIGIN)).toBe(false);
    pending.release();
    await revoking;
    expect((await onDisk()).connectedWebsites).toEqual([]);
  });

  it('keeps a revocation whose write failed, reports the failure, and saves it with the next write', async () => {
    const guard = await deliveryGuard();
    state.failNextSave = true;
    await expect(walletManager.removeConnectedWebsite(ORIGIN)).rejects.toThrow('Failed to save keychain');

    expect(await permission()).toBe(false);
    expect(() => guard()).toThrow('no longer connected');
    expect((await onDisk()).connectedWebsites).toContain(ORIGIN);

    await walletManager.updateSettings({ fiat: 'eur' });
    expect((await onDisk()).connectedWebsites).toEqual([OTHER_ORIGIN]);
    expect((await onDisk()).providerCapabilities).toEqual({});
  });

  it('withdraws a paired grant that a new connection replaces before the write, but adds nothing until saved', async () => {
    const guard = await deliveryGuard(true);
    state.failNextSave = true;
    await expect(walletManager.addConnectedWebsite(ORIGIN)).rejects.toThrow('Failed to save keychain');
    expect(() => guard()).toThrow('Paired address access was revoked');
    expect(walletManager.getSettings().providerCapabilities).toEqual({});
    expect(walletManager.getSettings().connectedWebsites).toContain(ORIGIN);
  });

  it('revokes every grant at once when the wallet is reset, even if the delete fails', async () => {
    const guard = await deliveryGuard();
    state.failNextDelete = true;
    await expect(walletManager.resetKeychain(password)).rejects.toThrow('Failed to delete keychain');
    expect(() => guard()).toThrow('no longer connected');
    expect(await permission()).toBe(false);
  });

  it('still grants only once saved', async () => {
    const pending = barrier();
    const granting = walletManager.addConnectedWebsite('https://new.example');
    await pending.entered;
    expect(await getConnectionService().hasPermission('https://new.example')).toBe(false);
    pending.release();
    await granting;
    expect(await getConnectionService().hasPermission('https://new.example')).toBe(true);

    state.failNextSave = true;
    await expect(walletManager.addConnectedWebsite('https://failed.example')).rejects.toThrow('Failed to save keychain');
    expect(await getConnectionService().hasPermission('https://failed.example')).toBe(false);
    await walletManager.updateSettings({ fiat: 'eur' });
    expect((await onDisk()).connectedWebsites).not.toContain('https://failed.example');
  });
});
