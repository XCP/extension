import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@/contexts/wallet-context';
import { fetchBTCBalance } from '@/utils/blockchain/bitcoin';
import { fetchTokenBalance, fetchTokenUtxos } from '@/utils/blockchain/counterparty';
import { AssetInfo } from '@/types/asset';

interface BalanceDetails {
  balance: string;
  assetInfo?: AssetInfo;
  utxoBalances?: Array<{
    txid: string;
    amount: string;
  }>;
}

interface BalanceState {
  isLoading: boolean;
  error: Error | null;
  data: BalanceDetails | null;
}

export const useBalanceDetails = (asset: string) => {
  const { activeAddress } = useWallet();
  const [state, setState] = useState<BalanceState>({
    isLoading: true,
    error: null,
    data: null,
  });

  const fetchDataRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    fetchDataRef.current = true;

    async function fetchData() {
      if (!activeAddress?.address || !asset) {
        setState(prev => ({
          ...prev,
          error: new Error('Address or asset not available'),
          isLoading: false,
        }));
        return;
      }

      try {
        let balanceDetails: BalanceDetails;

        if (asset === 'BTC') {
          const balanceSats = await fetchBTCBalance(activeAddress.address);
          balanceDetails = {
            balance: (balanceSats / 1e8).toString(),
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
          const [tokenBalance, utxos] = await Promise.all([
            fetchTokenBalance(activeAddress.address, asset),
            fetchTokenUtxos(activeAddress.address, asset),
          ]);

          if (!tokenBalance) {
            throw new Error('Balance not found');
          }

          balanceDetails = {
            balance: tokenBalance.quantity_normalized,
            assetInfo: tokenBalance.asset_info,
            utxoBalances: utxos.map(utxo => ({
              txid: utxo.utxo || '',
              amount: utxo.quantity_normalized,
            })),
          };
        }

        if (isMounted && fetchDataRef.current) {
          setState({
            data: balanceDetails,
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
}; 