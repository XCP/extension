import { useEffect, useState } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { fetchAddressPoolByLpAsset, type PoolPosition } from "@/utils/blockchain/counterparty/api";

interface LpAssetPoolState {
  data: PoolPosition | null;
  isLoading: boolean;
}

export function useLpAssetPool(asset: string | undefined): LpAssetPoolState {
  const { activeAddress } = useWallet();
  const [state, setState] = useState<LpAssetPoolState>({ data: null, isLoading: false });

  useEffect(() => {
    if (!asset || !activeAddress?.address || asset === "BTC") {
      setState({ data: null, isLoading: false });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, isLoading: true }));

    fetchAddressPoolByLpAsset(activeAddress.address, asset, { limit: 100 })
      .then((response) => {
        if (cancelled) return;
        setState({ data: response, isLoading: false });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ data: null, isLoading: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeAddress?.address, asset]);

  return state;
}
