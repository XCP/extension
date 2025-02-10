import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useToast } from '@/contexts/toast-context';
import { fetchFromCoinGecko, fetchFromBinance, fetchFromCoinbase } from '@/utils/blockchain/bitcoin';

interface PriceData {
  bitcoin: { usd: number };
}

interface PriceContextValue {
  btcPrice: number | null;
}

const PriceContext = createContext<PriceContextValue | undefined>(undefined);

// Ordered list of fetchers for fallback
const priceFetchers: Array<() => Promise<PriceData>> = [
  fetchFromCoinGecko,
  fetchFromBinance,
  fetchFromCoinbase,
];

/**
 * Attempts to fetch BTC price from multiple APIs sequentially.
 * @param fetchers Array of fetcher functions.
 * @param showError Function to display error messages.
 * @returns The first successful BTC price or null if all fetchers fail.
 */
const getFirstSuccessfulPrice = async (
  fetchers: Array<() => Promise<PriceData>>,
  showError: (message: string) => void
): Promise<number | null> => {
  for (const fetcher of fetchers) {
    try {
      const data = await fetcher();
      const price = data.bitcoin?.usd;
      if (typeof price === 'number') {
        return price;
      }
    } catch (error) {
      // Silently continue to next fetcher
      continue;
    }
  }
  // Only show error if all sources failed
  showError('Unable to fetch Bitcoin price.');
  return null;
};

export const PriceProvider = ({ children }: { children: ReactNode }) => {
  const [btcPrice, setBtcPrice] = useState<number | null>(null);
  const { showError } = useToast();

  const updatePrices = () => {
    getFirstSuccessfulPrice(priceFetchers, showError)
      .then(setBtcPrice)
      .catch(() => setBtcPrice(null));
  };

  useEffect(() => {
    updatePrices(); // Initial fetch
    const intervalId = setInterval(updatePrices, 60000); // Refresh every 60 seconds
    return () => clearInterval(intervalId); // Cleanup on unmount
  }, []);

  return (
    <PriceContext value={{ btcPrice }}>
      {children}
    </PriceContext>
  );
};

export const usePrices = () => {
  const context = useContext(PriceContext);
  if (!context) {
    throw new Error('usePrices must be used within a PriceProvider');
  }
  return context;
};
