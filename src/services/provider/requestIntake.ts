/**
 * The checks a provider request passes before any method runs (a bound on its size and the
 * per-origin rate limits), and the errors a site hears when a request is refused.
 */

import { JSON_RPC_ERROR_CODES, PROVIDER_ERROR_CODES, ProviderError } from '@/core/rpcErrors';
import { analytics } from '@/platform/fathom';
import {
  apiRateLimiter,
  connectionRateLimiter,
  transactionRateLimiter,
} from '@/platform/provider/rateLimiter';

/**
 * dApp-facing failures. A plain Error is masked to -32603 "Request failed" at the page boundary
 * (classifyProviderError), so anything a site should be able to read or branch on is thrown as a
 * ProviderError. Only fixed, deliberately user-facing text goes in these, never internal state.
 *
 * - invalidParams (-32602): the request's own shape or content is wrong; resending it unchanged fails.
 * - limitExceeded (-32005, EIP-1474): a per-origin limit; the message says when to try again.
 * - expired (4001): nobody approved within the request's window. EIP-1193 has no timeout code, and
 *   the outcome is the same as a rejection: nothing was approved and the site should not assume
 *   anything happened. 4001 is the code sites already handle as "the user did not go ahead".
 */
export const invalidParams = (message: string) => new ProviderError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, message);
export const limitExceeded = (message: string) => new ProviderError(JSON_RPC_ERROR_CODES.LIMIT_EXCEEDED, message);
export const expired = (message: string) => new ProviderError(PROVIDER_ERROR_CODES.USER_REJECTED, message);

/**
 * Refuse a request that is too large or over one of its origin's rate limits. Runs first, before
 * the method is dispatched.
 */
export async function assertRequestAdmissible(origin: string, method: string, params: unknown): Promise<void> {
  // Validate parameter size to prevent memory exhaustion
  const MAX_PARAM_SIZE = 1024 * 1024; // 1MB limit
  let paramSize: number;
  try {
    paramSize = JSON.stringify(params).length;
  } catch {
    // If params can't be serialized (circular refs), reject the request
    await analytics.track('request_rejected');
    throw invalidParams('Request parameters cannot be serialized');
  }
  if (paramSize > MAX_PARAM_SIZE) {
    await analytics.track('request_rejected');
    let hostname = origin;
    try { hostname = new URL(origin).hostname; } catch { /* use raw origin */ }
    console.warn('[ProviderService] Request parameters too large', {
      origin: hostname,
      method,
      paramSize,
      maxSize: MAX_PARAM_SIZE
    });
    throw invalidParams('Request parameters too large (max 1MB)');
  }
  
  // Apply rate limiting based on method type
  const isConnectionMethod = method === 'xcp_requestAccounts';
  // Signing requests are limited where they open a popup (runSignFlow), not here: charging
  // them before validation counted rejected, rejoined and cancelled requests against a site.
  const isTransactionMethod = method === 'xcp_broadcastTransaction';
  
  if (isConnectionMethod && !connectionRateLimiter.isAllowed(origin)) {
    const resetTime = connectionRateLimiter.getResetTime(origin);
    throw limitExceeded(`Rate limit exceeded. Please wait ${Math.ceil(resetTime / 1000)} seconds before trying again.`);
  }
  
  if (isTransactionMethod && !transactionRateLimiter.isAllowed(origin)) {
    const resetTime = transactionRateLimiter.getResetTime(origin);
    throw limitExceeded(`Transaction rate limit exceeded. Please wait ${Math.ceil(resetTime / 1000)} seconds.`);
  }
  
  // General API rate limit
  if (!apiRateLimiter.isAllowed(origin)) {
    const resetTime = apiRateLimiter.getResetTime(origin);
    throw limitExceeded(`API rate limit exceeded. Please wait ${Math.ceil(resetTime / 1000)} seconds.`);
  }
}
