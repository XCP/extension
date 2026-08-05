import { useEffect, useState } from "react";
import {
  fetchPoolDepositQuote,
  fetchPoolQuote,
  fetchPoolWithdrawQuote,
  type PoolDepositQuote,
  type PoolQuote,
  type PoolWithdrawQuote,
} from "@/core/counterparty/api";
import { roundDown, toSatoshis } from "@/core/numeric";

interface PoolQuoteState<T> {
  data: T | null;
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
  const [state, setState] = useState<PoolQuoteState<PoolDepositQuote>>({
    data: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ data: null, isLoading: true, error: null });

    const timer = setTimeout(() => {
      fetchPoolDepositQuote(
        assetA,
        assetB,
        isAssetADivisible ? toSatoshis(quantityA) : roundDown(quantityA).toString()
      )
        .then((data) => {
          if (!cancelled) setState({ data, isLoading: false, error: null });
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
  }, [assetA, assetB, enabled, isAssetADivisible, quantityA]);

  return state;
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
  const [state, setState] = useState<PoolQuoteState<PoolQuote>>({
    data: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ data: null, isLoading: true, error: null });

    const timer = setTimeout(() => {
      fetchPoolQuote(
        giveAsset,
        getAsset,
        isGiveDivisible ? toSatoshis(quantity) : roundDown(quantity).toString()
      )
        .then((data) => {
          if (!cancelled) setState({ data, isLoading: false, error: null });
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
  }, [giveAsset, getAsset, quantity, isGiveDivisible, enabled]);

  return state;
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
  const [state, setState] = useState<PoolQuoteState<PoolWithdrawQuote>>({
    data: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ data: null, isLoading: true, error: null });

    const timer = setTimeout(() => {
      fetchPoolWithdrawQuote(assetA, assetB, toSatoshis(quantity))
        .then((data) => {
          if (!cancelled) setState({ data, isLoading: false, error: null });
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
  }, [assetA, assetB, enabled, quantity]);

  return state;
}
