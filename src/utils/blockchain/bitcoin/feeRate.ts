import { TTLCache, CacheTTL } from '@/utils/cache';
import { DataFetchError } from '@/utils/blockchain/errors';

export interface FeeRates {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
}

/**
 * Cache for fee rates to reduce API calls.
 * Fee rates change slowly (~10 min blocks) so 30 second cache is safe.
 */
const feeRateCache = new TTLCache<FeeRates>(CacheTTL.MEDIUM, (rates) => ({ ...rates }));

/** Inflight request for deduplication - prevents duplicate API calls */
let inflightRequest: Promise<FeeRates> | null = null;

/**
 * Fetch fee rates from mempool.space.
 *
 * Expected response shape:
 * {
 *   fastestFee: number,
 *   halfHourFee: number,
 *   hourFee: number
 * }
 */
export async function fetchFromMempoolSpace(): Promise<FeeRates> {
  const response = await fetch('https://mempool.space/api/v1/fees/recommended');
  if (!response.ok) {
    throw new DataFetchError('Failed to fetch fee rates', 'mempool.space', {
      endpoint: '/api/v1/fees/recommended',
      statusCode: response.status,
    });
  }
  const data = await response.json();
  if (
    typeof data.fastestFee !== 'number' || isNaN(data.fastestFee) ||
    typeof data.halfHourFee !== 'number' || isNaN(data.halfHourFee) ||
    typeof data.hourFee !== 'number' || isNaN(data.hourFee)
  ) {
    throw new DataFetchError('Invalid response data format', 'mempool.space', {
      endpoint: '/api/v1/fees/recommended',
    });
  }
  return {
    fastestFee: data.fastestFee,
    halfHourFee: data.halfHourFee,
    hourFee: data.hourFee,
  };
}

/**
 * Fetch fee rates from blockstream.info.
 *
 * The API returns an object mapping confirmation targets (in blocks)
 * to fee rates. We extract:
 *   - fastestFee: confirmation within 2 blocks (data["2"])
 *   - halfHourFee: confirmation within 3 blocks (data["3"])
 *   - hourFee: confirmation within 6 blocks (data["6"])
 */
export async function fetchFromBlockstream(): Promise<FeeRates> {
  const response = await fetch('https://blockstream.info/api/fee-estimates');
  if (!response.ok) {
    throw new DataFetchError('Failed to fetch fee rates', 'blockstream.info', {
      endpoint: '/api/fee-estimates',
      statusCode: response.status,
    });
  }
  const data = await response.json();
  const fastestFee = data["2"];
  const halfHourFee = data["3"];
  const hourFee = data["6"];
  if (
    typeof fastestFee !== 'number' || isNaN(fastestFee) ||
    typeof halfHourFee !== 'number' || isNaN(halfHourFee) ||
    typeof hourFee !== 'number' || isNaN(hourFee)
  ) {
    throw new DataFetchError('Invalid response data format', 'blockstream.info', {
      endpoint: '/api/fee-estimates',
    });
  }
  return { fastestFee, halfHourFee, hourFee };
}

// Ordered list of fee rate fetchers.
const feeRateFetchers: Array<() => Promise<FeeRates>> = [
  fetchFromMempoolSpace,
  fetchFromBlockstream,
];

/**
 * Internal fetch function with fallbacks.
 * Tries each fetcher sequentially until one succeeds.
 */
async function fetchFeeRatesWithFallback(): Promise<FeeRates> {
  for (const fetcher of feeRateFetchers) {
    try {
      const rates = await fetcher();
      // Check that the returned rates are valid.
      if (
        typeof rates.fastestFee === 'number' && !isNaN(rates.fastestFee) &&
        typeof rates.halfHourFee === 'number' && !isNaN(rates.halfHourFee) &&
        typeof rates.hourFee === 'number' && !isNaN(rates.hourFee)
      ) {
        return rates;
      }
    } catch (error) {
      console.error(error);
      continue;
    }
  }
  throw new DataFetchError('Unable to fetch fee rates from any source', 'fee-rates');
}

/**
 * Attempts to fetch fee rates from multiple APIs sequentially.
 * Uses a 30-second cache to reduce API calls.
 * Deduplicates concurrent requests - only one API call when multiple callers request simultaneously.
 * If no source returns valid data, an error is thrown.
 *
 * @returns The fee rates object.
 * @throws {DataFetchError} If all sources fail.
 */
export async function getFeeRates(): Promise<FeeRates> {
  // Check cache first (TTLCache.get() returns cloned data or null)
  const cached = feeRateCache.get();
  if (cached !== null) {
    return cached;
  }

  // Deduplicate concurrent requests - share the same promise
  if (inflightRequest !== null) {
    const result = await inflightRequest;
    return { ...result }; // Clone for caller
  }

  // Execute fetch and cache result
  inflightRequest = fetchFeeRatesWithFallback();
  try {
    const rates = await inflightRequest;
    feeRateCache.set(rates);
    return { ...rates }; // Clone for caller
  } finally {
    inflightRequest = null;
  }
}
