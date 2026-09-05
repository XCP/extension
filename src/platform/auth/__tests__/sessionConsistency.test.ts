import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionMetadata } from '@/platform/storage/sessionMetadataStorage';
import {
  clearAllUnlockedSecrets,
  expireSessionIfNeeded,
  getKeychainMasterKey,
  getSessionGeneration,
  getUnlockedSecret,
  initializeSession,
  isSessionExpired,
  MAX_SESSION_DURATION_MS,
  rearmSessionExpiry,
  setLastActiveTime,
  storeKeychainMasterKey,
  storeUnlockedSecret,
  updateSessionTimeout,
} from '../sessionManager';

const keys = vi.hoisted(() => ({ cached: null as string | null }));
vi.mock('@/platform/storage/keyStorage', () => ({
  getCachedKeychainMasterKey: vi.fn(async () => keys.cached),
  setCachedKeychainMasterKey: vi.fn(async (key: string) => { keys.cached = key; }),
  clearCachedKeychainMasterKey: vi.fn(async () => { keys.cached = null; }),
}));

function barrier() {
  let enter = () => {};
  let release = () => {};
  return {
    entered: new Promise<void>(resolve => { enter = resolve; }),
    released: new Promise<void>(resolve => { release = resolve; }),
    enter: () => enter(), release: () => release(),
  };
}

describe('session deadline and mutation consistency', () => {
  const initialTime = 2_000_000_000_000;
  let now: number;
  let metadata: SessionMetadata | undefined;
  let nextRead: ReturnType<typeof barrier> | null;
  let createAlarm: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    now = initialTime;
    metadata = undefined;
    nextRead = null;
    createAlarm = vi.fn(async () => {});
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    globalThis.chrome = {
      ...globalThis.chrome,
      alarms: { create: createAlarm, clear: vi.fn(async () => true) },
      storage: { session: {
        get: vi.fn(async () => {
          const snapshot = metadata ? { ...metadata } : undefined;
          const pending = nextRead;
          nextRead = null;
          if (pending) { pending.enter(); await pending.released; }
          return { sessionMetadata: snapshot };
        }),
        set: vi.fn(async (data: { sessionMetadata: SessionMetadata }) => { metadata = { ...data.sessionMetadata }; }),
        remove: vi.fn(async () => { metadata = undefined; }),
      } },
    } as unknown as typeof chrome;
    await clearAllUnlockedSecrets();
    await initializeSession(30 * 60_000);
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    await storeKeychainMasterKey(key);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('retains a shortened timeout after activity and service-worker recovery', async () => {
    await updateSessionTimeout(60_000);
    await setLastActiveTime();
    expect(metadata?.timeout).toBe(60_000);
    expect(metadata?.unlockedAt).toBe(initialTime);
    expect(createAlarm).toHaveBeenLastCalledWith('session-expiry', { when: initialTime + 60_000 });
    await rearmSessionExpiry();
    expect(createAlarm).toHaveBeenLastCalledWith('session-expiry', { when: initialTime + 60_000 });
    now += 60_000;
    expect(await isSessionExpired()).toBe(true);
  });

  it('caps activity and timeout-change alarms at the original absolute deadline', async () => {
    now = initialTime + MAX_SESSION_DURATION_MS - 10_000;
    metadata = { unlockedAt: initialTime, lastActiveTime: now - 1000, timeout: 30 * 60_000 };
    await setLastActiveTime();
    expect(createAlarm).toHaveBeenLastCalledWith('session-expiry', { when: initialTime + MAX_SESSION_DURATION_MS });
    await updateSessionTimeout(60_000);
    expect(metadata?.unlockedAt).toBe(initialTime);
    expect(createAlarm).toHaveBeenLastCalledWith('session-expiry', { when: initialTime + MAX_SESSION_DURATION_MS });
    now += 10_000;
    expect(await isSessionExpired()).toBe(true);
  });

  it('cannot resurrect metadata or a cached key when an activity read completes after lock', async () => {
    const pending = barrier();
    nextRead = pending;
    const activity = setLastActiveTime();
    await pending.entered;
    const generation = getSessionGeneration();
    const locking = clearAllUnlockedSecrets();
    expect(getSessionGeneration()).toBeGreaterThan(generation);
    expect(await getKeychainMasterKey()).toBeNull();
    pending.release();
    await Promise.all([activity, locking]);
    expect(metadata).toBeUndefined();
    expect(keys.cached).toBeNull();
    expect(createAlarm).not.toHaveBeenCalled();
  });

  it('does not let an old expiry check lock a newly initialized session', async () => {
    const walletId = 'a'.repeat(64);
    storeUnlockedSecret(walletId, 'synthetic-secret');
    const pending = barrier();
    nextRead = pending;
    const oldRead = getUnlockedSecret(walletId);
    await pending.entered;
    now += 1000;
    await initializeSession(60_000);
    pending.release();
    expect(await oldRead).toBeNull();
    expect(metadata?.unlockedAt).toBe(now);
    expect(await isSessionExpired()).toBe(false);
    expect(keys.cached).not.toBeNull();
  });

  it('ignores premature alarms and performs full cleanup at the persisted deadline', async () => {
    expect(await expireSessionIfNeeded()).toBe(false);
    expect(keys.cached).not.toBeNull();
    now += 30 * 60_000;
    expect(await expireSessionIfNeeded()).toBe(true);
    expect(keys.cached).toBeNull();
    expect(metadata).toBeUndefined();
  });
});
