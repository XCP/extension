import { useState, useEffect, useRef, useMemo } from "react";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { fetchBTCBalance } from "@/utils/blockchain/bitcoin";
import { fetchAssetDetailsAndBalance, fetchTokenUtxos } from "@/utils/blockchain/counterparty";
import { AssetInfo } from '@/types/asset';

/**
 * Represents the details of an asset, including balance and UTXO information.
 */
export interface AssetDetails {
  isDivisible: boolean;
  assetInfo: AssetInfo | null;
  availableBalance: string;
  utxoBalances?: Array<{
    txid: string;
    amount: string;
  }>;
}

/**
 * Options for the useAssetDetails hook.
 */
interface UseAssetDetailsOptions {
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
}

/**
 * Custom hook to fetch and manage asset details, leveraging HeaderContext for caching.
 * Returns the current state of the asset data, including loading status and errors.
 * @param asset The asset identifier (e.g., 'BTC', 'XCP')
 * @param options Optional callbacks for load start and end events
 * @returns Object containing isLoading, error, and data properties
 */
export function useAssetDetails(asset: string, options?: UseAssetDetailsOptions) {
  const { activeAddress } = useWallet();
  const { subheadings, setBalanceHeader, clearBalances } = useHeader();
  const [state, setState] = useState<{
    isLoading: boolean;
    error: Error | null;
    data: AssetDetails | null;
  }>({
    isLoading: false,
    error: null,
    data: null,
  });

  // Ref to track if fetch is still valid
  const fetchDataRef = useRef(false);
  
  // Ref to track the previous address
  const prevAddressRef = useRef<string | undefined>();
  
  // Reset state when address changes
  useEffect(() => {
    if (prevAddressRef.current && prevAddressRef.current !== activeAddress?.address) {
      setState({
        isLoading: false,
        error: null,
        data: null,
      });
    }
  }, [activeAddress?.address]);

  useEffect(() => {
    // Clear balance cache if address changed
    if (prevAddressRef.current && prevAddressRef.current !== activeAddress?.address) {
      clearBalances();
      // Reset state to force re-fetch
      setState({
        isLoading: false,
        error: null,
        data: null,
      });
    }
    prevAddressRef.current = activeAddress?.address;

    let isMounted = true;
    fetchDataRef.current = true;

    /**
     * Fetches asset data from the blockchain and updates the cache and state.
     */
    async function fetchData() {
      // Early return if asset is empty or active address is not available
      if (!asset || asset.trim() === '') {
        return;
      }
      
      if (!activeAddress?.address) {
        setState(prev => ({
          ...prev,
          error: new Error("Address not available"),
          isLoading: false,
        }));
        return;
      }

      try {
        options?.onLoadStart?.();
        setState(prev => ({ ...prev, isLoading: true }));
        let result: AssetDetails;

        if (asset === 'BTC') {
          const balanceSats = await fetchBTCBalance(activeAddress.address);
          result = {
            isDivisible: true,
            availableBalance: (balanceSats / 1e8).toString(),
            assetInfo: {
              asset_longname: null,
              description: 'Bitcoin',
              divisible: true,
              locked: true,
              supply: '21000000',
              issuer: '',
            },
          };
        } else {
          const [assetDetails, utxos] = await Promise.all([
            fetchAssetDetailsAndBalance(asset, activeAddress.address),
            fetchTokenUtxos(activeAddress.address, asset),
          ]);

          result = {
            ...assetDetails,
            utxoBalances: utxos.map(utxo => ({
              txid: utxo.utxo || '',
              amount: utxo.quantity_normalized,
            })),
          };
        }

        if (isMounted && fetchDataRef.current) {
          // Update HeaderContext cache with fetched data
          setBalanceHeader(asset, {
            asset,
            quantity_normalized: result.availableBalance,
            asset_info: result.assetInfo || undefined,
          });

          // Update local state with fetched data
          setState({
            data: result,
            error: null,
            isLoading: false,
          });
        }
      } catch (err) {
        if (isMounted && fetchDataRef.current) {
          setState({
            data: null,
            error: err instanceof Error ? err : new Error(String(err)),
            isLoading: false,
          });
        }
      } finally {
        if (isMounted && fetchDataRef.current) {
          options?.onLoadEnd?.();
        }
      }
    }

    // Skip fetching if asset is empty
    if (!asset || asset.trim() === '') {
      setState({
        isLoading: false,
        error: null,
        data: null,
      });
      return;
    }

    // Get current cached balance
    const cachedBalance = subheadings.balances[asset];
    
    // Always fetch data when address changes or no data exists
    const addressChanged = prevAddressRef.current && prevAddressRef.current !== activeAddress?.address;
    
    if (addressChanged || !cachedBalance || !cachedBalance.quantity_normalized) {
      fetchData();
    } else if (!state.data) {
      // Use cached data if available and state hasn't been set yet
      setState(prevState => ({
        isLoading: false,
        error: null,
        data: {
          isDivisible: cachedBalance.asset_info?.divisible ?? true,
          assetInfo: cachedBalance.asset_info || null,
          availableBalance: cachedBalance.quantity_normalized || '0',
          utxoBalances: prevState.data?.utxoBalances || [],
        },
      }));
    }

    // Cleanup function to prevent updates on unmounted component
    return () => {
      isMounted = false;
      fetchDataRef.current = false;
    };
  }, [asset, activeAddress?.address, subheadings.balances, setBalanceHeader, clearBalances, options]);

  return state;
}
