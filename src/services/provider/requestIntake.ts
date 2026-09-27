/**
 * What every provider request carries, and the checks it passes before any method runs: a bound on
 * its size and the per-origin rate limits.
 */

import { analytics } from '@/platform/fathom';
import {
  apiRateLimiter,
  connectionRateLimiter,
  transactionRateLimiter,
} from '@/platform/provider/rateLimiter';
import type { ConnectionService } from '@/services/connectionService';
import { invalidParams, limitExceeded } from '@/services/provider/requestErrors';
import type { WalletService } from '@/services/walletService';

// Define proper types for provider requests and responses
export type ProviderRequestParams = unknown[];

/** One admitted request, with the services its method runs against. */
export type ProviderMethodContext = {
  origin: string;
  method: string;
  params: ProviderRequestParams;
  walletService: WalletService;
  connectionService: ConnectionService;
};

/**
 * Refuse a request that is too large or over one of its origin's rate limits. Runs first, before
 * the method is dispatched.
 */
export async function assertRequestAdmissible(
  origin: string,
  method: string,
  params: ProviderRequestParams,
): Promise<void> {
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
