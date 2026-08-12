import { useEffect, useMemo, useState } from 'react';
import { type PendingDelta, pendingByAsset, pendingByUtxo } from '@/core/balances/pending';
import { pendingLabel } from '@/core/balances/pendingLabel';
import { fetchMempoolLedgerEvents } from '@/core/counterparty/api';
import { useRefreshSignal } from '@/hooks/useRefreshSignal';

const EMPTY = new Map<string, PendingDelta>();

/**
 * What the mempool is currently doing to an address's rows.
 *
 * Read when a screen loads and again when the user refreshes — no polling, no background work. A
 * status label or a Max figure only has to be right while someone is looking at it, and by then
 * they are.
 *
 * The request is not cache-busted, deliberately. Several callers can ask at once — a pool deposit
 * form reads two assets, the home screen reads a list — and the API client's short response cache
 * collapses those into one call. Pressing refresh clears that cache for the address first, so the
 * one place freshness is promised is the one place it is guaranteed.
 *
 * Failure is silent and empty. Not every node keeps a mempool this can read, and a screen that
 * shows an error because an optional annotation could not be fetched has made the wallet look
 * broken in order to tell you nothing. Everything downstream treats "no data" as "subtract
 * nothing", which is what the wallet did before this existed.
 */
export function usePendingDeltas(
  address: string | undefined,
  refreshNonce?: number
): { byAsset: Map<string, PendingDelta>; byUtxo: Map<string, PendingDelta> } {
  const [byAsset, setByAsset] = useState<Map<string, PendingDelta>>(EMPTY);
  const [byUtxo, setByUtxo] = useState<Map<string, PendingDelta>>(EMPTY);
  const [reloadCount, setReloadCount] = useState(0);

  useRefreshSignal(refreshNonce, () => setReloadCount((previous) => previous + 1));

  useEffect(() => {
    if (!address) {
      setByAsset(EMPTY);
      setByUtxo(EMPTY);
      return;
    }

    let isCancelled = false;

    const read = async () => {
      try {
        const response = await fetchMempoolLedgerEvents([address]);
        if (isCancelled) return;
        const events = response.result ?? [];
        setByAsset(pendingByAsset(events, address));
        setByUtxo(pendingByUtxo(events, address));
      } catch {
        if (!isCancelled) {
          setByAsset(EMPTY);
          setByUtxo(EMPTY);
        }
      }
    };

    read();
    return () => { isCancelled = true; };
  }, [address, reloadCount]);

  return { byAsset, byUtxo };
}

/**
 * The same reading, reduced to one word per row for the balance and UTXO lists.
 */
export function usePendingStatus(
  address: string | undefined,
  refreshNonce?: number
): { byAsset: Map<string, string>; byUtxo: Map<string, string> } {
  const { byAsset, byUtxo } = usePendingDeltas(address, refreshNonce);

  return useMemo(() => {
    const toLabels = (deltas: Map<string, PendingDelta>) => {
      const labels = new Map<string, string>();
      for (const [key, delta] of deltas) {
        const label = pendingLabel(delta.reasons);
        if (label) labels.set(key, label);
      }
      return labels;
    };
    return { byAsset: toLabels(byAsset), byUtxo: toLabels(byUtxo) };
  }, [byAsset, byUtxo]);
}
