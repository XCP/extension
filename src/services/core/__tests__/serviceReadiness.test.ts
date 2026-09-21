import { describe, expect, it, vi } from 'vitest';

/**
 * The barrier holds every proxied call until initialisation finishes, so a waking worker cannot
 * answer from a keychain it has not loaded or a session it has not checked. Two properties carry
 * that: a caller arriving first waits, and a caller never waits forever — a barrier that can hang
 * takes the popup down with it, which is worse than the bug it prevents.
 */
async function freshBarrier() {
  vi.resetModules();
  return import('../serviceReadiness');
}

describe('serviceReadiness', () => {
  it('holds a caller that arrives before initialisation finishes', async () => {
    const { markServicesReady, whenServicesReady } = await freshBarrier();

    const settled = vi.fn();
    const waiting = whenServicesReady().then(settled);

    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    markServicesReady();
    await waiting;
    expect(settled).toHaveBeenCalled();
  });

  it('lets a caller straight through once ready', async () => {
    const { markServicesReady, whenServicesReady } = await freshBarrier();
    markServicesReady();

    await expect(whenServicesReady()).resolves.toBeUndefined();
  });

  it('fails rather than hanging when initialisation never finishes', async () => {
    vi.useFakeTimers();
    const { whenServicesReady } = await freshBarrier();

    const waiting = whenServicesReady();
    const assertion = expect(waiting).rejects.toThrow(/still starting up/);
    await vi.advanceTimersByTimeAsync(11_000);
    await assertion;

    vi.useRealTimers();
  });
});
