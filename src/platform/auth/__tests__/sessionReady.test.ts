import { describe, expect, it, vi } from 'vitest';
import { SessionRecoveryState } from '../sessionManager';

/**
 * The gate exists for an ordering, not a value: on expiry the session metadata is cleared before
 * the master key is, so anything re-deriving from that key before recovery has run could revive a
 * session that had already timed out. A caller must therefore be able to arrive first and wait.
 *
 * Each case re-imports the module so it starts ungated — the promise is created once at module
 * load, which is the whole point of it.
 */
async function freshGate() {
  vi.resetModules();
  return import('../sessionReady');
}

describe('sessionReady', () => {
  it('resolves to the recorded outcome', async () => {
    const { markSessionRecovery, whenSessionRecovered } = await freshGate();

    markSessionRecovery(SessionRecoveryState.VALID);

    await expect(whenSessionRecovered()).resolves.toBe(SessionRecoveryState.VALID);
  });

  it('makes a caller that arrives first wait', async () => {
    const { markSessionRecovery, whenSessionRecovered } = await freshGate();

    let settled: SessionRecoveryState | null = null;
    const waiting = whenSessionRecovered().then((state) => {
      settled = state;
      return state;
    });

    // Nothing has recorded an outcome, so nothing may proceed on the strength of one.
    await Promise.resolve();
    expect(settled).toBeNull();

    markSessionRecovery(SessionRecoveryState.NEEDS_REAUTH);
    await expect(waiting).resolves.toBe(SessionRecoveryState.NEEDS_REAUTH);
  });

  it('keeps the first outcome, since a second could only loosen it', async () => {
    const { markSessionRecovery, whenSessionRecovered } = await freshGate();

    markSessionRecovery(SessionRecoveryState.LOCKED);
    markSessionRecovery(SessionRecoveryState.VALID);

    await expect(whenSessionRecovered()).resolves.toBe(SessionRecoveryState.LOCKED);
  });
});
