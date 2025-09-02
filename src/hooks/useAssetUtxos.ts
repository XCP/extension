import { useState, useEffect, useRef } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { fetchTokenUtxos } from "@/utils/blockchain/counterparty";

export interface UtxoBalance {
  txid: string;
  amount: string;
}

/**
 * Fetches UTXO balances for a specific asset.
 * Only applicable for non-BTC Counterparty assets.
 */
export function useAssetUtxos(asset: string) {
  const { activeAddress } = useWallet();
  
  const [state, setState] = useState<{
    isLoading: boolean;
    error: Error | null;
    utxos: UtxoBalance[] | null;
  }>({
    isLoading: false,
    error: null,
    utxos: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Skip for BTC or empty asset
    if (!asset || asset.trim() === '' || asset === 'BTC' || !activeAddress?.address) {
      setState({
        isLoading: false,
        error: null,
        utxos: null,
      });
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
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        const utxos = await fetchTokenUtxos(activeAddress!.address, asset);
        
        // Check if request was aborted
        if (currentAbortController.signal.aborted) {
          return;
        }

        const formattedUtxos = utxos.map(utxo => ({
          txid: utxo.utxo || '',
          amount: utxo.quantity_normalized,
        }));

        setState({
          isLoading: false,
          error: null,
          utxos: formattedUtxos,
        });
      } catch (err) {
        if (!currentAbortController.signal.aborted) {
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