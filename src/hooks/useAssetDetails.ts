import { useState, useEffect, useRef } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { fetchAssetDetailsAndBalance, fetchTokenUtxos } from "@/utils/blockchain/counterparty";
import { fetchBTCBalance } from "@/utils/blockchain/bitcoin";
import { AssetInfo } from '@/types/asset';

export interface AssetDetails {
  isDivisible: boolean;
  assetInfo: AssetInfo | null;
  availableBalance: string;
  utxoBalances?: Array<{
    txid: string;
    amount: string;
  }>;
}

interface UseAssetDetailsOptions {
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
}

export function useAssetDetails(asset: string, options?: UseAssetDetailsOptions) {
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
        options?.onLoadStart?.();
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
            }
          };
        } else {
          const [assetDetails, utxos] = await Promise.all([
            fetchAssetDetailsAndBalance(asset, activeAddress.address),
            fetchTokenUtxos(activeAddress.address, asset)
          ]);

          result = {
            ...assetDetails,
            utxoBalances: utxos.map(utxo => ({
              txid: utxo.utxo || '',
              amount: utxo.quantity_normalized,
            }))
          };
        }

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
      } finally {
        options?.onLoadEnd?.();
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
