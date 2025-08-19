/**
 * Interface for Bitcoin price data.
 */
export interface PriceData {
  bitcoin: { usd: number };
}

/**
 * Fetches Bitcoin price from Coinbase API.
 * @returns {Promise<PriceData>} Price data in USD.
 * @throws {Error} If the API response is invalid.
 */
export const fetchFromCoinbase = async (): Promise<PriceData> => {
  const response = await fetch("https://api.coinbase.com/v2/prices/spot?currency=USD");
  const data = await response.json();
  if (!data || !data.data || !data.data.amount) {
    throw new Error("Invalid data from Coinbase");
  }
  return { bitcoin: { usd: parseFloat(data.data.amount) } };
};

/**
 * Fetches Bitcoin price from Kraken API.
 * @returns {Promise<PriceData>} Price data in USD.
 * @throws {Error} If the API response is invalid.
 */
export const fetchFromKraken = async (): Promise<PriceData> => {
  const response = await fetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSD");
  const data = await response.json();
  if (!data.result || !data.result.XXBTZUSD || !data.result.XXBTZUSD.c) {
    throw new Error("Invalid data from Kraken");
  }
  return { bitcoin: { usd: parseFloat(data.result.XXBTZUSD.c[0]) } };
};

/**
 * Fetches Bitcoin price from Mempool.space API.
 * @returns {Promise<PriceData>} Price data in USD.
 * @throws {Error} If the API response is invalid.
 */
export const fetchFromMempool = async (): Promise<PriceData> => {
  const response = await fetch("https://mempool.space/api/v1/prices");
  const data = await response.json();
  if (!data || typeof data.USD !== "number") {
    throw new Error("Invalid data from Mempool.space");
  }
  return { bitcoin: { usd: data.USD } };
};

// Ordered list of price fetcher functions
const priceFetchers = [
  fetchFromCoinbase,
  fetchFromKraken,
  fetchFromMempool,
];

/**
 * Fetches Bitcoin price concurrently from multiple APIs, returning the first successful result.
 * @param {Array<() => Promise<PriceData>>} fetchers - List of price fetcher functions.
 * @returns {Promise<number | null>} Bitcoin price in USD or null if all fail.
 */
export const getBtcPrice = async (
  fetchers: Array<() => Promise<PriceData>> = priceFetchers
): Promise<number | null> => {
  const promises = fetchers.map(async (fetcher) => {
    const data = await fetcher();
    const price = data.bitcoin?.usd;
    if (typeof price !== "number" || isNaN(price)) throw new Error(`${fetcher.name} returned invalid price`);
    return price;
  });

  return Promise.any(promises).catch(() => {
    console.error("All BTC price fetchers failed");
    return null;
  });
};
