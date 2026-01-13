import { KeyedTTLCache, CacheTTL } from '@/utils/cache';
import { DataFetchError } from '@/utils/blockchain/errors';

/**
 * Supported fiat currencies for price display.
 */
export type FiatCurrency = 'usd' | 'eur' | 'gbp' | 'jpy' | 'cad' | 'aud' | 'cny';

/**
 * Price display unit preference.
 * - 'btc': Show prices in BTC
 * - 'sats': Show prices in satoshis
 * - 'fiat': Show prices in user's preferred fiat currency
 */
export type PriceUnit = 'btc' | 'sats' | 'fiat';

/**
 * Display metadata for each fiat currency.
 */
export interface CurrencyInfo {
  symbol: string;
  name: string;
  decimals: number;
}

/**
 * Currency display information indexed by currency code.
 */
export const CURRENCY_INFO: Record<FiatCurrency, CurrencyInfo> = {
  usd: { symbol: '$', name: 'US Dollar', decimals: 2 },
  eur: { symbol: '€', name: 'Euro', decimals: 2 },
  gbp: { symbol: '£', name: 'British Pound', decimals: 2 },
  jpy: { symbol: '¥', name: 'Japanese Yen', decimals: 0 },
  cad: { symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
  aud: { symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
  cny: { symbol: '¥', name: 'Chinese Yuan', decimals: 0 },
};

/**
 * All supported fiat currencies as an array (for validation).
 */
export const FIAT_CURRENCIES: FiatCurrency[] = ['usd', 'eur', 'gbp', 'jpy', 'cad', 'aud', 'cny'];

/**
 * All supported price units as an array (for validation).
 */
export const PRICE_UNITS: PriceUnit[] = ['btc', 'sats', 'fiat'];

/**
 * Interface for Bitcoin price data.
 */
export interface PriceData {
  bitcoin: { usd: number };
}

/**
 * Fetches Bitcoin price from Coinbase API.
 * @returns Price data in USD.
 * @throws {DataFetchError} If the API response is invalid.
 */
export async function fetchFromCoinbase(): Promise<PriceData> {
  const response = await fetch("https://api.coinbase.com/v2/prices/spot?currency=USD");
  const data = await response.json();
  if (!data || !data.data || !data.data.amount) {
    throw new DataFetchError("Invalid response data", "coinbase.com", {
      endpoint: "/v2/prices/spot",
    });
  }
  return { bitcoin: { usd: parseFloat(data.data.amount) } };
}

/**
 * Fetches Bitcoin price from Kraken API.
 * @returns Price data in USD.
 * @throws {DataFetchError} If the API response is invalid.
 */
export async function fetchFromKraken(): Promise<PriceData> {
  const response = await fetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSD");
  const data = await response.json();
  if (!data.result || !data.result.XXBTZUSD || !data.result.XXBTZUSD.c) {
    throw new DataFetchError("Invalid response data", "kraken.com", {
      endpoint: "/0/public/Ticker",
    });
  }
  return { bitcoin: { usd: parseFloat(data.result.XXBTZUSD.c[0]) } };
}

/**
 * Fetches Bitcoin price from Mempool.space API.
 * @returns Price data in USD.
 * @throws {DataFetchError} If the API response is invalid.
 */
export async function fetchFromMempool(): Promise<PriceData> {
  const response = await fetch("https://mempool.space/api/v1/prices");
  const data = await response.json();
  if (!data || typeof data.USD !== "number") {
    throw new DataFetchError("Invalid response data", "mempool.space", {
      endpoint: "/api/v1/prices",
    });
  }
  return { bitcoin: { usd: data.USD } };
}

// Ordered list of price fetcher functions
const priceFetchers = [
  fetchFromCoinbase,
  fetchFromKraken,
  fetchFromMempool,
];

/**
 * Fetches Bitcoin price concurrently from multiple APIs, returning the first successful result.
 * @param fetchers - List of price fetcher functions.
 * @returns Bitcoin price in USD or null if all fail.
 */
export async function getBtcPrice(
  fetchers: Array<() => Promise<PriceData>> = priceFetchers
): Promise<number | null> {
  const promises = fetchers.map(async (fetcher) => {
    const data = await fetcher();
    const price = data.bitcoin?.usd;
    if (typeof price !== "number" || isNaN(price)) {
      throw new DataFetchError(`${fetcher.name} returned invalid price`, "price-fetcher");
    }
    return price;
  });

  return Promise.any(promises).catch(() => {
    console.error("All BTC price fetchers failed");
    return null;
  });
}

/**
 * Price point for historical data
 */
export interface PricePoint {
  timestamp: number;  // Unix milliseconds
  price: number;      // USD
}

/**
 * Time range for historical price data.
 * Limited to 1h/24h due to CoinGecko API rate limits on longer ranges.
 */
export type TimeRange = '1h' | '24h';

/**
 * 24h price statistics
 */
export interface BtcStats {
  price: number;
  change24h: number;
  high24h?: number;
  low24h?: number;
}

/**
 * Maps time range to CoinGecko days parameter
 */
const timeRangeToDays: Record<TimeRange, number> = {
  '1h': 1,
  '24h': 1,
};

/**
 * Maps time range to CoinCap interval parameter
 */
const timeRangeToCoinCapInterval: Record<TimeRange, string> = {
  '1h': 'm5',    // 5 minute intervals
  '24h': 'h1',   // hourly
};

/**
 * Maps time range to milliseconds
 */
const timeRangeToMs: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

/**
 * Keyed caches for price data to avoid rate limits.
 * 10 minute TTL to balance freshness vs API rate limits.
 * Clone functions prevent callers from mutating cached data.
 */
const priceHistoryCache = new KeyedTTLCache<string, PricePoint[]>(
  CacheTTL.VERY_LONG,
  (arr) => arr.map((p) => ({ ...p })) // Deep clone array of price points
);
const statsCache = new KeyedTTLCache<string, BtcStats>(
  CacheTTL.VERY_LONG,
  (stats) => ({ ...stats }) // Shallow clone (no nested objects)
);

function getCacheKey(range: TimeRange, currency: FiatCurrency): string {
  return `${range}-${currency}`;
}

/** Inflight requests for deduplication - prevents duplicate API calls */
const inflightHistory = new Map<string, Promise<PricePoint[]>>();
const inflightStats = new Map<string, Promise<BtcStats | null>>();

/**
 * Fetches historical BTC price data from CoinGecko (supports multiple currencies)
 */
async function fetchHistoryFromCoinGecko(range: TimeRange, currency: FiatCurrency): Promise<PricePoint[]> {
  const days = timeRangeToDays[range];
  const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=${currency}&days=${days}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new DataFetchError(`API error: ${response.status}`, "coingecko.com", {
      endpoint: "/api/v3/coins/bitcoin/market_chart",
      statusCode: response.status,
    });
  }

  const data = await response.json();
  if (!data.prices || !Array.isArray(data.prices)) {
    throw new DataFetchError("Invalid response data", "coingecko.com", {
      endpoint: "/api/v3/coins/bitcoin/market_chart",
    });
  }

  let prices: PricePoint[] = data.prices.map(([timestamp, price]: [number, number]) => ({
    timestamp,
    price,
  }));

  // For 1h range, filter to last hour only
  if (range === '1h') {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    prices = prices.filter(p => p.timestamp >= oneHourAgo);
  }

  return prices;
}

/**
 * Fetches historical BTC price data from CoinCap (USD only)
 */
async function fetchHistoryFromCoinCap(range: TimeRange): Promise<PricePoint[]> {
  const interval = timeRangeToCoinCapInterval[range];
  const now = Date.now();
  const start = now - timeRangeToMs[range];

  const url = `https://api.coincap.io/v2/assets/bitcoin/history?interval=${interval}&start=${start}&end=${now}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new DataFetchError(`API error: ${response.status}`, "coincap.io", {
      endpoint: "/v2/assets/bitcoin/history",
      statusCode: response.status,
    });
  }

  const data = await response.json();
  if (!data.data || !Array.isArray(data.data)) {
    throw new DataFetchError("Invalid response data", "coincap.io", {
      endpoint: "/v2/assets/bitcoin/history",
    });
  }

  return data.data.map((point: { time: number; priceUsd: string }) => ({
    timestamp: point.time,
    price: parseFloat(point.priceUsd),
  }));
}

/**
 * Fetches current BTC price from CoinCap (USD only)
 */
async function fetchStatsFromCoinCap(): Promise<BtcStats> {
  const url = 'https://api.coincap.io/v2/assets/bitcoin';

  const response = await fetch(url);
  if (!response.ok) {
    throw new DataFetchError(`API error: ${response.status}`, "coincap.io", {
      endpoint: "/v2/assets/bitcoin",
      statusCode: response.status,
    });
  }

  const data = await response.json();
  if (!data.data || !data.data.priceUsd) {
    throw new DataFetchError("Invalid response data", "coincap.io", {
      endpoint: "/v2/assets/bitcoin",
    });
  }

  return {
    price: parseFloat(data.data.priceUsd),
    change24h: parseFloat(data.data.changePercent24Hr) || 0,
  };
}

/**
 * Fetches historical BTC price data with fallback sources
 * @param range - Time range for historical data
 * @param currency - Fiat currency for prices (default: usd)
 * @returns Array of price points
 */
export async function getBtcPriceHistory(range: TimeRange, currency: FiatCurrency = 'usd'): Promise<PricePoint[]> {
  const cacheKey = getCacheKey(range, currency);

  // Return cached data if still valid
  const cached = priceHistoryCache.get(cacheKey);
  if (cached !== null) {
    console.log(`[BTC Price] Using cached ${range} data for ${currency}`);
    return cached;
  }

  // Deduplicate concurrent requests - share the same promise
  const inflight = inflightHistory.get(cacheKey);
  if (inflight) {
    console.log(`[BTC Price] Joining inflight request for ${cacheKey}`);
    return inflight;
  }

  console.log(`[BTC Price] Fetching ${range} data for ${currency}`);

  // Create and track the fetch promise
  const fetchPromise = (async (): Promise<PricePoint[]> => {
    // Try CoinGecko first
    try {
      const prices = await fetchHistoryFromCoinGecko(range, currency);
      console.log(`[BTC Price] CoinGecko returned ${prices.length} data points`);
      priceHistoryCache.set(cacheKey, prices);
      return prices;
    } catch (geckoError) {
      console.warn('[BTC Price] CoinGecko failed:', geckoError);

      // Try CoinCap as fallback (USD only)
      if (currency === 'usd') {
        try {
          console.log('[BTC Price] Trying CoinCap fallback...');
          const prices = await fetchHistoryFromCoinCap(range);
          console.log(`[BTC Price] CoinCap returned ${prices.length} data points`);
          priceHistoryCache.set(cacheKey, prices);
          return prices;
        } catch (capError) {
          console.warn('[BTC Price] CoinCap fallback failed:', capError);
        }
      }

      // Return stale cache if available (for stale-while-revalidate pattern)
      const staleData = priceHistoryCache.getStale(cacheKey);
      if (staleData !== null) {
        console.log('[BTC Price] Using stale cache');
        return staleData;
      }

      throw geckoError;
    }
  })();

  inflightHistory.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inflightHistory.delete(cacheKey);
  }
}

/**
 * Fetches current BTC price with 24h statistics with fallback sources
 * @param currency - Fiat currency for prices (default: usd)
 * @returns BTC stats including price and change percentage
 */
export async function getBtc24hStats(currency: FiatCurrency = 'usd'): Promise<BtcStats | null> {
  const cacheKey = `stats-${currency}`;

  // Return cached data if still valid
  const cached = statsCache.get(cacheKey);
  if (cached !== null) {
    console.log(`[BTC Price] Using cached stats for ${currency}`);
    return cached;
  }

  // Deduplicate concurrent requests - share the same promise
  const inflight = inflightStats.get(cacheKey);
  if (inflight) {
    console.log(`[BTC Price] Joining inflight stats request for ${cacheKey}`);
    return inflight;
  }

  // Create and track the fetch promise
  const fetchPromise = (async (): Promise<BtcStats | null> => {
    // Try CoinGecko first
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${currency}&include_24hr_change=true`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new DataFetchError(`API error: ${response.status}`, "coingecko.com", {
          endpoint: "/api/v3/simple/price",
          statusCode: response.status,
        });
      }

      const data = await response.json();
      if (!data.bitcoin) {
        throw new DataFetchError("Invalid response data", "coingecko.com", {
          endpoint: "/api/v3/simple/price",
        });
      }

      const stats: BtcStats = {
        price: data.bitcoin[currency],
        change24h: data.bitcoin[`${currency}_24h_change`],
      };

      statsCache.set(cacheKey, stats);
      return stats;
    } catch (geckoError) {
      console.warn('[BTC Price] CoinGecko stats failed:', geckoError);

      // Try CoinCap as fallback (USD only)
      if (currency === 'usd') {
        try {
          console.log('[BTC Price] Trying CoinCap stats fallback...');
          const stats = await fetchStatsFromCoinCap();
          statsCache.set(cacheKey, stats);
          return stats;
        } catch (capError) {
          console.warn('[BTC Price] CoinCap stats fallback failed:', capError);
        }
      }

      // Return stale cache if available (for stale-while-revalidate pattern)
      const staleData = statsCache.getStale(cacheKey);
      if (staleData !== null) {
        console.log('[BTC Price] Using stale stats cache');
        return staleData;
      }

      return null;
    }
  })();

  inflightStats.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inflightStats.delete(cacheKey);
  }
}
