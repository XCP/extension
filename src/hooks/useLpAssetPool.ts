import { useEffect, useState } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { fetchAddressPoolByLpAsset, type PoolPosition } from "@/core/counterparty/api";
import { normalizePoolPosition } from "@/core/counterparty/pool";

interface LpAssetPoolState {
  data: PoolPosition | null;
  isLoading: boolean;
  error: Error | null;
}

export function useLpAssetPool(asset: string | undefined): LpAssetPoolState {
  const { activeAddress } = useWallet();
  const requestKey = JSON.stringify([activeAddress?.address, asset]);
  const [state, setState] = useState<LpAssetPoolState & { requestKey?: string }>({ data: null, isLoading: false, error: null });

  useEffect(() => {
    if (!asset || !activeAddress?.address || asset === "BTC") {
      setState({ requestKey, data: null, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ requestKey, data: null, isLoading: true, error: null });

    fetchAddressPoolByLpAsset(activeAddress.address, asset, { limit: 100 })
      .then((response) => {
        if (cancelled) return;
        setState({ requestKey, data: response ? normalizePoolPosition(response) : null, isLoading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ requestKey,
            data: null,
            isLoading: false,
            error: err instanceof Error ? err : new Error("Failed to check pool position"),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeAddress?.address, asset, requestKey]);

  if (state.requestKey !== requestKey) return { data: null, isLoading: !!asset && !!activeAddress?.address && asset !== "BTC", error: null };
  return { data: state.data, isLoading: state.isLoading, error: state.error };
}
