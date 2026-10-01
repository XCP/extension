/**
 * Locked coins live in the encrypted keychain: what the Coin Control page and an offer signature write is
 * on disk, survives a lock and unlock, reads empty while locked, and a malformed record on disk
 * costs the lock, never the unlock. Real encryption and session manager; only storage is replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bufferToBase64 } from '@/core/encryption/buffer';
import { deriveKey } from '@/core/encryption/encryption';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { decryptKeychain, encryptKeychainRecord } from '@/core/wallet/keychainCrypto';
import * as sessionManager from '@/platform/auth/sessionManager';
import type { SessionMetadata } from '@/platform/storage/sessionMetadataStorage';
import type { KeychainRecord } from '@/types/wallet';
import { WalletManager } from '../walletManager';

const state = vi.hoisted(() => ({ record: null as KeychainRecord | null, cachedKey: null as string | null }));
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

const ADDRESS = 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt';
const COIN = `${'a'.repeat(64)}:0`;
const SLOT = `${'b'.repeat(64)}:1`;

describe('locked coins in the wallet manager', () => {
  const password = 'synthetic-vault-password';
  let manager: WalletManager;
  let key: CryptoKey;
  let metadata: SessionMetadata | undefined;

  const seed = async (extra: Record<string, unknown> = {}) => {
    const salt = new Uint8Array(16).fill(7);
    key = await deriveKey(password, salt, 500_000);
    state.record = await encryptKeychainRecord(
      { version: 1, wallets: [], settings: { ...DEFAULT_SETTINGS }, ...extra },
      key, bufferToBase64(salt), 500_000,
    );
  };

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
    await seed();
    manager = new WalletManager();
    await manager.unlockKeychain(password);
  });

  it('keeps a hand lock and an offer lock across a lock and unlock, and forgets a hand lock on unlock', async () => {
    await manager.updateCoinLocks(ADDRESS, { lock: [{ outpoint: COIN, valueSats: 5_000 }] });
    await manager.addOfferCoinLocks(ADDRESS, [{
      outpoint: SLOT, kind: 'offer_slot', refs: ['auth-1'], valueSats: 20_000, origin: 'https://market.example', expiresAt: null,
    }]);
    expect((await decryptKeychain(state.record!, key)).coinLocks?.map(lock => lock.outpoint)).toEqual([COIN, SLOT]);

    await manager.lockKeychain();
    expect(manager.getCoinLocks(ADDRESS)).toEqual([]);
    await expect(manager.updateCoinLocks(ADDRESS, { unlock: [COIN] })).resolves.toBeUndefined();

    await manager.unlockKeychain(password);
    expect(manager.getCoinLocks(ADDRESS).map(lock => [lock.outpoint, lock.kind])).toEqual([[COIN, 'manual'], [SLOT, 'offer_slot']]);

    await manager.updateCoinLocks(ADDRESS, { unlock: [COIN, SLOT] });
    expect(manager.getCoinLocks(ADDRESS).map(lock => [lock.outpoint, lock.unlocked])).toEqual([[SLOT, true]]);
  });

  it('refuses a malformed update before it reaches the keychain', async () => {
    await expect(manager.updateCoinLocks(ADDRESS, { lock: [{ outpoint: 'nope', valueSats: 1 }] })).rejects.toThrow();
    await expect(manager.addOfferCoinLocks(ADDRESS, [{ outpoint: SLOT, kind: 'manual' }])).rejects.toThrow();
    await expect(manager.updateCoinLocks('', {})).rejects.toThrow();
    expect((await decryptKeychain(state.record!, key)).coinLocks).toBeUndefined();
  });

  it('persists cancellation reference updates and release without touching hand locks', async () => {
    const origin = 'https://market.example';
    await manager.updateCoinLocks(ADDRESS, { lock: [{ outpoint: COIN, valueSats: 5_000 }] });
    await manager.addOfferCoinLocks(ADDRESS, [{ outpoint: SLOT, kind: 'offer_slot', refs: ['offer-1', 'offer-2'],
      valueSats: 20_000, origin, expiresAt: null }]);
    const intent = { standard: 'counterparty-marketplace', action: 'cancel_offers', offerIds: ['offer-1'],
      coins: [{ outpoint: { txid: 'b'.repeat(64), vout: 1 }, stillCommitted: true }] };
    await manager.cancelOfferCoinLocks(ADDRESS, origin, intent);
    expect((await decryptKeychain(state.record!, key)).coinLocks?.find(lock => lock.outpoint === SLOT)?.refs).toEqual(['offer-2']);
    await manager.cancelOfferCoinLocks(ADDRESS, origin, { ...intent, coins: [
      { ...intent.coins[0], stillCommitted: false },
      { outpoint: { txid: 'a'.repeat(64), vout: 0 }, stillCommitted: false },
    ] });
    expect((await decryptKeychain(state.record!, key)).coinLocks?.map(lock => lock.outpoint)).toEqual([COIN]);
    await manager.lockKeychain();
    await manager.unlockKeychain(password);
    expect(manager.getCoinLocks(ADDRESS).map(lock => lock.outpoint)).toEqual([COIN]);
  });

  it('unlocks a keychain whose lock record is malformed, keeping the well-formed locks', async () => {
    await manager.lockKeychain();
    const good = {
      outpoint: COIN, address: ADDRESS, kind: 'manual', manual: true, refs: [], valueSats: 1,
      origin: null, expiresAt: null, createdAt: 1, seenAt: 1, unlocked: false,
    };
    await seed({ coinLocks: [good, { ...good, outpoint: 'broken' }, 42] });
    manager = new WalletManager();
    await manager.unlockKeychain(password);
    expect(manager.getCoinLocks(ADDRESS)).toEqual([good]);
  });
});
