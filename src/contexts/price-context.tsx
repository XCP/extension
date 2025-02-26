import React, { createContext, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { fetchFromCoinGecko, fetchFromBinance, fetchFromCoinbase } from "@/utils/blockchain/bitcoin";

/**
 * Shape of price data from APIs.
 */
interface PriceData {
  bitcoin: { usd: number };
}

/**
 * Context value for price data.
 */
interface PriceContextValue {
  btcPrice: number | null;
}

const PriceContext = createContext<PriceContextValue | undefined>(undefined);

const priceFetchers: Array<() => Promise<PriceData>> = [
  fetchFromCoinGecko,
  fetchFromBinance,
  fetchFromCoinbase,
];

/**
 * Fetches BTC price from multiple sources with fallback.
 * @param {Array<() => Promise<PriceData>>} fetchers - List of price fetcher functions
 * @returns {Promise<number | null>} BTC price or null if all fail
 */
const getFirstSuccessfulPrice = async (
  fetchers: Array<() => Promise<PriceData>>
): Promise<number | null> => {
  for (const fetcher of fetchers) {
    try {
      const data = await fetcher();
      const price = data.bitcoin?.usd;
      if (typeof price === "number") return price;
    } catch {
      continue;
    }
  }
  return null;
};

/**
 * Provides BTC price context to the application using React 19's <Context>.
 * @param {Object} props - Component props
 * @param {ReactNode} props.children - Child components
 * @returns {ReactElement} Context provider
 */
export const PriceProvider = ({ children }: { children: ReactNode }): ReactElement => {
  const [btcPrice, setBtcPrice] = useState<number | null>(null);

  const updatePrices = () => {
    getFirstSuccessfulPrice(priceFetchers)
      .then(setBtcPrice)
      .catch(() => setBtcPrice(null));
  };

  useEffect(() => {
    updatePrices();
    const intervalId = setInterval(updatePrices, 60_000);
    return () => clearInterval(intervalId);
  }, []);

  return <PriceContext value={{ btcPrice }}>{children}</PriceContext>;
};

/**
 * Hook to access price context using React 19's `use`.
 * @returns {PriceContextValue} Price context value
 * @throws {Error} If used outside PriceProvider
 */
export const usePrices = (): PriceContextValue => {
  const context = React.use(PriceContext);
  if (!context) {
    throw new Error("usePrices must be used within a PriceProvider");
  }
  return context;
};
