import { useEffect, useState } from "react";
import { fetchPool, type Pool } from "@/core/counterparty/api";

interface PoolState {
  data: Pool | null;
  isLoading: boolean;
  error: Error | null;
}

export function usePool(assetA: string | undefined, assetB: string | undefined): PoolState {
  const requestKey = JSON.stringify([assetA, assetB]);
  const [state, setState] = useState<PoolState & { requestKey?: string }>({ data: null, isLoading: false, error: null });

  useEffect(() => {
    if (!assetA || !assetB || assetA === assetB) {
      setState({ requestKey, data: null, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ requestKey, data: null, isLoading: true, error: null });

    fetchPool(assetA, assetB)
      .then((pool) => {
        if (!cancelled) {
          setState({ requestKey, data: pool, isLoading: false, error: null });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ requestKey,
            data: null,
            isLoading: false,
            error: err instanceof Error ? err : new Error("Failed to load pool"),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assetA, assetB, requestKey]);

  if (state.requestKey !== requestKey) return { data: null, isLoading: !!assetA && !!assetB && assetA !== assetB, error: null };
  return { data: state.data, isLoading: state.isLoading, error: state.error };
}
