/**
 * A site's permission is read from the vault every time it is asked.
 *
 * ConnectionService used to cache a positive answer for five minutes. Writers that change grants
 * without going through it — resetting the wallet, or a grant write made directly on the wallet
 * service — left that cache answering yes: a site connected before a reset kept receiving the NEW
 * wallet's address from xcp_accounts, and passed every "is this site connected" check, for up to
 * five minutes.
 *
 * Real vault (real encryption, real wallet manager); the wallet service is a thin adapter over it,
 * and the approval prompt is answered "approve".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bufferToBase64 } from '@/core/encryption/buffer';
import { deriveKey } from '@/core/encryption/encryption';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { encryptKeychainRecord } from '@/core/wallet/keychainCrypto';
import * as sessionManager from '@/platform/auth/sessionManager';
import type { SessionMetadata } from '@/platform/storage/sessionMetadataStorage';
import { WalletManager } from '@/platform/walletManager';
import type { KeychainRecord } from '@/types/wallet';

const state = vi.hoisted(() => ({
  record: null as KeychainRecord | null,
  cachedKey: null as string | null,
  manager: null as WalletManager | null,
}));
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
vi.mock('@/platform/fathom', () => ({ analytics: { track: vi.fn(async () => {}) } }));
vi.mock('@/services/eventEmitterService', () => ({ eventEmitterService: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } }));
vi.mock('@/services/approvalService', () => ({
  getApprovalService: () => ({
    requestApproval: vi.fn(async () => ({ approved: true })),
    registerCompletionHandler: vi.fn(),
  }),
}));
// The wallet service's reads and grant writers, over the real wallet manager.
vi.mock('@/services/walletService', () => ({
  getWalletService: () => {
    const manager = state.manager!;
    return {
      getSettings: async () => manager.getSettings(),
      isKeychainUnlocked: async () => manager.isKeychainUnlocked(),
      getActiveAddress: async () => {
        const wallet = manager.getActiveWallet();
        const last = manager.getSettings().lastActiveAddress;
        return wallet?.addresses.find(address => address.address === last) ?? wallet?.addresses[0];
      },
      getPairedAddresses: async () => manager.getPairedAddresses(),
      addConnectedWebsite: (origin: string, identity?: { walletId: string; address: string }) =>
        manager.addConnectedWebsite(origin, identity),
      removeConnectedWebsite: (origin: string) => manager.removeConnectedWebsite(origin),
      clearConnectedWebsites: () => manager.clearConnectedWebsites(),
      setPairedAddressPermission: (origin: string, identity: { walletId: string; address: string } | null) =>
        manager.setPairedAddressPermission(origin, identity),
    };
  },
}));

import { ConnectionService } from '../connectionService';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const OTHER_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const ORIGIN = 'https://site.example';

describe('connection permission after grants change elsewhere', () => {
  const password = 'synthetic-vault-password';
  let manager: WalletManager;
  let service: ConnectionService;
  let metadata: SessionMetadata | undefined;

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
    const key = await deriveKey(password, salt, 500_000);
    state.record = await encryptKeychainRecord(
      { version: 1, wallets: [], settings: { ...DEFAULT_SETTINGS } },
      key, bufferToBase64(salt), 500_000,
    );
    manager = new WalletManager();
    state.manager = manager;
    await manager.unlockKeychain(password);
    await manager.createMnemonicWallet(MNEMONIC, password);
    service = new ConnectionService();
  });

  const connectSite = async () => {
    const wallet = manager.getActiveWallet()!;
    const accounts = await service.connect(ORIGIN, wallet.addresses[0]!.address, wallet.id);
    expect(accounts).toEqual([wallet.addresses[0]!.address]);
    expect(await service.hasPermission(ORIGIN)).toBe(true);
  };

  it('gives a site nothing from a new wallet created after a reset', async () => {
    await connectSite();

    await manager.resetKeychain(password);
    await manager.createMnemonicWallet(OTHER_MNEMONIC, 'another-synthetic-password');
    const newAddress = manager.getActiveWallet()!.addresses[0]!.address;
    expect(manager.getSettings().connectedWebsites).toEqual([]);

    expect(await service.hasPermission(ORIGIN)).toBe(false);
    expect(await service.isConnected(ORIGIN)).toBe(false);
    expect(await service.getAccounts(ORIGIN)).not.toContain(newAddress);
    expect(await service.getAccounts(ORIGIN)).toEqual([]);
  });

  it('stops answering yes as soon as the grant is removed without it', async () => {
    await connectSite();
    await manager.removeConnectedWebsite(ORIGIN);
    expect(await service.hasPermission(ORIGIN)).toBe(false);
  });

  it('still answers yes for a site that remains connected', async () => {
    await connectSite();
    await manager.updateSettings({ fiat: 'eur' });
    expect(await service.hasPermission(ORIGIN)).toBe(true);
    expect(await service.getAccounts(ORIGIN)).toEqual([manager.getActiveWallet()!.addresses[0]!.address]);
  });
});
