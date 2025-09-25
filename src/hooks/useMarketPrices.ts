import { useState, useEffect } from 'react';
import { getBtcPrice } from '@/utils/blockchain/bitcoin/price';
import { getXCPPrice } from '@/utils/blockchain/counterparty/price';

interface MarketPrices {
  btc: number | null;
  xcp: number | null;
}

interface MarketPricesState extends MarketPrices {
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch BTC and XCP prices for the market page
 * Only fetches when called (no background polling)
 */
export const useMarketPrices = () => {
  const [state, setState] = useState<MarketPricesState>({
    btc: null,
    xcp: null,
    loading: true,
    error: null,
  });

  const fetchPrices = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // First fetch BTC price
      const btcPrice = await getBtcPrice();

      // Then fetch XCP price, passing BTC price for dex-trade fallback
      const xcpPrice = await getXCPPrice(btcPrice);

      setState({
        btc: btcPrice,
        xcp: xcpPrice,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to fetch market prices',
      }));
    }
  };

  // Fetch prices on mount
  useEffect(() => {
    fetchPrices();
  }, []);

  return {
    ...state,
    refetch: fetchPrices,
  };
};