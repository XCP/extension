import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ensureKeychainLoaded` is what makes a woken worker answer about the session rather than about
 * itself. Two properties matter more than the loading: it must not load before session recovery has
 * ruled, and it must not wait on that ruling forever — a provider request and the popup's own
 * settings read both go through here, so a hang is worse than a refusal.
 */
describe('ensureKeychainLoaded', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
  });

  it('declines to load, rather than hanging, when recovery never reports', async () => {
    vi.useFakeTimers();
    const { walletManager } = await import('@/platform/walletManager');

    const settled = vi.fn();
    const loading = walletManager.ensureKeychainLoaded().then(settled);

    // Nothing has marked recovery: the caller must not be stuck behind it indefinitely.
    await vi.advanceTimersByTimeAsync(6_000);
    await loading;

    expect(settled).toHaveBeenCalled();
  });

  it('does not load when recovery says the session is gone', async () => {
    const { markSessionRecovery } = await import('@/platform/auth/sessionReady');
    const { SessionRecoveryState } = await import('@/platform/auth/sessionManager');
    const sessionManager = await import('@/platform/auth/sessionManager');
    const getKey = vi.spyOn(sessionManager, 'getKeychainMasterKey');

    markSessionRecovery(SessionRecoveryState.LOCKED);
    const { walletManager } = await import('@/platform/walletManager');
    await walletManager.ensureKeychainLoaded();

    // An expired session still has a usable key until the lock clears it, so the key must not even
    // be reached for.
    expect(getKey).not.toHaveBeenCalled();
  });
});
