import { useEffect, useState } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { fetchAddressPoolByLpAsset, type PoolPosition } from "@/utils/blockchain/counterparty/api";

interface LpAssetPoolState {
  data: PoolPosition | null;
  isLoading: boolean;
  error: Error | null;
}

export function useLpAssetPool(asset: string | undefined): LpAssetPoolState {
  const { activeAddress } = useWallet();
  const [state, setState] = useState<LpAssetPoolState>({ data: null, isLoading: false, error: null });

  useEffect(() => {
    if (!asset || !activeAddress?.address || asset === "BTC") {
      setState({ data: null, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ data: null, isLoading: true, error: null });

    fetchAddressPoolByLpAsset(activeAddress.address, asset, { limit: 100 })
      .then((response) => {
        if (cancelled) return;
        setState({ data: response, isLoading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            data: null,
            isLoading: false,
            error: err instanceof Error ? err : new Error("Failed to check pool position"),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeAddress?.address, asset]);

  return state;
}
