import { DataFetchError } from '@/utils/blockchain/errors';

/**
 * Interface for XCP price data response from xcp.io API.
 */
interface XCPApiResponse {
  data: {
    last_trade_price_usd: string;
    market_cap_usd?: string;
    volume_24h_usd?: string;
  };
}

/**
 * Interface for XCP/BTC price data response from dex-trade.com API.
 */
interface DexTradeApiResponse {
  status: boolean;
  data: {
    pair: string;
    last: string;
    volume_24H: string;
    high: string;
    low: string;
  };
}

/**
 * Interface for XCP price data.
 */
export interface XCPPriceData {
  xcp: {
    usd: number;
    market_cap_usd?: number;
    volume_24h_usd?: number;
  };
}

/**
 * Fetches XCP price from xcp.io API.
 * @returns {Promise<XCPPriceData>} Price data in USD with optional market data.
 * @throws {DataFetchError} If the API response is invalid.
 */
export async function fetchFromXCPIO(): Promise<XCPPriceData> {
  const response = await fetch("https://app.xcp.io/api/v1/asset/XCP");
  if (!response.ok) {
    throw new DataFetchError("Failed to fetch XCP price", "xcp.io", {
      endpoint: "/api/v1/asset/XCP",
      statusCode: response.status,
    });
  }
  const data: XCPApiResponse = await response.json();

  if (!data.data?.last_trade_price_usd) {
    throw new DataFetchError("Invalid response data", "xcp.io", {
      endpoint: "/api/v1/asset/XCP",
    });
  }

  const price = parseFloat(data.data.last_trade_price_usd);
  if (isNaN(price)) {
    throw new DataFetchError("Invalid XCP price value", "xcp.io", {
      endpoint: "/api/v1/asset/XCP",
    });
  }

  return {
    xcp: {
      usd: price,
      market_cap_usd: data.data.market_cap_usd ? parseFloat(data.data.market_cap_usd) : undefined,
      volume_24h_usd: data.data.volume_24h_usd ? parseFloat(data.data.volume_24h_usd) : undefined,
    }
  };
}

/**
 * Fetches XCP price from dex-trade.com API (XCP/BTC pair).
 * Requires BTC price to convert to USD.
 * @param {number} btcPriceUsd - Current BTC price in USD.
 * @returns {Promise<XCPPriceData>} Price data in USD.
 * @throws {DataFetchError} If the API response is invalid.
 */
export async function fetchFromDexTrade(btcPriceUsd: number): Promise<XCPPriceData> {
  const response = await fetch("https://api.dex-trade.com/v1/public/ticker?pair=XCPBTC");
  if (!response.ok) {
    throw new DataFetchError("Failed to fetch XCP/BTC price", "dex-trade.com", {
      endpoint: "/v1/public/ticker",
      statusCode: response.status,
    });
  }
  const data: DexTradeApiResponse = await response.json();

  if (!data.status || !data.data?.last) {
    throw new DataFetchError("Invalid response data", "dex-trade.com", {
      endpoint: "/v1/public/ticker",
    });
  }

  const xcpBtcPrice = parseFloat(data.data.last);
  if (isNaN(xcpBtcPrice)) {
    throw new DataFetchError("Invalid XCP/BTC price value", "dex-trade.com", {
      endpoint: "/v1/public/ticker",
    });
  }

  // Convert XCP/BTC price to USD using BTC price
  const xcpUsdPrice = xcpBtcPrice * btcPriceUsd;

  return {
    xcp: {
      usd: xcpUsdPrice,
      // Could add volume data if needed: volume_24h_usd: parseFloat(data.data.volume_24H) * btcPriceUsd
    }
  };
}

// Future: Add more XCP price sources here if needed
const xcpPriceFetchers = [
  fetchFromXCPIO,
  // fetchFromDexTrade requires BTC price, so it's handled separately in getXCPPrice
];

/**
 * Fetches XCP price from available APIs, returning the first successful result.
 * Includes fallback to dex-trade.com using BTC price conversion.
 * @param {number | null} btcPriceUsd - Optional BTC price for dex-trade fallback.
 * @returns {Promise<number | null>} XCP price in USD or null if all fail.
 */
export async function getXCPPrice(btcPriceUsd?: number | null): Promise<number | null> {
  // First try direct USD fetchers
  const directFetcherPromises = xcpPriceFetchers.map(async (fetcher) => {
    const data = await fetcher();
    const price = data.xcp?.usd;
    if (typeof price !== "number" || isNaN(price)) {
      throw new DataFetchError(`${fetcher.name} returned invalid XCP price`, "xcp-price");
    }
    return price;
  });

  // If BTC price is available, add dex-trade as fallback
  if (btcPriceUsd && typeof btcPriceUsd === "number") {
    const dexTradePromise = (async () => {
      const data = await fetchFromDexTrade(btcPriceUsd);
      const price = data.xcp?.usd;
      if (typeof price !== "number" || isNaN(price)) {
        throw new DataFetchError("fetchFromDexTrade returned invalid XCP price", "dex-trade.com");
      }
      return price;
    })();

    directFetcherPromises.push(dexTradePromise);
  }

  return Promise.any(directFetcherPromises).catch(() => {
    console.error("All XCP price fetchers failed");
    return null;
  });
}