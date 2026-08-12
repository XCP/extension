import { useEffect, useState } from 'react';
import { pendingByAsset, pendingByUtxo } from '@/core/balances/pending';
import { pendingLabel } from '@/core/balances/pendingLabel';
import { fetchMempoolLedgerEvents } from '@/core/counterparty/api';
import { useRefreshSignal } from '@/hooks/useRefreshSignal';

/**
 * What the mempool is currently doing to an address's rows, as a word per asset and per UTXO.
 *
 * Read when the screen loads and again when the user refreshes — no polling, no background work.
 * A status label only has to be right while someone is looking at it, and by then they are.
 *
 * Failure is silent and empty. Not every node keeps a mempool this can read, and a home screen that
 * shows an error banner because an optional annotation could not be fetched has made the wallet
 * look broken to tell you nothing.
 */
export function usePendingStatus(
  address: string | undefined,
  refreshNonce?: number
): { byAsset: Map<string, string>; byUtxo: Map<string, string> } {
  const [byAsset, setByAsset] = useState<Map<string, string>>(new Map());
  const [byUtxo, setByUtxo] = useState<Map<string, string>>(new Map());
  const [reloadCount, setReloadCount] = useState(0);

  useRefreshSignal(refreshNonce, () => setReloadCount((previous) => previous + 1));

  useEffect(() => {
    if (!address) {
      setByAsset(new Map());
      setByUtxo(new Map());
      return;
    }

    let isCancelled = false;

    const read = async () => {
      try {
        const response = await fetchMempoolLedgerEvents([address]);
        if (isCancelled) return;

        const events = response.result ?? [];
        const toLabels = (deltas: Map<string, { reasons: string[] }>) => {
          const labels = new Map<string, string>();
          for (const [key, delta] of deltas) {
            const label = pendingLabel(delta.reasons);
            if (label) labels.set(key, label);
          }
          return labels;
        };

        setByAsset(toLabels(pendingByAsset(events, address)));
        setByUtxo(toLabels(pendingByUtxo(events, address)));
      } catch {
        // Deliberately quiet — see the note above.
        if (!isCancelled) {
          setByAsset(new Map());
          setByUtxo(new Map());
        }
      }
    };

    read();
    return () => { isCancelled = true; };
  }, [address, reloadCount]);

  return { byAsset, byUtxo };
}
