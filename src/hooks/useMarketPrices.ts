import { useState, useEffect } from 'react';
import { getBtcPrice, getBtc24hStats, type FiatCurrency } from '@/utils/blockchain/bitcoin/price';
import { getXCPPrice } from '@/utils/blockchain/counterparty/price';

interface MarketPrices {
  btc: number | null;
  xcp: number | null;
  currency: FiatCurrency;
}

interface MarketPricesState extends MarketPrices {
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch BTC and XCP prices for the market page
 * @param currency - Fiat currency to use (default: 'usd')
 *
 * For USD: Uses getBtcPrice() with Coinbase/Kraken/Mempool fallback (most reliable)
 * For non-USD: Uses getBtc24hStats() from CoinGecko (only option for other currencies)
 *
 * XCP prices are fetched in USD and converted to target currency using BTC ratio
 */
export const useMarketPrices = (currency: FiatCurrency = 'usd') => {
  const [state, setState] = useState<MarketPricesState>({
    btc: null,
    xcp: null,
    currency,
    loading: true,
    error: null,
  });

  const fetchPrices = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      let btcPrice: number | null = null;
      let xcpPrice: number | null = null;

      if (currency === 'usd') {
        // For USD: Use multi-source fallback (most reliable)
        btcPrice = await getBtcPrice();
        // XCP price in USD directly
        xcpPrice = await getXCPPrice(btcPrice);
      } else {
        // For non-USD: Fetch BTC price in target currency from CoinGecko
        const btcStats = await getBtc24hStats(currency);
        btcPrice = btcStats?.price ?? null;

        // XCP: Get USD prices first, then convert
        // XCP APIs only return USD, so we need to convert
        const btcPriceUsd = await getBtcPrice();
        const xcpPriceUsd = await getXCPPrice(btcPriceUsd);

        if (xcpPriceUsd && btcPriceUsd && btcPrice) {
          // Convert XCP/USD to XCP/fiat using exchange rate derived from BTC
          // XCP/fiat = XCP/USD * (BTC/fiat / BTC/USD)
          xcpPrice = xcpPriceUsd * (btcPrice / btcPriceUsd);
        }
      }

      setState({
        btc: btcPrice,
        xcp: xcpPrice,
        currency,
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

  // Fetch prices on mount and when currency changes
  useEffect(() => {
    fetchPrices();
  }, [currency]);

  return {
    ...state,
    refetch: fetchPrices,
  };
};
