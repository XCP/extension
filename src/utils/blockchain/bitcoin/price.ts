/**
 * Interface for a price data object.
 */
interface PriceData {
  bitcoin: { usd: number };
}

/**
 * Fetches the Bitcoin price in USD from CoinGecko.
 *
 * @returns A Promise that resolves to a PriceData object.
 * @throws Error if the response is invalid.
 */
export const fetchFromCoinGecko = async (): Promise<PriceData> => {
  const response = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
  );
  const data = await response.json();
  if (!data.bitcoin || typeof data.bitcoin.usd !== 'number') {
    throw new Error('Invalid data format from CoinGecko');
  }
  return data;
};

/**
 * Fetches the Bitcoin price from Binance.
 *
 * @returns A Promise that resolves to a PriceData object.
 * @throws Error if the response is invalid.
 */
export const fetchFromBinance = async (): Promise<PriceData> => {
  const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
  const data = await response.json();
  if (!data || !data.price) {
    throw new Error('Invalid data from Binance');
  }
  return {
    bitcoin: { usd: parseFloat(data.price) },
  };
};

/**
 * Fetches the Bitcoin price from Coinbase.
 *
 * @returns A Promise that resolves to a PriceData object.
 * @throws Error if the response is invalid.
 */
export const fetchFromCoinbase = async (): Promise<PriceData> => {
  const response = await fetch('https://api.coinbase.com/v2/prices/spot?currency=USD');
  const data = await response.json();
  if (!data || !data.data || !data.data.amount) {
    throw new Error('Invalid data from Coinbase');
  }
  return {
    bitcoin: { usd: parseFloat(data.data.amount) },
  };
};
