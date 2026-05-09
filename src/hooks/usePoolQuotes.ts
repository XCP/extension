import { useEffect, useState } from "react";
import {
  fetchPoolDepositQuote,
  fetchPoolWithdrawQuote,
  type PoolDepositQuote,
  type PoolWithdrawQuote,
} from "@/utils/blockchain/counterparty/api";
import { toBigNumber, toSatoshis } from "@/utils/numeric";

interface PoolQuoteState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

function toRawQuantity(value: string, divisible: boolean): string {
  return divisible ? toSatoshis(value) : toBigNumber(value).integerValue().toString();
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
      fetchPoolDepositQuote(assetA, assetB, toRawQuantity(quantityA, isAssetADivisible))
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
