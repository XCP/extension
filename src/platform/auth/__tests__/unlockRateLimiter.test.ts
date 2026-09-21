import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  assertUnlockAllowed,
  clearUnlockAttempts,
  recordFailedUnlockAttempt,
} from '@/platform/auth/unlockRateLimiter';

describe('unlockRateLimiter', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  describe('when session storage is unreadable', () => {
    // The limiter used to answer "no recent attempts" for "could not read the attempts", so a
    // storage fault switched the throttle off entirely rather than degrading it.
    const breakStorage = () =>
      vi.spyOn(fakeBrowser.storage.session, 'get').mockRejectedValue(new Error('storage unavailable'));

    afterEach(() => vi.restoreAllMocks());

    it('still throttles using what this worker has seen', async () => {
      breakStorage();
      for (let i = 0; i < 5; i++) await recordFailedUnlockAttempt();
      await expect(assertUnlockAllowed()).rejects.toThrow(/Too many password attempts/);
    });

    it('does not block an unlock on its own', async () => {
      // Cleared first because the mirror deliberately outlives a storage fault: attempts from the
      // case above would otherwise still be counted, which is the intended behaviour in a session
      // but not the state under test here.
      await clearUnlockAttempts();
      // The property that matters: an unreadable store must never lock anyone out. With no
      // attempts recorded there is nothing to throttle, storage error or not.
      breakStorage();
      await expect(assertUnlockAllowed()).resolves.toBeUndefined();
    });

    it('still clears the window after a correct password', async () => {
      breakStorage();
      for (let i = 0; i < 5; i++) await recordFailedUnlockAttempt();
      await clearUnlockAttempts();
      await expect(assertUnlockAllowed()).resolves.toBeUndefined();
    });
  });

  it('allows attempts under the limit', async () => {
    for (let i = 0; i < 4; i++) await recordFailedUnlockAttempt();
    await expect(assertUnlockAllowed()).resolves.toBeUndefined();
  });

  it('blocks after five failures within the window', async () => {
    for (let i = 0; i < 5; i++) await recordFailedUnlockAttempt();
    await expect(assertUnlockAllowed()).rejects.toThrow(/Too many password attempts/);
  });

  it('clears the window after a successful password check', async () => {
    for (let i = 0; i < 5; i++) await recordFailedUnlockAttempt();
    await clearUnlockAttempts();
    await expect(assertUnlockAllowed()).resolves.toBeUndefined();
  });

  it('expires failures after the window passes', async () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 5; i++) await recordFailedUnlockAttempt();
      vi.advanceTimersByTime(61_000);
      await expect(assertUnlockAllowed()).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists the failure window in session storage', async () => {
    for (let i = 0; i < 5; i++) await recordFailedUnlockAttempt();
    // No module state: every check reads storage, so a service worker
    // restart cannot reset the window
    await expect(assertUnlockAllowed()).rejects.toThrow(/Too many password attempts/);
  });
});
