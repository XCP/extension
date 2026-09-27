import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LockModule = typeof import('../stateLockManager');

// The manager is a module singleton; load a fresh copy per test so no lock or timer leaks across.
let stateLockManager: LockModule['stateLockManager'];
let withStateLock: LockModule['withStateLock'];

interface Tracked<T> {
  settled: boolean;
  value?: T;
  error?: unknown;
}

function track<T>(promise: Promise<T>): Tracked<T> {
  const state: Tracked<T> = { settled: false };
  promise.then(
    (value) => { state.settled = true; state.value = value; },
    (error) => { state.settled = true; state.error = error; },
  );
  return state;
}

/** Let pending promise callbacks run without moving the clock. */
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('StateLockManager', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    ({ stateLockManager, withStateLock } = await import('../stateLockManager'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('acquire and release', () => {
    it('acquires a free lock immediately and frees it on release', async () => {
      const first = track(stateLockManager.acquire('r'));
      await flush();
      expect(first.settled).toBe(true);

      first.value!();

      const second = track(stateLockManager.acquire('r'));
      await flush();
      expect(second.settled).toBe(true);
      second.value!();
    });

    it('makes a second caller wait until the first releases', async () => {
      const first = track(stateLockManager.acquire('r'));
      const second = track(stateLockManager.acquire('r'));
      await flush();

      expect(first.settled).toBe(true);
      expect(second.settled).toBe(false);

      first.value!();
      await flush();
      expect(second.settled).toBe(true);
      second.value!();
    });

    it('grants queued callers in FIFO order', async () => {
      const order: number[] = [];
      const holders = [1, 2, 3].map((n) =>
        stateLockManager.acquire('r').then((release) => {
          order.push(n);
          return release;
        })
      );

      (await holders[0]!)();
      (await holders[1]!)();
      (await holders[2]!)();

      expect(order).toEqual([1, 2, 3]);
    });

    it('keeps different resources independent', async () => {
      const a = track(stateLockManager.acquire('a'));
      const b = track(stateLockManager.acquire('b'));
      await flush();

      expect(a.settled).toBe(true);
      expect(b.settled).toBe(true);
      a.value!();
      b.value!();
    });
  });

  describe('timeouts', () => {
    it('force-releases a holder that runs past its timeout', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const holder = track(stateLockManager.acquire('r', 1000));
      await flush();
      expect(holder.settled).toBe(true);

      await vi.advanceTimersByTimeAsync(1000);
      expect(warnSpy).toHaveBeenCalledWith('Lock timeout for resource: r');

      // The resource is free again for a new caller.
      const next = track(stateLockManager.acquire('r'));
      await flush();
      expect(next.settled).toBe(true);
      next.value!();
    });

    it('rejects everyone queued behind a holder that times out', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await stateLockManager.acquire('r', 500);
      const queued1 = stateLockManager.acquire('r', 200);
      const queued2 = stateLockManager.acquire('r', 200);
      const assertions = Promise.all([
        expect(queued1).rejects.toThrow('Lock timeout for resource: r'),
        expect(queued2).rejects.toThrow('Lock timeout for resource: r'),
      ]);

      await vi.advanceTimersByTimeAsync(500);
      await assertions;
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Lock queue cleared due to timeout'));
    });

    it('starts a queued caller\'s timeout only once it holds the lock', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const first = track(stateLockManager.acquire('r', 1000));
      const second = track(stateLockManager.acquire('r', 1000));
      await vi.advanceTimersByTimeAsync(900);
      first.value!();
      await flush();
      expect(second.settled).toBe(true);

      // 900 ms into the second holder's 1000 ms: the first holder's deadline must not apply.
      await vi.advanceTimersByTimeAsync(900);
      expect(warnSpy).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(100);
      expect(warnSpy).toHaveBeenCalledWith('Lock timeout for resource: r');
    });
  });

  describe('stale releases', () => {
    it('ignores a late release from a timed-out holder, so the next holder keeps the lock', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      // A takes the lock and outlives its timeout (say, waiting on a hardware confirmation).
      const a = track(stateLockManager.acquire('r', 1000));
      await flush();
      await vi.advanceTimersByTimeAsync(1000);

      // B takes the freed lock; C lines up behind B.
      const b = track(stateLockManager.acquire('r', 1000));
      await flush();
      expect(b.settled).toBe(true);
      const c = track(stateLockManager.acquire('r', 1000));
      await flush();
      expect(c.settled).toBe(false);

      // A finally finishes and calls its release. B still holds the lock, so C must keep waiting.
      a.value!();
      await flush();
      expect(c.settled).toBe(false);

      b.value!();
      await flush();
      expect(c.settled).toBe(true);
      expect(c.error).toBeUndefined();
      c.value!();
    });

    it('ignores a late release when nobody is queued, and keeps the current holder\'s timeout', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const a = track(stateLockManager.acquire('r', 1000));
      await flush();
      await vi.advanceTimersByTimeAsync(1000);

      const b = track(stateLockManager.acquire('r', 1000));
      await flush();
      a.value!();

      // B still holds the lock...
      const d = stateLockManager.acquire('r', 1000);
      const dResult = track(d);
      await flush();
      expect(dResult.settled).toBe(false);

      // ...until B's own timeout, which still fires and rejects D as before.
      const dRejected = expect(d).rejects.toThrow('Lock timeout for resource: r');
      await vi.advanceTimersByTimeAsync(1000);
      await dRejected;
      expect(warnSpy.mock.calls.filter(([msg]) => msg === 'Lock timeout for resource: r')).toHaveLength(2);
      expect(b.settled).toBe(true);
    });

    it('treats a second release from the same holder as a no-op', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const a = track(stateLockManager.acquire('r'));
      const b = track(stateLockManager.acquire('r'));
      const c = track(stateLockManager.acquire('r'));
      await flush();

      a.value!();
      await flush();
      expect(b.settled).toBe(true);

      a.value!();
      await flush();
      expect(c.settled).toBe(false);

      b.value!();
      await flush();
      expect(c.settled).toBe(true);
      c.value!();
    });

    it('lets a timed-out holder release harmlessly when nobody has taken the lock since', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const a = track(stateLockManager.acquire('r', 1000));
      await flush();
      await vi.advanceTimersByTimeAsync(1000);

      a.value!();
      expect(warnSpy).toHaveBeenCalledWith('Attempting to release non-existent lock: r');

      const next = track(stateLockManager.acquire('r'));
      await flush();
      expect(next.settled).toBe(true);
      next.value!();
    });
  });

  describe('withStateLock', () => {
    it('runs callers one at a time', async () => {
      let counter = 0;
      const seen: number[] = [];

      const increment = () => withStateLock('counter', async () => {
        const current = counter;
        seen.push(current);
        await new Promise((resolve) => setTimeout(resolve, 10));
        counter = current + 1;
        return counter;
      });

      const results = Promise.all([increment(), increment(), increment()]);
      await vi.runAllTimersAsync();

      expect((await results).sort()).toEqual([1, 2, 3]);
      expect(seen).toEqual([0, 1, 2]);
    });

    it('releases the lock when the function throws', async () => {
      await expect(withStateLock('throws', async () => {
        throw new Error('boom');
      })).rejects.toThrow('boom');

      const next = track(stateLockManager.acquire('throws'));
      await flush();
      expect(next.settled).toBe(true);
      next.value!();
    });

    it('keeps the second and third operations apart when the first outlives the default timeout', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const events: string[] = [];

      const operation = (name: string, ms: number) => withStateLock('wallet-operation', async () => {
        events.push(`start-${name}`);
        await new Promise((resolve) => setTimeout(resolve, ms));
        events.push(`end-${name}`);
      });

      // A waits 40 s on a hardware confirmation; the lock is force-released at 30 s.
      const a = operation('A', 40_000);
      await vi.advanceTimersByTimeAsync(30_000);

      // B starts in the gap, C queues behind it.
      const b = operation('B', 20_000);
      await flush();
      const c = operation('C', 1_000);

      await vi.runAllTimersAsync();
      await Promise.all([a, b, c]);

      // A's late release at 40 s must not let C start while B (30 s → 50 s) is still running.
      expect(events).toEqual(['start-A', 'start-B', 'end-A', 'end-B', 'start-C', 'end-C']);
    });

    it('serializes many concurrent callers', async () => {
      let active = 0;
      let maxActive = 0;

      const ops = Array.from({ length: 50 }, (_, i) => withStateLock('stress', async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active--;
        return i;
      }));

      const results = await Promise.all(ops);
      expect(results).toHaveLength(50);
      expect(maxActive).toBe(1);
    });
  });
});
