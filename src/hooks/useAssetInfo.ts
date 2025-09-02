import { useState, useEffect, useRef } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { fetchAssetDetailsAndBalance, AssetInfo } from "@/utils/blockchain/counterparty";

/**
 * Fetches basic asset metadata information.
 * This is a focused hook that only handles asset info, not balances or UTXOs.
 */
export function useAssetInfo(asset: string) {
  const { activeAddress } = useWallet();
  
  const [state, setState] = useState<{
    isLoading: boolean;
    error: Error | null;
    data: AssetInfo | null;
  }>({
    isLoading: false,
    error: null,
    data: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!asset || asset.trim() === '' || !activeAddress?.address) {
      setState({
        isLoading: false,
        error: null,
        data: null,
      });
      return;
    }

    // Cancel previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    const currentAbortController = abortControllerRef.current;

    async function fetchData() {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        // Special case for BTC
        if (asset === 'BTC') {
          setState({
            isLoading: false,
            error: null,
            data: {
              asset: 'BTC',
              asset_longname: null,
              description: 'Bitcoin',
              divisible: true,
              locked: true,
              supply: '21000000',
              supply_normalized: '21000000',
              issuer: '',
              fair_minting: false,
            },
          });
          return;
        }

        const result = await fetchAssetDetailsAndBalance(asset, activeAddress!.address);
        
        // Check if request was aborted
        if (currentAbortController.signal.aborted) {
          return;
        }

        setState({
          isLoading: false,
          error: null,
          data: result.assetInfo,
        });
      } catch (err) {
        // Don't update state if request was aborted
        if (!currentAbortController.signal.aborted) {
          setState({
            isLoading: false,
            error: err instanceof Error ? err : new Error(String(err)),
            data: null,
          });
        }
      }
    }

    fetchData();

    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [asset, activeAddress?.address]);

  return state;
}