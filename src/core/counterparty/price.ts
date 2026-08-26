import type { PricePoint } from "@/core/bitcoin/price";
import { DataFetchError } from "@/core/errors";
import { toFiniteNumber } from "@/core/numeric";

/**
 * Interface for XCP price data response from xcp.io API.
 */
interface XCPApiResponse {
  result: {
    xcp: {
      usd: number;
      change_pct: number | null;
    } | null;
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
  const response = await fetch("https://api.xcp.io/v2/price/ticker");
  if (!response.ok) {
    throw new DataFetchError("Failed to fetch XCP price", "xcp.io", {
      endpoint: "/v2/price/ticker",
      statusCode: response.status,
    });
  }
  const data: XCPApiResponse = await response.json();

  if (!data.result?.xcp || typeof data.result.xcp.usd !== "number") {
    throw new DataFetchError("Invalid response data", "xcp.io", {
      endpoint: "/v2/price/ticker",
    });
  }

  const price = data.result.xcp.usd;
  if (!Number.isFinite(price) || price <= 0) {
    throw new DataFetchError("Invalid XCP price value", "xcp.io", {
      endpoint: "/v2/price/ticker",
    });
  }

  return {
    xcp: {
      usd: price,
    },
  };
}

/**
 * Fetches XCP price from dex-trade.com API (XCP/BTC pair).
 * Requires BTC price to convert to USD.
 * @param {number} btcPriceUsd - Current BTC price in USD.
 * @returns {Promise<XCPPriceData>} Price data in USD.
 * @throws {DataFetchError} If the API response is invalid.
 */
export async function fetchFromDexTrade(
  btcPriceUsd: number,
): Promise<XCPPriceData> {
  const response = await fetch(
    "https://api.dex-trade.com/v1/public/ticker?pair=XCPBTC",
  );
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

  const xcpBtcPrice = toFiniteNumber(data.data.last);
  if (xcpBtcPrice === undefined) {
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
    },
  };
}

/**
 * Current XCP price statistics from the xcp.io ticker.
 */
export interface XcpStats {
  price: number;
  change24h: number | null;
}

/**
 * Fetches current XCP price and 24h change from the xcp.io ticker.
 * @returns {Promise<XcpStats | null>} Stats or null if unavailable.
 */
export async function getXcpStats(): Promise<XcpStats | null> {
  try {
    const data = await fetchTickerResponse();
    const xcp = data.result?.xcp;
    if (!xcp || !Number.isFinite(xcp.usd) || xcp.usd <= 0) return null;
    return {
      price: xcp.usd,
      change24h: typeof xcp.change_pct === "number" ? xcp.change_pct : null,
    };
  } catch (err) {
    console.error("Failed to fetch XCP ticker:", err);
    return null;
  }
}

async function fetchTickerResponse(): Promise<XCPApiResponse> {
  const response = await fetch("https://api.xcp.io/v2/price/ticker");
  if (!response.ok) {
    throw new DataFetchError("Failed to fetch XCP price", "xcp.io", {
      endpoint: "/v2/price/ticker",
      statusCode: response.status,
    });
  }
  return response.json();
}

/**
 * Interface for the xcp.io /v2/price daily history response (fields we use).
 */
interface XCPPricePageResponse {
  result: {
    sats: { price_btc: number; day: string } | null;
    ath: { day: string; usd: number } | null;
    history: Array<{ day: string; usd: number }>;
  };
}

/**
 * XCP daily price history with supporting stats.
 */
export interface XcpPriceHistoryData {
  history: PricePoint[];
  satsPerXcp: number | null;
  ath: { usd: number; day: string } | null;
}

/**
 * Fetches the full daily XCP/USD price history from xcp.io.
 * @returns {Promise<XcpPriceHistoryData>} Daily price points (ascending) plus sats rate and ATH.
 * @throws {DataFetchError} If the API response is invalid.
 */
export async function getXcpPriceHistory(): Promise<XcpPriceHistoryData> {
  const response = await fetch("https://api.xcp.io/v2/price");
  if (!response.ok) {
    throw new DataFetchError("Failed to fetch XCP price history", "xcp.io", {
      endpoint: "/v2/price",
      statusCode: response.status,
    });
  }
  const data: XCPPricePageResponse = await response.json();

  if (!Array.isArray(data.result?.history)) {
    throw new DataFetchError("Invalid response data", "xcp.io", {
      endpoint: "/v2/price",
    });
  }

  const history: PricePoint[] = data.result.history
    .filter((row) => typeof row.usd === "number" && Number.isFinite(row.usd))
    .map((row) => ({
      timestamp: Date.parse(`${row.day}T00:00:00Z`),
      price: row.usd,
    }))
    .filter((point) => Number.isFinite(point.timestamp));

  const satsBtc = data.result.sats?.price_btc;

  return {
    history,
    satsPerXcp:
      typeof satsBtc === "number" && Number.isFinite(satsBtc) && satsBtc > 0
        ? satsBtc * 1e8
        : null,
    ath: data.result.ath ?? null,
  };
}

// Future: Add more XCP price sources here if needed. Order is preference order.
const xcpPriceFetchers = [fetchFromXCPIO];

/**
 * XCP price in USD, from the first source that answers with a usable quote.
 *
 * Tried IN ORDER, and that ordering is the point. This used to race every
 * source with Promise.any, which resolves with the first to FULFIL rather than
 * the first in the list — so the Dex-Trade leg, described here as a fallback,
 * won whenever it answered before xcp.io. Non-deterministic by construction,
 * and it silently swapped the source of a price the user is shown.
 *
 * The two do not agree, so which one wins matters. xcp.io's ticker prices XCP
 * from executions on its own chain — dispenser fills and DEX order matches,
 * the venues where XCP actually changes hands. Dex-Trade is a single exchange
 * whose XCP/BTC pair has cleared no meaningful volume in months, and it has
 * been printing on the order of a third below the chain. Racing them meant the
 * extension showed one number or the other depending on which host was quicker
 * to respond, which reads to a user as the price flickering.
 *
 * Dex-Trade stays as a genuine last resort, reached only if every canonical
 * source has failed, because a stale cross-rate beats no price at all. It
 * needs BTC/USD to convert its XCP/BTC quote, so it is skipped without one.
 */
export async function getXCPPrice(
  btcPriceUsd?: number | null,
): Promise<number | null> {
  const usable = (price: unknown): price is number =>
    typeof price === "number" && Number.isFinite(price) && price > 0;

  for (const fetcher of xcpPriceFetchers) {
    try {
      const { xcp } = await fetcher();
      if (usable(xcp?.usd)) return xcp.usd;
    } catch {
      // Fall through to the next source; a failure here is not the answer.
    }
  }

  if (usable(btcPriceUsd)) {
    try {
      const { xcp } = await fetchFromDexTrade(btcPriceUsd);
      if (usable(xcp?.usd)) return xcp.usd;
    } catch {
      // Nothing left to try.
    }
  }

  console.error("All XCP price fetchers failed");
  return null;
}
