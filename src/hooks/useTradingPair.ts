import { useEffect, useState } from "react";
import { fetchTradingPair, type TradingPairData } from "@/core/counterparty/price";

export type { TradingPairData };

/** A finished read, tagged with the pair it answers for. */
interface TradingPairResult {
  key: string;
  data: TradingPairData | null;
  error: Error | null;
}

/**
 * Hook for fetching trading pair data from api.xcp.io
 *
 * Answers only for the pair asked about on this render. Switching asset or side (buy/sell) used to
 * leave the previous pair's price in place while the new one loaded, and let a late answer for the
 * old pair replace the new one — so the price input's "suggest" could fill in another pair's price.
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
  const key = giveAsset && getAsset ? JSON.stringify([giveAsset, getAsset]) : null;
  const [result, setResult] = useState<TradingPairResult | null>(null);

  useEffect(() => {
    if (!key || !giveAsset || !getAsset) return;
    const controller = new AbortController();

    fetchTradingPair(giveAsset, getAsset, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key, data, error: null });
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch trading pair data:", err);
        setResult({
          key,
          data: null,
          error: err instanceof Error ? err : new Error("Failed to fetch trading pair"),
        });
      },
    );

    return () => controller.abort();
  }, [key, giveAsset, getAsset]);

  const own = key && result?.key === key ? result : null;
  return {
    data: own?.data ?? null,
    isLoading: key !== null && own === null,
    error: own?.error ?? null,
  };
}
