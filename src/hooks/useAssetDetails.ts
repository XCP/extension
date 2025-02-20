import { useState, useEffect, useRef } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { fetchAssetDetailsAndBalance } from "@/utils/blockchain/counterparty";
import { AssetInfo } from '@/types/asset';

export interface AssetDetails {
  isDivisible: boolean;
  assetInfo: AssetInfo | null;
  availableBalance: string;
}

export function useAssetDetails(asset: string) {
  const { activeAddress } = useWallet();
  const [state, setState] = useState<{
    isLoading: boolean;
    error: Error | null;
    data: AssetDetails | null;
  }>({
    isLoading: true,
    error: null,
    data: null
  });

  const fetchDataRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    fetchDataRef.current = true;

    async function fetchData() {
      if (!asset || !activeAddress?.address) {
        setState(prev => ({
          ...prev,
          error: new Error("Asset or address not available"),
          isLoading: false
        }));
        return;
      }

      try {
        const result = await fetchAssetDetailsAndBalance(asset, activeAddress.address);
        if (isMounted && fetchDataRef.current) {
          setState({
            data: result,
            error: null,
            isLoading: false
          });
        }
      } catch (err) {
        if (isMounted && fetchDataRef.current) {
          setState({
            data: null,
            error: err instanceof Error ? err : new Error(String(err)),
            isLoading: false
          });
        }
      }
    }

    setState(prev => ({ ...prev, isLoading: true }));
    fetchData();

    return () => {
      isMounted = false;
      fetchDataRef.current = false;
    };
  }, [asset, activeAddress?.address]);

  return state;
}
