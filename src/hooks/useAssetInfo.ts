import { useState, useEffect, useRef, useMemo } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { fetchAssetDetailsAndBalance, AssetInfo } from "@/utils/blockchain/counterparty";

interface AssetInfoState {
  isLoading: boolean;
  error: Error | null;
  data: AssetInfo | null;
}

// Define BTC asset info as a constant outside the component to prevent recreation
const BTC_ASSET_INFO: AssetInfo = {
  asset: 'BTC',
  asset_longname: null,
  description: 'Bitcoin',
  divisible: true,
  locked: true,
  supply: '21000000',
  supply_normalized: '21000000',
  issuer: '',
  fair_minting: false,
};

/**
 * Fetches basic asset metadata information.
 * This is a focused hook that only handles asset info, not balances or UTXOs.
 * 
 * @param asset - The asset symbol (e.g., 'BTC', 'XCP')
 * @returns Object containing asset info, loading state, and error
 * 
 * @example
 * const { data: assetInfo, isLoading, error } = useAssetInfo('XCP');
 * if (assetInfo) {
 *   console.log(`Asset ${assetInfo.asset} is ${assetInfo.divisible ? 'divisible' : 'indivisible'}`);
 * }
 */
export function useAssetInfo(asset: string) {
  const { activeAddress } = useWallet();
  
  // Initialize state with proper typing
  const [state, setState] = useState<AssetInfoState>({
    isLoading: false,
    error: null,
    data: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const prevAssetRef = useRef<string | undefined>(undefined);

  // Memoize BTC data for this specific asset
  const assetData = useMemo(() => {
    if (asset === 'BTC') {
      return BTC_ASSET_INFO;
    }
    return null;
  }, [asset]);

  useEffect(() => {
    // Early return for invalid inputs
    if (!asset || asset.trim() === '' || !activeAddress?.address) {
      // Only update state if it's different to prevent unnecessary re-renders
      setState(prev => {
        if (prev.data !== null || prev.isLoading || prev.error) {
          return {
            isLoading: false,
            error: null,
            data: null,
          };
        }
        return prev;
      });
      return;
    }

    // Handle BTC special case with memoized data
    if (assetData) {
      setState(prev => {
        // Only update if data is different
        if (prev.data !== assetData || prev.isLoading || prev.error) {
          return {
            isLoading: false,
            error: null,
            data: assetData,
          };
        }
        return prev;
      });
      return;
    }

    // Check if asset changed
    const assetChanged = prevAssetRef.current !== undefined && prevAssetRef.current !== asset;
    prevAssetRef.current = asset;

    // Skip fetch if asset hasn't changed and we already have data
    if (!assetChanged && state.data && state.data.asset === asset) {
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
      // Single state update for loading
      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      try {
        const result = await fetchAssetDetailsAndBalance(asset, activeAddress!.address);
        
        // Check if request was aborted
        if (currentAbortController.signal.aborted) {
          return;
        }

        // Single state update for success
        setState({
          isLoading: false,
          error: null,
          data: result.assetInfo,
        });
      } catch (err) {
        // Don't update state if request was aborted
        if (!currentAbortController.signal.aborted) {
          // Single state update for error
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
  }, [asset, activeAddress?.address, assetData, state.data]);

  return state;
}