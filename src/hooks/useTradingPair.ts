import { useEffect, useState } from "react";

/**
 * Trading pair data from the canonical xcp.io API.
 */
export interface TradingPairData {
  last_trade_price: string | null;
  name: string;
}

/**
 * Hook for fetching trading pair data from api.xcp.io
 *
 * @param giveAsset - The asset being given/sold
 * @param getAsset - The asset being received/bought
 * @returns Trading pair data with last trade price
 *
 * @example
 * // For dispenser (asset -> BTC)
 * const { data } = useTradingPair('PEPECASH', 'BTC');
 *
 * // For order
 * const { data } = useTradingPair(isBuy ? quoteAsset : giveAsset, isBuy ? giveAsset : quoteAsset);
 */
export function useTradingPair(
  giveAsset: string | undefined,
  getAsset: string | undefined,
) {
  const [data, setData] = useState<TradingPairData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!giveAsset || !getAsset) {
      setData(null);
      return;
    }

    const fetchTradingPair = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `https://api.xcp.io/v2/markets/${encodeURIComponent(giveAsset)}/${encodeURIComponent(getAsset)}`,
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch trading pair: ${response.status}`);
        }
        const json = await response.json();
        const lastTradePrice =
          json?.result?.lastPrice != null
            ? String(json.result.lastPrice)
            : null;
        const tradingPairName = json?.result
          ? `${json.result.baseAsset}/${json.result.quoteAsset}`
          : "";

        setData((prev) => {
          // Only update if data changed to prevent unnecessary re-renders
          if (
            prev?.last_trade_price === lastTradePrice &&
            prev?.name === tradingPairName
          ) {
            return prev;
          }
          return { last_trade_price: lastTradePrice, name: tradingPairName };
        });
      } catch (err) {
        console.error("Failed to fetch trading pair data:", err);
        setError(
          err instanceof Error
            ? err
            : new Error("Failed to fetch trading pair"),
        );
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTradingPair();
  }, [giveAsset, getAsset]);

  return { data, isLoading, error };
}
