import { useEffect, useState } from 'react';
import { clearUtxoCache, fetchUTXOs } from '@/core/bitcoin/utxo';
import { clearZeldCaches, fetchZeldBalance, fetchZeldRewards, type ZeldAddressBalance, type ZeldReward } from '@/core/zeld/api';
import { t } from '@/i18n';

interface ZeldBalanceState {
  address?: string;
  balance: ZeldAddressBalance | null;
  rewards: ZeldReward[] | null;
  reservedSats: number | null;
  error: string | null;
  loading: boolean;
}

const EMPTY: ZeldBalanceState = { balance: null, rewards: null, reservedSats: null, error: null, loading: true };

/** Address-bound reads: late requests from a previous address cannot replace the active balance. */
export function useZeldBalance(address: string | undefined) {
  const [state, setState] = useState<ZeldBalanceState>(EMPTY);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await Promise.resolve();
      if (cancelled || !address) return;
      setState({ ...EMPTY, address });
      const balance = fetchZeldBalance(address);
      // Balance display must not wait for optional reward history or BTC output values.
      void balance.then(value => {
        if (!cancelled) setState(previous => ({ ...previous, balance: value, loading: false }));
      }).catch(() => {
        if (!cancelled) setState(previous => ({ ...previous, error: t('zeld_indexer_unavailable'), loading: false }));
      });
      void fetchZeldRewards(address, 10).then(rewards => {
        if (!cancelled) setState(previous => ({ ...previous, rewards }));
      }).catch(() => { /* History stays unavailable independently of the balance. */ });
      void Promise.all([balance, fetchUTXOs(address)]).then(([zeld, utxos]) => {
        if (cancelled) return;
        const byOutpoint = new Map(utxos.map(utxo => [`${utxo.txid}:${utxo.vout}`, utxo.value]));
        setState(previous => ({ ...previous,
          reservedSats: zeld.utxos.reduce((sum, utxo) => sum + (byOutpoint.get(`${utxo.txid}:${utxo.vout}`) ?? 0), 0),
        }));
      }).catch(() => {
        // BTC output values are supplementary; their failure must not hide a known ZELD balance.
      });
    };
    void load();
    return () => { cancelled = true; };
  }, [address, revision]);
  return {
    ...(state.address === address ? state : EMPTY),
    retry: () => {
      if (address) { clearZeldCaches(address); clearUtxoCache(address); }
      setRevision(value => value + 1);
    },
  };
}
