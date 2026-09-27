import { useEffect, useState } from "react";
import { parseAmountDraft } from "@/core/amount-contract/amounts";
import {
  fetchPoolDepositQuote,
  fetchPoolQuote,
  fetchPoolWithdrawQuote,
  type PoolDepositQuote,
  type PoolQuote,
  type PoolWithdrawQuote,
} from "@/core/counterparty/api";

interface PoolQuoteState<T> {
  data: T | null;
  requestKey?: string;
  isLoading: boolean;
  error: string | null;
}

const QUOTE_DEBOUNCE_MS = 300;

/** The draft as a base-unit string, or null while it is not a positive amount. */
function parseRawQuantity(quantity: string, divisible: boolean): string | null {
  const parsed = parseAmountDraft(quantity, { decimals: divisible ? 8 : 0, minRaw: 1n });
  return parsed.status === "valid" ? parsed.raw.toString() : null;
}

/**
 * Fetches a quote for one pool pair 300 ms after the inputs settle. Each result is tagged with the
 * inputs it answers, so a quote for a previous draft is never returned for the current one.
 */
function useDebouncedPoolQuote<T>(
  fetchQuote: (assetA: string, assetB: string, raw: string) => Promise<T>,
  assetA: string,
  assetB: string,
  raw: string | null,
  enabled: boolean,
  fallbackError: string
): PoolQuoteState<T> {
  const requestKey = JSON.stringify([assetA, assetB, raw, enabled]);
  const [state, setState] = useState<PoolQuoteState<T>>({
    data: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled || raw === null) {
      setState({ data: null, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ data: null, isLoading: true, error: null });

    const timer = setTimeout(() => {
      fetchQuote(assetA, assetB, raw)
        .then((data) => {
          if (!cancelled) setState({ data, isLoading: false, error: null, requestKey });
        })
        .catch((err) => {
          if (!cancelled) {
            setState({
              data: null,
              isLoading: false,
              error: err instanceof Error ? err.message : fallbackError,
            });
          }
        });
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchQuote, assetA, assetB, enabled, raw, requestKey, fallbackError]);

  // Never expose a previous draft's quote, even during the render before effect cleanup.
  if (!enabled || raw === null) return { data: null, isLoading: false, error: null };
  return state.requestKey === requestKey ? state : { data: null, isLoading: state.isLoading, error: state.error };
}

export function usePoolDepositQuote({
  assetA,
  assetB,
  quantityA,
  isAssetADivisible,
  enabled,
}: {
  assetA: string;
  assetB: string;
  quantityA: string;
  isAssetADivisible: boolean;
  enabled: boolean;
}): PoolQuoteState<PoolDepositQuote> {
  return useDebouncedPoolQuote(
    fetchPoolDepositQuote,
    assetA,
    assetB,
    parseRawQuantity(quantityA, isAssetADivisible),
    enabled,
    "Unable to load pool quote."
  );
}

/**
 * Debounced swap quote: how much of getAsset you would receive right now for
 * selling `quantity` of giveAsset, routed across the AMM pool and the resting
 * order book (core's /v2/pools/<give>/<get>/quote endpoint).
 */
export function usePoolSwapQuote({
  giveAsset,
  getAsset,
  quantity,
  isGiveDivisible,
  enabled,
}: {
  giveAsset: string;
  getAsset: string;
  quantity: string;
  isGiveDivisible: boolean;
  enabled: boolean;
}): PoolQuoteState<PoolQuote> {
  return useDebouncedPoolQuote(
    fetchPoolQuote,
    giveAsset,
    getAsset,
    parseRawQuantity(quantity, isGiveDivisible),
    enabled,
    "Unable to load swap quote."
  );
}

/** The withdrawal quantity is an LP-share amount, parsed to 8 decimals. */
export function usePoolWithdrawQuote({
  assetA,
  assetB,
  quantity,
  enabled,
}: {
  assetA: string;
  assetB: string;
  quantity: string;
  enabled: boolean;
}): PoolQuoteState<PoolWithdrawQuote> {
  return useDebouncedPoolQuote(
    fetchPoolWithdrawQuote,
    assetA,
    assetB,
    parseRawQuantity(quantity, true),
    enabled,
    "Unable to load withdrawal quote."
  );
}
