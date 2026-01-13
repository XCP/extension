/**
 * Utilities for fetching the current Bitcoin block height from various sources.
 * Implements caching and fallback mechanisms similar to fee rate fetching.
 */

import { TTLCache, CacheTTL } from '@/utils/cache';
import { DataFetchError } from '@/utils/blockchain/errors';

/**
 * Cache for block height with request deduplication.
 * 10 minute TTL - block height changes slowly (~10 min per block).
 * Prevents duplicate API calls when multiple components request block height simultaneously.
 */
const blockHeightCache = new TTLCache<number>(CacheTTL.VERY_LONG);
let inflightRequest: Promise<number> | null = null;

/**
 * Clears the block height cache. Useful for testing.
 */
export function clearBlockHeightCache(): void {
  blockHeightCache.invalidate();
  inflightRequest = null;
}

/**
 * Fetch block height from Blockstream API
 */
export async function fetchFromBlockstream(): Promise<number> {
  const response = await fetch('https://blockstream.info/api/blocks/tip/height');
  if (!response.ok) {
    throw new DataFetchError('Failed to fetch block height', 'blockstream.info', {
      endpoint: '/api/blocks/tip/height',
      statusCode: response.status,
    });
  }
  const data = await response.text();
  const height = parseInt(data, 10);
  if (isNaN(height)) {
    throw new DataFetchError('Invalid block height data', 'blockstream.info', {
      endpoint: '/api/blocks/tip/height',
    });
  }
  return height;
}

/**
 * Fetch block height from Mempool.space API
 */
export async function fetchFromMempoolSpace(): Promise<number> {
  const response = await fetch('https://mempool.space/api/blocks/tip/height');
  if (!response.ok) {
    throw new DataFetchError('Failed to fetch block height', 'mempool.space', {
      endpoint: '/api/blocks/tip/height',
      statusCode: response.status,
    });
  }
  const data = await response.text();
  const height = parseInt(data, 10);
  if (isNaN(height)) {
    throw new DataFetchError('Invalid block height data', 'mempool.space', {
      endpoint: '/api/blocks/tip/height',
    });
  }
  return height;
}

/**
 * Fetch block height from Blockchain.info API
 */
export async function fetchFromBlockchainInfo(): Promise<number> {
  const response = await fetch('https://blockchain.info/q/getblockcount');
  if (!response.ok) {
    throw new DataFetchError('Failed to fetch block height', 'blockchain.info', {
      endpoint: '/q/getblockcount',
      statusCode: response.status,
    });
  }
  const data = await response.text();
  const height = parseInt(data, 10);
  if (isNaN(height)) {
    throw new DataFetchError('Invalid block height data', 'blockchain.info', {
      endpoint: '/q/getblockcount',
    });
  }
  return height;
}

// Ordered list of block height fetchers
const blockHeightFetchers: Array<() => Promise<number>> = [
  fetchFromMempoolSpace,
  fetchFromBlockstream,
  fetchFromBlockchainInfo,
];

/**
 * Attempts to fetch the current block height from multiple sources using Promise.race
 * Returns the first successful response.
 *
 * @returns The current block height
 * @throws {DataFetchError} If all sources fail
 */
export async function fetchBlockHeightRace(): Promise<number> {
  const fetchPromises = blockHeightFetchers.map(async (fetcher) => {
    try {
      return await fetcher();
    } catch (error) {
      // Convert rejections to a special rejected value so we can track failures
      throw error;
    }
  });

  try {
    // Use Promise.any which returns the first fulfilled promise, ignoring rejections until all reject
    return await Promise.any(fetchPromises);
  } catch (error) {
    console.error('Error in block height race:', error);
    throw new DataFetchError('Failed to fetch block height from any source', 'block-height');
  }
}

/**
 * Attempts to fetch block height from multiple APIs sequentially.
 * If no source returns valid data, an error is thrown.
 *
 * @returns The current block height
 * @throws {DataFetchError} If all sources fail
 */
export async function fetchBlockHeightSequential(): Promise<number> {
  for (const fetcher of blockHeightFetchers) {
    try {
      const height = await fetcher();
      if (typeof height === 'number' && height > 0) {
        return height;
      }
    } catch (error) {
      console.error(error);
      continue;
    }
  }
  throw new DataFetchError('Unable to fetch block height from any source', 'block-height');
}

/**
 * Internal fetch function with fallbacks.
 * Tries race approach first, then sequential if race fails.
 */
async function fetchBlockHeightWithFallback(): Promise<number> {
  try {
    // Try race approach first (fastest response wins)
    return await fetchBlockHeightRace();
  } catch (error) {
    console.error('Race approach failed, trying sequential:', error);

    // Fall back to sequential approach
    try {
      return await fetchBlockHeightSequential();
    } catch (sequentialError) {
      console.error('All block height fetching methods failed:', sequentialError);
      throw new DataFetchError('Failed to fetch current block height', 'block-height');
    }
  }
}

/**
 * Gets the current block height, using cache if available and not expired.
 * Deduplicates concurrent requests - only one API call when multiple callers request simultaneously.
 * Falls back to sequential fetching if race approach fails.
 *
 * @param forceRefresh - If true, ignores cache and fetches fresh data
 * @returns The current block height
 */
export async function getCurrentBlockHeight(forceRefresh = false): Promise<number> {
  // Invalidate cache if forced refresh
  if (forceRefresh) {
    blockHeightCache.invalidate();
  }

  // Check cache first (TTLCache handles expiry)
  const cached = blockHeightCache.get();
  if (cached !== null) {
    return cached;
  }

  // Deduplicate concurrent requests - share the same promise
  if (inflightRequest !== null) {
    return inflightRequest;
  }

  // Execute fetch and cache result
  inflightRequest = fetchBlockHeightWithFallback();
  try {
    const height = await inflightRequest;
    blockHeightCache.set(height);
    return height;
  } finally {
    inflightRequest = null;
  }
}