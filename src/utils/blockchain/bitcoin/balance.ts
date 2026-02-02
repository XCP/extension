import { toSatoshis } from '@/utils/numeric';
import { KeyedTTLCache, CacheTTL, cachedFetch } from '@/utils/cache';

// Balance can change with each block but short cache prevents API spam
const balanceCache = new KeyedTTLCache<string, number>(CacheTTL.MEDIUM);
const inflightBalanceRequests = new Map<string, Promise<number>>();

// Activity status changes less frequently
const activityCache = new KeyedTTLCache<string, boolean>(CacheTTL.MEDIUM);
const inflightActivityRequests = new Map<string, Promise<boolean>>();

/**
 * Clears the balance and activity caches for a specific address or all addresses.
 * Call this after broadcasting a transaction to ensure fresh data.
 */
export function clearBalanceCache(address?: string): void {
  if (address) {
    balanceCache.invalidate(address);
    activityCache.invalidate(address);
  } else {
    balanceCache.invalidateAll();
    activityCache.invalidateAll();
  }
}

/**
 * Response format from Blockstream.info and Mempool.space APIs.
 */
interface BlockstreamAddressResponse {
  chain_stats: {
    funded_txo_sum: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_sum: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

/**
 * Response format from BlockCypher and Blockchain.info APIs.
 */
interface BlockcypherAddressResponse {
  final_balance: number;
}

/**
 * Response format from SoChain API.
 */
interface SochainAddressResponse {
  data: {
    confirmed_balance: string;
  };
}

/**
 * Type guard for Blockstream/Mempool response format.
 */
function isBlockstreamResponse(data: unknown): data is BlockstreamAddressResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'chain_stats' in data &&
    'mempool_stats' in data &&
    typeof (data as BlockstreamAddressResponse).chain_stats?.funded_txo_sum === 'number'
  );
}

/**
 * Type guard for BlockCypher/Blockchain.info response format.
 */
function isBlockcypherResponse(data: unknown): data is BlockcypherAddressResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'final_balance' in data &&
    typeof (data as BlockcypherAddressResponse).final_balance === 'number'
  );
}

/**
 * Type guard for SoChain response format.
 */
function isSochainResponse(data: unknown): data is SochainAddressResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'data' in data &&
    typeof (data as SochainAddressResponse).data?.confirmed_balance === 'string'
  );
}

/**
 * Checks if a Bitcoin address has any transaction history (received or sent).
 * Results are cached for 30 seconds on successful API responses.
 * If all endpoints fail, returns false without caching (next call will retry).
 *
 * @param address - The Bitcoin address to check
 * @param timeoutMs - Timeout in milliseconds for the API request (default: 5000ms)
 * @returns A Promise that resolves to true if the address has activity, false otherwise
 */
export async function hasAddressActivity(address: string, timeoutMs = 5000): Promise<boolean> {
  // Check cache first
  const cached = activityCache.get(address);
  if (cached !== null) {
    return cached;
  }

  // Deduplicate concurrent requests
  const inflight = inflightActivityRequests.get(address);
  if (inflight) {
    return inflight;
  }

  const request = (async (): Promise<boolean> => {
    const endpoints = [
      `https://blockstream.info/api/address/${address}`,
      `https://mempool.space/api/address/${address}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const resp = await fetchWithTimeout(endpoint, { timeout: timeoutMs });
        if (!resp.ok) {
          console.warn(`API call failed with HTTP ${resp.status}: ${endpoint}`);
          continue;
        }
        const data = await resp.json();

        // Check if address has any transaction history
        if (data.chain_stats?.tx_count > 0 || data.mempool_stats?.tx_count > 0) {
          activityCache.set(address, true);
          return true;
        }

        // If we got a valid response with 0 transactions, cache and return false
        if (data.chain_stats?.tx_count === 0 && data.mempool_stats?.tx_count === 0) {
          activityCache.set(address, false);
          return false;
        }
      } catch (error) {
        console.warn(`Error calling ${endpoint}:`, error);
        continue;
      }
    }

    // If all endpoints failed, return false WITHOUT caching (next call will retry)
    return false;
  })();

  inflightActivityRequests.set(address, request);

  try {
    return await request;
  } finally {
    inflightActivityRequests.delete(address);
  }
}

/**
 * Fetches the Bitcoin balance (in satoshis) for a given address by querying multiple API endpoints.
 * The function returns as soon as one of the endpoints successfully returns a balance.
 * Results are cached for 30 seconds to reduce API load.
 *
 * @param address - The Bitcoin address.
 * @param timeoutMs - Timeout in milliseconds for each API request (default: 5000ms).
 * @returns A Promise that resolves to the balance in satoshis.
 * @throws Error if all API calls fail or no valid balance is returned.
 */
export async function fetchBTCBalance(address: string, timeoutMs = 5000): Promise<number> {
  return cachedFetch(
    balanceCache,
    inflightBalanceRequests,
    address,
    async () => {
      const endpoints = [
        `https://blockstream.info/api/address/${address}`,
        `https://mempool.space/api/address/${address}`,
        `https://api.blockcypher.com/v1/btc/main/addrs/${address}/balance`,
        `https://blockchain.info/rawaddr/${address}?cors=true`,
        `https://sochain.com/api/v2/get_address_balance/BTC/${address}`,
      ];

      for (const endpoint of endpoints) {
        try {
          const resp = await fetchWithTimeout(endpoint, { timeout: timeoutMs });
          if (!resp.ok) {
            console.warn(`API call failed with HTTP ${resp.status}: ${endpoint}`);
            continue;
          }
          const data = await resp.json();
          const parsed = parseBTCBalance(endpoint, data);
          if (parsed !== null && parsed !== undefined && typeof parsed === 'number') {
            return parsed;
          }
        } catch (error) {
          console.warn(`Error calling ${endpoint}:`, error);
          continue;
        }
      }
      throw new Error('Failed to fetch BTC balance from all explorers');
    }
  );
}

/**
 * Helper function to perform a fetch with a timeout.
 *
 * @param resource - The resource URL or Request object.
 * @param options - Fetch options, including a 'timeout' field (in ms).
 * @returns A Promise that resolves to the Response.
 */
async function fetchWithTimeout(
  resource: RequestInfo,
  options: { timeout: number } & RequestInit
): Promise<Response> {
  const { timeout, ...rest } = options;
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(resource, { ...rest, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timerId);
  }
}

/**
 * Parses the balance from various API responses.
 *
 * @param endpoint - The endpoint URL that was called.
 * @param data - The parsed JSON response.
 * @returns The balance in satoshis if successfully parsed; otherwise null.
 */
function parseBTCBalance(endpoint: string, data: unknown): number | null {
  try {
    // Format from blockstream.info or mempool.space.
    if (endpoint.includes('blockstream.info') || endpoint.includes('mempool.space')) {
      if (!isBlockstreamResponse(data)) {
        return null;
      }
      const funded = BigInt(data.chain_stats.funded_txo_sum);
      const spent = BigInt(data.chain_stats.spent_txo_sum);
      const memFunded = BigInt(data.mempool_stats.funded_txo_sum);
      const memSpent = BigInt(data.mempool_stats.spent_txo_sum);
      return Number(funded - spent + memFunded - memSpent);
    }
    // Format from blockcypher.com or blockchain.info.
    if (endpoint.includes('blockcypher.com') || endpoint.includes('blockchain.info')) {
      if (!isBlockcypherResponse(data)) {
        return null;
      }
      return data.final_balance;
    }
    // Format from sochain.com.
    if (endpoint.includes('sochain.com')) {
      if (!isSochainResponse(data)) {
        return null;
      }
      return Number(toSatoshis(Number(data.data.confirmed_balance)));
    }
  } catch (err) {
    console.warn(`Error parsing response from ${endpoint}:`, err);
  }
  return null;
}
