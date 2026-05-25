import { useEffect, useState } from "react";
import { fetchPool, type Pool } from "@/utils/blockchain/counterparty/api";

interface PoolState {
  data: Pool | null;
  isLoading: boolean;
  error: Error | null;
}

export function usePool(assetA: string | undefined, assetB: string | undefined): PoolState {
  const [state, setState] = useState<PoolState>({ data: null, isLoading: false, error: null });

  useEffect(() => {
    if (!assetA || !assetB || assetA === assetB) {
      setState({ data: null, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ data: null, isLoading: true, error: null });

    fetchPool(assetA, assetB)
      .then((pool) => {
        if (!cancelled) {
          setState({ data: pool, isLoading: false, error: null });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            data: null,
            isLoading: false,
            error: err instanceof Error ? err : new Error("Failed to load pool"),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assetA, assetB]);

  return state;
}
