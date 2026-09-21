import { useEffect, useState } from 'react';
import { fetchUTXOs } from '@/core/bitcoin/utxo';
import { fetchZeldBalance, fetchZeldRewards, type ZeldAddressBalance, type ZeldReward } from '@/core/zeld/api';

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
      const [balance, rewards, utxos] = await Promise.allSettled([
        fetchZeldBalance(address), fetchZeldRewards(address, 10), fetchUTXOs(address),
      ]);
      if (cancelled) return;
      const zeld = balance.status === 'fulfilled' ? balance.value : null;
      const byOutpoint = utxos.status === 'fulfilled'
        ? new Map(utxos.value.map(utxo => [`${utxo.txid}:${utxo.vout}`, utxo.value])) : null;
      setState({
        address,
        balance: zeld,
        rewards: rewards.status === 'fulfilled' ? rewards.value : null,
        reservedSats: zeld && byOutpoint
          ? zeld.utxos.reduce((sum, utxo) => sum + (byOutpoint.get(`${utxo.txid}:${utxo.vout}`) ?? 0), 0) : null,
        error: zeld ? null : 'The ZELD indexer could not be reached.',
        loading: false,
      });
    };
    void load();
    return () => { cancelled = true; };
  }, [address, revision]);
  return {
    ...(state.address === address ? state : EMPTY),
    retry: () => setRevision(value => value + 1),
  };
}
