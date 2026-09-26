import { useCallback, useEffect, useRef, useState } from 'react';
import { type FiatCurrency, getBtc24hStats, getBtcPrice } from '@/core/bitcoin/price';
import { getXCPPrice } from '@/core/counterparty/price';

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
  const requestVersion = useRef(0);
  const [state, setState] = useState<MarketPricesState>({
    btc: null,
    xcp: null,
    currency,
    loading: true,
    error: null,
  });

  const fetchPrices = useCallback(async () => {
    const version = ++requestVersion.current;
    setState({ btc: null, xcp: null, currency, loading: true, error: null });

    try {
      let btcPrice: number | null = null;
      let xcpPrice: number | null = null;

      // Every request starts at once. The BTC/USD quote is handed to the XCP lookup as a pending
      // promise because only its last-resort source needs it; xcp.io does not wait for BTC. Both
      // quotes are cached for a minute and shared, so a screen calling this hook twice costs one
      // request per source.
      const btcUsdRequest = getBtcPrice();
      const xcpUsdRequest = getXCPPrice(btcUsdRequest);

      if (currency === 'usd') {
        [btcPrice, xcpPrice] = await Promise.all([btcUsdRequest, xcpUsdRequest]);
      } else {
        // For non-USD: BTC in the target currency comes from CoinGecko (the only source for
        // other currencies). XCP APIs only return USD, so XCP is converted through the BTC ratio.
        const [btcStats, btcPriceUsd, xcpPriceUsd] = await Promise.all([
          getBtc24hStats(currency),
          btcUsdRequest,
          xcpUsdRequest,
        ]);
        btcPrice = btcStats?.price ?? null;

        if (xcpPriceUsd && btcPriceUsd && btcPrice) {
          // Convert XCP/USD to XCP/fiat using exchange rate derived from BTC
          // XCP/fiat = XCP/USD * (BTC/fiat / BTC/USD)
          xcpPrice = xcpPriceUsd * (btcPrice / btcPriceUsd);
        }
      }

      if (version !== requestVersion.current) return;
      setState({
        btc: btcPrice,
        xcp: xcpPrice,
        currency,
        loading: false,
        error: null,
      });
    } catch (_error) {
      if (version !== requestVersion.current) return;
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to fetch market prices',
      }));
    }
  }, [currency]);

  // Quotes belong to one currency and one request; late answers cannot relabel an old price.
  useEffect(() => {
    void fetchPrices();
    return () => { requestVersion.current += 1; };
  }, [fetchPrices]);

  return {
    ...(state.currency === currency ? state : { btc: null, xcp: null, currency, loading: true, error: null }),
    refetch: fetchPrices,
  };
};
