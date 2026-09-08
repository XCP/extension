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
  const parsed = parseAmountDraft(quantityA, { decimals: isAssetADivisible ? 8 : 0, minRaw: 1n });
  const raw = parsed.status === "valid" ? parsed.raw.toString() : null;
  const requestKey = JSON.stringify([assetA, assetB, raw, enabled]);
  const [state, setState] = useState<PoolQuoteState<PoolDepositQuote>>({
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
      fetchPoolDepositQuote(
        assetA,
        assetB,
        raw
      )
        .then((data) => {
          if (!cancelled) setState({ data, isLoading: false, error: null, requestKey });
        })
        .catch((err) => {
          if (!cancelled) {
            setState({
              data: null,
              isLoading: false,
              error: err instanceof Error ? err.message : "Unable to load pool quote.",
            });
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [assetA, assetB, enabled, raw, requestKey]);

  // Never expose a previous draft's quote, even during the render before effect cleanup.
  if (!enabled || raw === null) return { data: null, isLoading: false, error: null };
  return state.requestKey === requestKey ? state : { data: null, isLoading: state.isLoading, error: state.error };
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
  const parsed = parseAmountDraft(quantity, { decimals: isGiveDivisible ? 8 : 0, minRaw: 1n });
  const raw = parsed.status === "valid" ? parsed.raw.toString() : null;
  const requestKey = JSON.stringify([giveAsset, getAsset, raw, enabled]);
  const [state, setState] = useState<PoolQuoteState<PoolQuote>>({
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
      fetchPoolQuote(
        giveAsset,
        getAsset,
        raw
      )
        .then((data) => {
          if (!cancelled) setState({ data, isLoading: false, error: null, requestKey });
        })
        .catch((err) => {
          if (!cancelled) {
            setState({
              data: null,
              isLoading: false,
              error: err instanceof Error ? err.message : "Unable to load swap quote.",
            });
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [giveAsset, getAsset, raw, enabled, requestKey]);

  // Never expose a previous draft's quote, even during the render before effect cleanup.
  if (!enabled || raw === null) return { data: null, isLoading: false, error: null };
  return state.requestKey === requestKey ? state : { data: null, isLoading: state.isLoading, error: state.error };
}

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
  const parsed = parseAmountDraft(quantity, { decimals: 8, minRaw: 1n });
  const raw = parsed.status === "valid" ? parsed.raw.toString() : null;
  const requestKey = JSON.stringify([assetA, assetB, raw, enabled]);
  const [state, setState] = useState<PoolQuoteState<PoolWithdrawQuote>>({
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
      fetchPoolWithdrawQuote(assetA, assetB, raw)
        .then((data) => {
          if (!cancelled) setState({ data, isLoading: false, error: null, requestKey });
        })
        .catch((err) => {
          if (!cancelled) {
            setState({
              data: null,
              isLoading: false,
              error: err instanceof Error ? err.message : "Unable to load withdrawal quote.",
            });
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [assetA, assetB, enabled, raw, requestKey]);

  // Never expose a previous draft's quote, even during the render before effect cleanup.
  if (!enabled || raw === null) return { data: null, isLoading: false, error: null };
  return state.requestKey === requestKey ? state : { data: null, isLoading: state.isLoading, error: state.error };
}
