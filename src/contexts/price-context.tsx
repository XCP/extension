import React, { createContext, useState, useEffect, type ReactNode } from "react";
import { getBtcPrice } from "@/utils/blockchain/bitcoin";

/**
 * Context value for BTC price data.
 */
interface PriceContextValue {
  btcPrice: number | null;
  error: string | null;
}

const PriceContext = createContext<PriceContextValue | undefined>(undefined);

// Cache for BTC price with 5-minute TTL
let cachedPrice: { value: number; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Provides BTC price context to the application, fetching every 5 minutes with caching.
 * @param {Object} props - Component props.
 * @param {ReactNode} props.children - Child components.
 * @returns {React.ReactElement} Context provider component.
 */
export const PriceProvider = ({ children }: { children: ReactNode }): React.ReactElement => {
  const [btcPrice, setBtcPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPrice = async () => {
    // Check cache first
    if (cachedPrice && Date.now() - cachedPrice.timestamp < CACHE_TTL) {
      setBtcPrice(cachedPrice.value);
      setError(null);
      return;
    }

    const price = await getBtcPrice();
    if (price !== null) {
      cachedPrice = { value: price, timestamp: Date.now() };
      setBtcPrice(price);
      setError(null);
    } else {
      setBtcPrice(null);
      setError("Failed to fetch BTC price");
    }
  };

  useEffect(() => {
    fetchPrice();
    const intervalId = setInterval(fetchPrice, CACHE_TTL); // Fetch every 5 minutes
    return () => clearInterval(intervalId);
  }, []);

  return (
    <PriceContext value={{ btcPrice, error }}>
      {children}
    </PriceContext>
  );
};

/**
 * Hook to access BTC price context.
 * @returns {PriceContextValue} Current BTC price and error state.
 * @throws {Error} If used outside a PriceProvider.
 */
export const usePrices = (): PriceContextValue => {
  const context = React.useContext(PriceContext);
  if (!context) {
    throw new Error("usePrices must be used within a PriceProvider");
  }
  return context;
};
