import { beforeEach, describe, expect, it, vi } from 'vitest';
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
