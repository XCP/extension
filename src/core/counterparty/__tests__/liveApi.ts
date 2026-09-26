/**
 * Polite access to the live counterparty-core API for the nightly checks that depend on it (the
 * compose oracle, the on-chain round trip and the wire differential fuzz).
 *
 * The public endpoint is shared infrastructure and rate-limits by client. The nightly runs those
 * checks back to back from one runner, so by the time the fuzz starts the oracle has already spent
 * much of the budget and a burst of calls draws 429s. Every call therefore goes through one serial
 * queue with a minimum spacing, and a 429 or 5xx is retried after the wait the server asks for
 * (Retry-After) or an exponential backoff, within a bounded total wait. A rate limit that outlasts
 * that budget is an error with a message that says so — never a silent pass and never a decode
 * disagreement.
 */

export interface LiveApiOptions {
  /** Minimum gap between the starts of two consecutive requests from this process. */
  spacingMs?: number;
  /** Total attempts, including the first. */
  maxAttempts?: number;
  /** First backoff when the server gives no Retry-After; doubles on each retry. */
  baseDelayMs?: number;
  /** Ceiling on any single wait, including one the server asked for. */
  maxDelayMs?: number;
  /** Ceiling on the summed waits for one request; once the next wait would pass it, give up. */
  maxTotalWaitMs?: number;
}

const DEFAULTS: Required<LiveApiOptions> = {
  spacingMs: 500,
  maxAttempts: 6,
  baseDelayMs: 2_000,
  maxDelayMs: 30_000,
  maxTotalWaitMs: 90_000,
};

/** Thrown when the API is still rate limiting after every retry the budget allows. */
export class LiveApiRateLimitError extends Error {
  constructor(url: string, attempts: number, waitedMs: number) {
    super(
      `counterparty API still rate limited (HTTP 429) after ${attempts} attempts and ` +
      `${Math.round(waitedMs / 1000)}s of backoff: ${redact(url)}`
    );
    this.name = 'LiveApiRateLimitError';
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Path only, so a failure message does not carry a long query string. */
function redact(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Retry-After as milliseconds, from either delta-seconds or an HTTP date; undefined if absent. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

let queue: Promise<void> = Promise.resolve();
let lastStart = -Infinity;

/** Waits its turn so request starts are at least `spacingMs` apart, one at a time. */
function takeTurn(spacingMs: number): Promise<void> {
  const turn = queue.then(async () => {
    const wait = lastStart + spacingMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
  });
  queue = turn.catch(() => undefined);
  return turn;
}

/** Forget queue state between unit tests, whose fake clocks do not share a timeline. */
export function resetLiveApiQueue(): void {
  queue = Promise.resolve();
  lastStart = -Infinity;
}

/**
 * GET `url`, paced and retried. Returns the final response for any status other than a persistent
 * 429 (callers decide what a 4xx or an exhausted 5xx means); throws LiveApiRateLimitError for that,
 * and rethrows the last network error if no attempt got a response.
 */
export async function fetchLiveApi(url: string, options: LiveApiOptions = {}): Promise<Response> {
  const opts = { ...DEFAULTS, ...options };
  let waited = 0;

  for (let attempt = 1; ; attempt += 1) {
    await takeTurn(opts.spacingMs);

    let response: Response | undefined;
    let error: unknown;
    try {
      response = await fetch(url);
    } catch (caught) {
      error = caught;
    }

    if (response && !isRetryable(response.status)) return response;

    const backoff = Math.min(opts.baseDelayMs * 2 ** (attempt - 1), opts.maxDelayMs);
    const asked = response ? parseRetryAfter(response.headers.get('retry-after')) : undefined;
    const delay = Math.min(asked ?? backoff, opts.maxDelayMs);
    const exhausted = attempt >= opts.maxAttempts || waited + delay > opts.maxTotalWaitMs;

    if (exhausted) {
      if (response?.status === 429) throw new LiveApiRateLimitError(url, attempt, waited);
      if (response) return response;
      throw error;
    }

    await sleep(delay);
    waited += delay;
  }
}
