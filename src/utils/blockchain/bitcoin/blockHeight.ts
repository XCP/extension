/**
 * Utilities for fetching the current Bitcoin block height from various sources.
 * Implements caching and fallback mechanisms similar to fee rate fetching.
 */

// Cache for block height data
interface BlockHeightCache {
  height: number;
  timestamp: number;
}

let blockHeightCache: BlockHeightCache | null = null;
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Clears the block height cache. Useful for testing.
 */
export const clearBlockHeightCache = (): void => {
  blockHeightCache = null;
};

/**
 * Fetch block height from Blockstream API
 */
export const fetchFromBlockstream = async (): Promise<number> => {
  const response = await fetch('https://blockstream.info/api/blocks/tip/height');
  if (!response.ok) {
    throw new Error('Failed to fetch block height from blockstream.info');
  }
  const data = await response.text();
  const height = parseInt(data, 10);
  if (isNaN(height)) {
    throw new Error('Invalid block height data from blockstream.info');
  }
  return height;
};

/**
 * Fetch block height from Mempool.space API
 */
export const fetchFromMempoolSpace = async (): Promise<number> => {
  const response = await fetch('https://mempool.space/api/blocks/tip/height');
  if (!response.ok) {
    throw new Error('Failed to fetch block height from mempool.space');
  }
  const data = await response.text();
  const height = parseInt(data, 10);
  if (isNaN(height)) {
    throw new Error('Invalid block height data from mempool.space');
  }
  return height;
};

/**
 * Fetch block height from Blockchain.info API
 */
export const fetchFromBlockchainInfo = async (): Promise<number> => {
  const response = await fetch('https://blockchain.info/q/getblockcount');
  if (!response.ok) {
    throw new Error('Failed to fetch block height from blockchain.info');
  }
  const data = await response.text();
  const height = parseInt(data, 10);
  if (isNaN(height)) {
    throw new Error('Invalid block height data from blockchain.info');
  }
  return height;
};

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
 * @returns {Promise<number>} The current block height
 * @throws Error if all sources fail
 */
export const fetchBlockHeightRace = async (): Promise<number> => {
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
    throw new Error('Failed to fetch block height from any source');
  }
};

/**
 * Attempts to fetch block height from multiple APIs sequentially.
 * If no source returns valid data, an error is thrown.
 *
 * @returns {Promise<number>} The current block height
 * @throws Error if all sources fail
 */
export const fetchBlockHeightSequential = async (): Promise<number> => {
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
  throw new Error('Unable to fetch block height from any source');
};

/**
 * Gets the current block height, using cache if available and not expired.
 * Falls back to sequential fetching if race approach fails.
 * 
 * @param {boolean} forceRefresh - If true, ignores cache and fetches fresh data
 * @returns {Promise<number>} The current block height
 */
export const getCurrentBlockHeight = async (forceRefresh = false): Promise<number> => {
  // Check cache first if not forcing refresh
  if (!forceRefresh && blockHeightCache && 
      (Date.now() - blockHeightCache.timestamp) < CACHE_DURATION_MS) {
    return blockHeightCache.height;
  }

  try {
    // Try race approach first (fastest response wins)
    const height = await fetchBlockHeightRace();
    
    // Update cache
    blockHeightCache = {
      height,
      timestamp: Date.now()
    };
    
    return height;
  } catch (error) {
    console.error('Race approach failed, trying sequential:', error);
    
    // Fall back to sequential approach
    try {
      const height = await fetchBlockHeightSequential();
      
      // Update cache
      blockHeightCache = {
        height,
        timestamp: Date.now()
      };
      
      return height;
    } catch (sequentialError) {
      console.error('All block height fetching methods failed:', sequentialError);
      throw new Error('Failed to fetch current block height');
    }
  }
}; 