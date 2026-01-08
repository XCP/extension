import { TTLCache, CacheTTL } from '@/utils/cache';

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
export const fetchFromMempoolSpace = async (): Promise<FeeRates> => {
  const response = await fetch('https://mempool.space/api/v1/fees/recommended');
  if (!response.ok) {
    throw new Error('Failed to fetch fee rates from mempool.space');
  }
  const data = await response.json();
  if (
    typeof data.fastestFee !== 'number' || isNaN(data.fastestFee) ||
    typeof data.halfHourFee !== 'number' || isNaN(data.halfHourFee) ||
    typeof data.hourFee !== 'number' || isNaN(data.hourFee)
  ) {
    throw new Error('Invalid data format from mempool.space');
  }
  return {
    fastestFee: data.fastestFee,
    halfHourFee: data.halfHourFee,
    hourFee: data.hourFee,
  };
};

/**
 * Fetch fee rates from blockstream.info.
 *
 * The API returns an object mapping confirmation targets (in blocks)
 * to fee rates. We extract:
 *   - fastestFee: confirmation within 2 blocks (data["2"])
 *   - halfHourFee: confirmation within 3 blocks (data["3"])
 *   - hourFee: confirmation within 6 blocks (data["6"])
 */
export const fetchFromBlockstream = async (): Promise<FeeRates> => {
  const response = await fetch('https://blockstream.info/api/fee-estimates');
  if (!response.ok) {
    throw new Error('Failed to fetch fee rates from blockstream.info');
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
    throw new Error('Invalid data format from blockstream.info');
  }
  return { fastestFee, halfHourFee, hourFee };
};

// Ordered list of fee rate fetchers.
const feeRateFetchers: Array<() => Promise<FeeRates>> = [
  fetchFromMempoolSpace,
  fetchFromBlockstream,
];

/**
 * Attempts to fetch fee rates from multiple APIs sequentially.
 * Uses a 30-second cache to reduce API calls.
 * If no source returns valid data, an error is thrown.
 *
 * @returns {Promise<FeeRates>} The fee rates object.
 * @throws Error if all sources fail.
 */
export const getFeeRates = async (): Promise<FeeRates> => {
  // Check cache first (TTLCache.get() returns cloned data or null)
  const cached = feeRateCache.get();
  if (cached !== null) {
    return cached;
  }

  for (const fetcher of feeRateFetchers) {
    try {
      const rates = await fetcher();
      // Check that the returned rates are valid.
      if (
        typeof rates.fastestFee === 'number' && !isNaN(rates.fastestFee) &&
        typeof rates.halfHourFee === 'number' && !isNaN(rates.halfHourFee) &&
        typeof rates.hourFee === 'number' && !isNaN(rates.hourFee)
      ) {
        // Update cache
        feeRateCache.set(rates);
        return { ...rates };
      }
    } catch (error) {
      console.error(error);
      continue;
    }
  }
  throw new Error('Unable to fetch fee rates from any source');
};
