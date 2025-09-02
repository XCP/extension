import { useState, useEffect, useRef } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { fetchTokenUtxos } from "@/utils/blockchain/counterparty";

export interface UtxoBalance {
  txid: string;
  amount: string;
}

interface UtxosState {
  isLoading: boolean;
  error: Error | null;
  utxos: UtxoBalance[] | null;
}

/**
 * Fetches UTXO balances for a specific asset.
 * Only applicable for non-BTC Counterparty assets.
 * 
 * @param asset - The asset symbol (e.g., 'XCP', but not 'BTC')
 * @returns Object containing UTXOs array, loading state, and error
 * 
 * @example
 * const { utxos, isLoading, error } = useAssetUtxos('XCP');
 * if (utxos) {
 *   console.log(`Found ${utxos.length} UTXOs for XCP`);
 * }
 */
export function useAssetUtxos(asset: string) {
  const { activeAddress } = useWallet();
  
  // Initialize state with proper typing
  const [state, setState] = useState<UtxosState>({
    isLoading: false,
    error: null,
    utxos: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const prevAssetRef = useRef<string | undefined>(undefined);
  const prevAddressRef = useRef<string | undefined>(undefined);


  useEffect(() => {
    // Skip for BTC, empty asset, or no address
    if (!asset || asset.trim() === '' || asset === 'BTC' || !activeAddress?.address) {
      // Only update state if it's different to prevent unnecessary re-renders
      setState(prev => {
        // For BTC, return empty array instead of null
        const targetUtxos = asset === 'BTC' ? [] : null;
        if (prev.utxos !== targetUtxos || prev.isLoading || prev.error) {
          return {
            isLoading: false,
            error: null,
            utxos: targetUtxos,
          };
        }
        return prev;
      });
      return;
    }

    // Check if asset or address changed
    const assetChanged = prevAssetRef.current !== undefined && prevAssetRef.current !== asset;
    const addressChanged = prevAddressRef.current !== undefined && prevAddressRef.current !== activeAddress?.address;
    
    prevAssetRef.current = asset;
    prevAddressRef.current = activeAddress?.address;

    // Skip fetch if neither asset nor address changed and we already have data
    if (!assetChanged && !addressChanged && state.utxos !== null) {
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();
    const currentAbortController = abortControllerRef.current;

    async function fetchUtxos() {
      // Single state update for loading
      setState(prev => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      try {
        const utxos = await fetchTokenUtxos(activeAddress!.address, asset);
        
        // Check if request was aborted
        if (currentAbortController.signal.aborted) {
          return;
        }

        // Format UTXOs
        const formattedUtxos: UtxoBalance[] = utxos.map(utxo => ({
          txid: utxo.utxo || '',
          amount: utxo.quantity_normalized,
        }));

        // Single state update for success
        setState({
          isLoading: false,
          error: null,
          utxos: formattedUtxos,
        });
      } catch (err) {
        if (!currentAbortController.signal.aborted) {
          // Single state update for error
          setState({
            isLoading: false,
            error: err instanceof Error ? err : new Error(String(err)),
            utxos: null,
          });
        }
      }
    }

    fetchUtxos();

    // Cleanup
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [asset, activeAddress?.address]);

  return state;
}