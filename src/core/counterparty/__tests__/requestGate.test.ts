import { describe, expect, it } from 'vitest';
import { type RateLimitRefusal, RequestGate } from '@/core/counterparty/requestGate';

/** A clock the test advances, and a sleep that parks until the clock reaches its due time. */
function fakeClock() {
  let time = 0;
  const timers: Array<{ due: number; wake: () => void }> = [];
  return {
    now: () => time,
    sleep: (ms: number) => new Promise<void>((wake) => timers.push({ due: time + ms, wake })),
    async advance(ms: number) {
      time += ms;
      for (const timer of timers.splice(0)) {
        if (timer.due <= time) timer.wake();
        else timers.push(timer);
      }
      await flush();
    },
  };
}

/** Let every settled promise run its continuations. */
const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

const refused = (error: unknown): RateLimitRefusal | null =>
  error instanceof Error && error.message.startsWith('429') ? { retryAfterMs: Number(error.message.slice(4)) || undefined } : null;

describe('RequestGate', () => {
  it('lets only a few requests run at once and releases the rest in order', async () => {
    const clock = fakeClock();
    const gate = new RequestGate({ maxInFlight: 3, now: clock.now, sleep: clock.sleep });
    const started: number[] = [];
    const finish: Array<() => void> = [];
    const request = (id: number) => () =>
      new Promise<number>((resolve) => {
        started.push(id);
        finish.push(() => resolve(id));
      });

    const results = Promise.all([1, 2, 3, 4, 5].map((id) => gate.run(request(id), refused)));
    await flush();
    expect(started).toEqual([1, 2, 3]);

    finish[0]!();
    await flush();
    expect(started).toEqual([1, 2, 3, 4]);

    finish[1]!();
    finish[2]!();
    await flush();
    expect(started).toEqual([1, 2, 3, 4, 5]);

    finish[3]!();
    finish[4]!();
    await expect(results).resolves.toEqual([1, 2, 3, 4, 5]);
  });

  it('waits out Retry-After after a refusal, then sends the refused request again', async () => {
    const clock = fakeClock();
    const gate = new RequestGate({ now: clock.now, sleep: clock.sleep, random: () => 1 });
    let calls = 0;
    const request = async () => {
      calls += 1;
      if (calls === 1) throw new Error('429 5000');
      return 'ok';
    };

    const result = gate.run(request, refused);
    await flush();
    expect(calls).toBe(1);
    expect(gate.coolingDown).toBe(true);

    await clock.advance(4_999);
    expect(calls).toBe(1);

    await clock.advance(1);
    expect(calls).toBe(2);
    await expect(result).resolves.toBe('ok');
    expect(gate.coolingDown).toBe(false);
  });

  it('holds every other request during the cooldown too', async () => {
    const clock = fakeClock();
    const gate = new RequestGate({ now: clock.now, sleep: clock.sleep, random: () => 1 });
    let refusedOnce = false;
    const first = gate.run(async () => {
      if (!refusedOnce) {
        refusedOnce = true;
        throw new Error('429 3000');
      }
      return 'first';
    }, refused);
    await flush();

    let secondSent = false;
    const second = gate.run(async () => {
      secondSent = true;
      return 'second';
    }, refused);
    await flush();
    expect(secondSent).toBe(false);

    await clock.advance(3_000);
    expect(secondSent).toBe(true);
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
  });

  it('backs off longer while refusals continue, and gives up after the retries', async () => {
    const clock = fakeClock();
    const gate = new RequestGate({ defaultCooldownMs: 1_000, maxRetries: 2, now: clock.now, sleep: clock.sleep });
    let calls = 0;
    const alwaysRefused = gate.run(async () => {
      calls += 1;
      throw new Error('429');
    }, refused);
    alwaysRefused.catch(() => undefined);

    await flush();
    expect(calls).toBe(1);
    await clock.advance(1_000); // first cooldown: the default
    expect(calls).toBe(2);
    await clock.advance(1_000);
    expect(calls).toBe(2); // second cooldown doubled
    await clock.advance(1_000);
    expect(calls).toBe(3);
    await expect(alwaysRefused).rejects.toThrow('429');
  });

  it('never holds longer than the ceiling, whatever the node asked for', async () => {
    const clock = fakeClock();
    const gate = new RequestGate({ maxCooldownMs: 10_000, now: clock.now, sleep: clock.sleep });
    let calls = 0;
    const result = gate.run(async () => {
      calls += 1;
      if (calls === 1) throw new Error('429 3600000');
      return 'ok';
    }, refused);
    await flush();
    await clock.advance(10_000);
    expect(calls).toBe(2);
    await expect(result).resolves.toBe('ok');
  });

  it('passes every other error straight through', async () => {
    const gate = new RequestGate();
    await expect(gate.run(async () => { throw new Error('500'); }, refused)).rejects.toThrow('500');
    expect(gate.coolingDown).toBe(false);
  });

  it('spreads a cooldown so a refused wave does not return as a wave', async () => {
    // Everything queued was refused at the same instant. Without jitter every
    // one of them wakes at the same instant too, and re-earns the refusal.
    const waits: number[] = [];
    for (const roll of [0, 0.5, 1]) {
      const clock = fakeClock();
      const gate = new RequestGate({ now: clock.now, sleep: clock.sleep, random: () => roll });
      let calls = 0;
      const result = gate.run(async () => {
        calls += 1;
        if (calls === 1) throw new Error('429 8000');
        return 'ok';
      }, refused);
      await flush();

      // Stepped rather than a while on `calls`: the counter changes inside the
      // request, which the loop body cannot see it doing.
      let waited = 8_000;
      for (let step = 100; step <= 8_000; step += 100) {
        await clock.advance(100);
        if (calls >= 2) {
          waited = step;
          break;
        }
      }
      await expect(result).resolves.toBe('ok');
      waits.push(waited);
    }

    // Never longer than the node asked for, never less than half of it, and
    // genuinely different across rolls.
    for (const w of waits) {
      expect(w).toBeLessThanOrEqual(8_000);
      expect(w).toBeGreaterThanOrEqual(4_000);
    }
    expect(new Set(waits).size).toBeGreaterThan(1);
  });

  it('defaults to the concurrency the node actually rewards', async () => {
    // Measured: one in flight returns ~2.5 useful responses a second, two ~2.0,
    // four or more returns nothing but 429s. A third parallel request is not a
    // tuning preference, it is spending budget for no throughput.
    const clock = fakeClock();
    const gate = new RequestGate({ now: clock.now, sleep: clock.sleep });
    const started: number[] = [];
    const finish: Array<() => void> = [];
    const request = (id: number) => () =>
      new Promise<number>((resolve) => {
        started.push(id);
        finish.push(() => resolve(id));
      });

    const results = Promise.all([1, 2, 3, 4].map((id) => gate.run(request(id), refused)));
    await flush();
    expect(started).toEqual([1, 2]);

    finish[0]!();
    finish[1]!();
    await flush();
    expect(started).toEqual([1, 2, 3, 4]);

    finish[2]!();
    finish[3]!();
    await expect(results).resolves.toEqual([1, 2, 3, 4]);
  });
});
