import { toSatoshis } from '@/utils/numeric';

export interface BTCBalanceInfo {
  confirmed: number;
  unconfirmed: number;
  total: number;
}

/**
 * Fetches the Bitcoin balance (in satoshis) for a given address by querying multiple API endpoints.
 * The function returns as soon as one of the endpoints successfully returns a balance.
 *
 * @param address - The Bitcoin address.
 * @param timeoutMs - Timeout in milliseconds for each API request (default: 5000ms).
 * @returns A Promise that resolves to the balance in satoshis.
 * @throws Error if all API calls fail or no valid balance is returned.
 */
export async function fetchBTCBalance(address: string, timeoutMs = 5000): Promise<number> {
  const balanceInfo = await fetchBTCBalanceDetailed(address, timeoutMs);
  return balanceInfo.total;
}

/**
 * Fetches detailed Bitcoin balance info including confirmed and unconfirmed amounts.
 *
 * @param address - The Bitcoin address.
 * @param timeoutMs - Timeout in milliseconds for each API request (default: 5000ms).
 * @returns A Promise that resolves to the detailed balance info.
 * @throws Error if all API calls fail or no valid balance is returned.
 */
export async function fetchBTCBalanceDetailed(address: string, timeoutMs = 5000): Promise<BTCBalanceInfo> {
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
      const parsed = parseBTCBalanceDetailed(endpoint, data);
      if (parsed !== null) {
        return parsed;
      }
    } catch (error) {
      console.warn(`Error calling ${endpoint}:`, error);
      continue;
    }
  }
  throw new Error('Failed to fetch BTC balance from all explorers');
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
function parseBTCBalance(endpoint: string, data: any): number | null {
  const detailed = parseBTCBalanceDetailed(endpoint, data);
  return detailed ? detailed.total : null;
}

/**
 * Parses detailed balance info from various API responses.
 *
 * @param endpoint - The endpoint URL that was called.
 * @param data - The parsed JSON response.
 * @returns The detailed balance info if successfully parsed; otherwise null.
 */
function parseBTCBalanceDetailed(endpoint: string, data: any): BTCBalanceInfo | null {
  try {
    // Format from blockstream.info or mempool.space.
    if (endpoint.includes('blockstream.info') || endpoint.includes('mempool.space')) {
      const funded = BigInt(data.chain_stats.funded_txo_sum);
      const spent = BigInt(data.chain_stats.spent_txo_sum);
      const memFunded = BigInt(data.mempool_stats.funded_txo_sum);
      const memSpent = BigInt(data.mempool_stats.spent_txo_sum);
      
      const confirmed = Number(funded - spent);
      const unconfirmed = Number(memFunded - memSpent);
      
      return {
        confirmed,
        unconfirmed,
        total: confirmed + unconfirmed
      };
    }
    // Format from blockcypher.com.
    if (endpoint.includes('blockcypher.com')) {
      const confirmed = data.balance || 0;
      const unconfirmed = data.unconfirmed_balance || 0;
      return {
        confirmed,
        unconfirmed,
        total: data.final_balance || (confirmed + unconfirmed)
      };
    }
    // Format from blockchain.info.
    if (endpoint.includes('blockchain.info')) {
      // blockchain.info doesn't provide unconfirmed separately in this endpoint
      return {
        confirmed: data.final_balance,
        unconfirmed: 0,
        total: data.final_balance
      };
    }
    // Format from sochain.com.
    if (endpoint.includes('sochain.com')) {
      const confirmed = Number(toSatoshis(Number(data.data.confirmed_balance)));
      const unconfirmed = Number(toSatoshis(Number(data.data.unconfirmed_balance || 0)));
      return {
        confirmed,
        unconfirmed,
        total: confirmed + unconfirmed
      };
    }
  } catch (err) {
    console.warn(`Error parsing response from ${endpoint}:`, err);
  }
  return null;
}
