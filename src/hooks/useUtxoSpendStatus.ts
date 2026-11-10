import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchUtxoSpendStatus } from '@/core/bitcoin/outspend';
import { isUtxoRecentlySpent } from '@/core/bitcoin/spentUtxoCache';

export type UtxoSpendState = 'pending' | 'spent';

/** Check only displayed outputs, four at a time. Refresh retries unknowns and reorged spends. */
export function useUtxoSpendStatus(outpoints: string[], refreshNonce?: number): Map<string, UtxoSpendState> {
  const key = [...new Set(outpoints)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0).join(',');
  const cache = useRef(new Map<string, Awaited<ReturnType<typeof fetchUtxoSpendStatus>>>());
  const previousRefresh = useRef(refreshNonce);
  const [snapshot, setSnapshot] = useState(new Map<string, UtxoSpendState>());
  useEffect(() => {
    if (previousRefresh.current !== refreshNonce) {
      cache.current.clear();
      previousRefresh.current = refreshNonce;
    }
    let cancelled = false;
    const points = key ? key.split(',') : [];
    const publish = () => {
      if (cancelled) return;
      setSnapshot(new Map(points.flatMap(point => {
        const [txid, vout] = point.split(':');
        const status = isUtxoRecentlySpent(txid!, Number(vout)) ? 'pending' : cache.current.get(point);
        return status === 'pending' || status === 'spent' ? [[point, status] as const] : [];
      })));
    };
    publish();
    const queue = points.filter(point => !cache.current.has(point));
    const worker = async () => {
      while (queue.length) {
        if (cancelled) return;
        const point = queue.shift()!;
        const status = await fetchUtxoSpendStatus(point).catch(() => 'unknown' as const);
        if (cancelled) return;
        cache.current.set(point, status);
        publish();
      }
    };
    const workers = Math.min(4, queue.length);
    for (let i = 0; i < workers; i++) void worker();
    return () => { cancelled = true; };
  }, [key, refreshNonce]);
  return useMemo(() => {
    const current = new Set(key ? key.split(',') : []);
    return new Map([...snapshot].filter(([point]) => current.has(point)));
  }, [snapshot, key]);
}
