/**
 * The pace the wallet asks a Counterparty node at.
 *
 * The public node meters requests per client. A home-screen visit is ten reads
 * at once (the mempool, the UTXO check, owned assets, one per pinned asset, the
 * first balances page), and flipping between addresses repeats the burst. The
 * node answers with 429 and every list goes empty, because nothing slowed down
 * and nothing tried again. Two rules keep the wallet inside the budget, and both
 * live here so no screen has to think about it:
 *
 * - at most a few requests in flight at once; the rest wait their turn in order;
 * - when the node says stop, everyone waits out its Retry-After (or a default
 *   that grows while refusals continue) before anyone sends again, and the
 *   request that was refused is sent again after the wait.
 *
 * Pure: no fetch, no API shapes. The caller hands in the function that performs
 * one request and a predicate that recognises a rate-limit refusal, so this can
 * be tested with a clock and a counter.
 */

/** A refusal the node explained: how long it asked us to wait, when it said. */
export interface RateLimitRefusal {
  retryAfterMs?: number;
}

export interface RequestGateOptions {
  /** Requests allowed in flight at once. */
  maxInFlight?: number;
  /** The wait after a refusal that carried no Retry-After; doubles per consecutive refusal. */
  defaultCooldownMs?: number;
  /** The longest the gate will ever hold requests, whatever the node asked for. */
  maxCooldownMs?: number;
  /** How many times one request is sent again after being refused. */
  maxRetries?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class RequestGate {
  private readonly maxInFlight: number;
  private readonly defaultCooldownMs: number;
  private readonly maxCooldownMs: number;
  private readonly maxRetries: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  private inFlight = 0;
  private readonly waiting: Array<() => void> = [];
  private holdUntil = 0;
  private refusalsInARow = 0;

  constructor(options: RequestGateOptions = {}) {
    this.maxInFlight = options.maxInFlight ?? 3;
    this.defaultCooldownMs = options.defaultCooldownMs ?? 2_000;
    this.maxCooldownMs = options.maxCooldownMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Perform one request under the gate: take a slot, wait out any cooldown,
   * send, and on a refusal note the cooldown and send again after it.
   */
  async run<T>(request: () => Promise<T>, refusal: (error: unknown) => RateLimitRefusal | null): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      // The slot is taken before the cooldown wait, so a burst that arrives during a cooldown
      // is still released a few at a time once it ends, never all at once.
      await this.acquire();
      try {
        await this.waitForCooldown();
        const result = await request();
        this.refusalsInARow = 0;
        return result;
      } catch (error) {
        const refused = refusal(error);
        if (!refused) throw error;
        this.noteRefusal(refused);
        if (attempt >= this.maxRetries) throw error;
      } finally {
        this.release();
      }
    }
  }

  /** Whether the node has asked us to wait and the wait is not over. */
  get coolingDown(): boolean {
    return this.holdUntil > this.now();
  }

  /** Forget refusals and any cooldown: for tests, and for a user who insists on trying now. */
  reset(): void {
    this.holdUntil = 0;
    this.refusalsInARow = 0;
  }

  private noteRefusal(refusal: RateLimitRefusal): void {
    this.refusalsInARow += 1;
    const backoff = this.defaultCooldownMs * 2 ** (this.refusalsInARow - 1);
    const asked = refusal.retryAfterMs;
    const wait = asked !== undefined && Number.isFinite(asked) && asked >= 0 ? asked : backoff;
    this.holdUntil = Math.max(this.holdUntil, this.now() + Math.min(wait, this.maxCooldownMs));
  }

  private async waitForCooldown(): Promise<void> {
    for (;;) {
      const remaining = this.holdUntil - this.now();
      if (remaining <= 0) return;
      await this.sleep(remaining);
    }
  }

  private acquire(): Promise<void> {
    if (this.inFlight < this.maxInFlight) {
      this.inFlight += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiting.push(() => {
        this.inFlight += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.inFlight -= 1;
    const next = this.waiting.shift();
    if (next) next();
  }
}
