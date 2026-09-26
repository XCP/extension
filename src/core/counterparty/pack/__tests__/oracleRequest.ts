import { fetchLiveApi } from '../../__tests__/liveApi';

/**
 * The oracle's live requests: paced and retried on 429/5xx through the shared live-API queue, with
 * a backoff budget that fits inside each oracle case's 60-second timeout. A rate limit that outlasts
 * it fails the case with a message naming the 429 rather than a bare status.
 */
export function fetchOracle(url: string): Promise<Response> {
  return fetchLiveApi(url, {
    spacingMs: 250,
    maxAttempts: 5,
    baseDelayMs: 1_000,
    maxDelayMs: 15_000,
    maxTotalWaitMs: 30_000,
  });
}
