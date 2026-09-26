/**
 * A master key left in session storage without its session metadata is removed, not just ignored.
 *
 * Locking removes the metadata first and the key second, so a failed or interrupted lock can leave
 * the key behind. Every read treated that as locked (no metadata, so expired) but the expiry check
 * found no metadata to expire and did nothing, so the key stayed in session storage until a worker
 * restart noticed it — and the pages watching for its removal never saw the lock.
 */
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { SessionMetadata } from '@/platform/storage/sessionMetadataStorage';
import {
  clearAllUnlockedSecrets,
  expireSessionIfNeeded,
  getKeychainMasterKey,
  getUnlockedSecret,
  initializeSession,
  registerSessionExpiredHandler,
  storeKeychainMasterKey,
  storeUnlockedSecret,
} from '../sessionManager';

const keys = vi.hoisted(() => ({ cached: null as string | null }));
vi.mock('@/platform/storage/keyStorage', () => ({
  getCachedKeychainMasterKey: vi.fn(async () => keys.cached),
  setCachedKeychainMasterKey: vi.fn(async (key: string) => { keys.cached = key; }),
  clearCachedKeychainMasterKey: vi.fn(async () => { keys.cached = null; }),
}));

const WALLET = 'a1b2c3d4e5f678901234567890123456789012345678901234567890123456ef';

describe('a master key without session metadata', () => {
  let metadata: SessionMetadata | undefined;
  let lock: Mock<() => Promise<void>>;

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
    // The wallet service registers a full lock; this stands in for it.
    lock = vi.fn<() => Promise<void>>(() => clearAllUnlockedSecrets());
    registerSessionExpiredHandler(null);
    await clearAllUnlockedSecrets();
    registerSessionExpiredHandler(lock);
    await initializeSession(30 * 60_000);
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    await storeKeychainMasterKey(key);
    storeUnlockedSecret(WALLET, 'secret');
  });
  afterEach(() => { registerSessionExpiredHandler(null); });

  it('is removed, with a full lock, by the next read of the key', async () => {
    metadata = undefined; // what an interrupted lock leaves behind
    expect(await getKeychainMasterKey()).toBeNull();
    expect(lock).toHaveBeenCalledTimes(1);
    expect(keys.cached).toBeNull();
  });

  it('is removed by the next read of a wallet secret', async () => {
    metadata = undefined;
    expect(await getUnlockedSecret(WALLET)).toBeNull();
    expect(keys.cached).toBeNull();
  });

  it('is removed by the expiry alarm', async () => {
    metadata = undefined;
    expect(await expireSessionIfNeeded()).toBe(true);
    expect(keys.cached).toBeNull();
  });

  it('leaves a first run, with neither metadata nor a key, alone', async () => {
    registerSessionExpiredHandler(null);
    await clearAllUnlockedSecrets();
    registerSessionExpiredHandler(lock);
    await initializeSession(30 * 60_000);
    metadata = undefined;
    expect(keys.cached).toBeNull();

    expect(await getKeychainMasterKey()).toBeNull();
    expect(await expireSessionIfNeeded()).toBe(false);
    expect(lock).not.toHaveBeenCalled();
  });

  it('does not touch a key whose session is valid', async () => {
    expect(await getKeychainMasterKey()).not.toBeNull();
    expect(await expireSessionIfNeeded()).toBe(false);
    expect(lock).not.toHaveBeenCalled();
    expect(keys.cached).not.toBeNull();
  });
});
