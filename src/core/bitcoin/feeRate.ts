import { CacheTTL, TTLCache } from '@/core/api/cache';
import { apiClient } from '@/core/api/client';
import { DataFetchError } from '@/core/errors';
import { maximum, toBigNumber, toNumber } from '@/core/numeric';

export interface FeeRates {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
}

/** Presets are quoted to the two decimals the custom fee input accepts. */
const QUOTED_DECIMALS = 2;
/** And clamped to the same 0.1 sat/vB floor that input enforces. */
const MIN_QUOTED_FEE_RATE = 0.1;

/**
 * Brings a source's rate to the precision the wallet quotes.
 *
 * Sources now report sub-sat/vB rates (mempool.space's precise endpoint answers 0.408 where the
 * recommended one rounded to 1), which is the point of using them — but a preset still has to be a
 * value the fee input itself would accept. Rounding is upward so a preset never sits below the
 * estimate it came from.
 */
function quoteRate(rate: number): number {
  const rounded = toBigNumber(rate).decimalPlaces(QUOTED_DECIMALS, 2); // ROUND_CEIL = 2
  return toNumber(maximum(rounded, MIN_QUOTED_FEE_RATE));
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
 * The precise endpoint rather than the recommended one: same fields, but unrounded, so a quiet
 * mempool reads 0.41 sat/vB instead of the 1 sat/vB the rounded endpoint reports as its floor.
 *
 * Expected response shape (economyFee and minimumFee are also returned, and unused):
 * {
 *   fastestFee: number,
 *   halfHourFee: number,
 *   hourFee: number
 * }
 */
export async function fetchFromMempoolSpace(): Promise<FeeRates> {
  const response = await apiClient.get<Record<string, number>>('https://mempool.space/api/v1/fees/precise', { retries: 0 });
  const data = response.data;
  if (
    typeof data.fastestFee !== 'number' || Number.isNaN(data.fastestFee) ||
    typeof data.halfHourFee !== 'number' || Number.isNaN(data.halfHourFee) ||
    typeof data.hourFee !== 'number' || Number.isNaN(data.hourFee)
  ) {
    throw new DataFetchError('Invalid response data format', 'mempool.space', {
      endpoint: '/api/v1/fees/precise',
    });
  }
  return {
    fastestFee: quoteRate(data.fastestFee),
    halfHourFee: quoteRate(data.halfHourFee),
    hourFee: quoteRate(data.hourFee),
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
  const response = await apiClient.get<Record<string, number>>('https://blockstream.info/api/fee-estimates', { retries: 0 });
  const data = response.data;
  const fastestFee = data["2"];
  const halfHourFee = data["3"];
  const hourFee = data["6"];
  if (
    typeof fastestFee !== 'number' || Number.isNaN(fastestFee) ||
    typeof halfHourFee !== 'number' || Number.isNaN(halfHourFee) ||
    typeof hourFee !== 'number' || Number.isNaN(hourFee)
  ) {
    throw new DataFetchError('Invalid response data format', 'blockstream.info', {
      endpoint: '/api/fee-estimates',
    });
  }
  return {
    fastestFee: quoteRate(fastestFee),
    halfHourFee: quoteRate(halfHourFee),
    hourFee: quoteRate(hourFee),
  };
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
        typeof rates.fastestFee === 'number' && !Number.isNaN(rates.fastestFee) &&
        typeof rates.halfHourFee === 'number' && !Number.isNaN(rates.halfHourFee) &&
        typeof rates.hourFee === 'number' && !Number.isNaN(rates.hourFee)
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
