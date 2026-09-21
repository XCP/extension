import { useEffect, useMemo, useState } from 'react';
import {
  type PendingCancellations,
  type PendingDelta,
  pendingByAsset,
  pendingByUtxo,
  pendingCancellations,
} from '@/core/balances/pending';
import { pendingLabel } from '@/core/balances/pendingLabel';
import { fetchMempoolLedgerEvents, fetchMempoolStatusEvents } from '@/core/counterparty/api';
import { useRefreshSignal } from '@/hooks/useRefreshSignal';

const EMPTY = new Map<string, PendingDelta>();
const NO_CANCELLATIONS: PendingCancellations = {
  orderHashes: new Set(),
  dispenserHashes: new Set(),
};

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
 * Which of an address's orders and dispensers already have a cancel or close in the mempool.
 *
 * Read so the Cancel and Close buttons can stand down while the ending they would compose is
 * already in flight — a second cancel of the same order can only fail and burn its fee. Same
 * read-when-looking contract and silent-empty failure mode as {@link usePendingDeltas}.
 */
export function usePendingCancellations(
  address: string | undefined,
  refreshNonce?: number
): PendingCancellations {
  const [cancellations, setCancellations] = useState<PendingCancellations>(NO_CANCELLATIONS);
  const [reloadCount, setReloadCount] = useState(0);

  useRefreshSignal(refreshNonce, () => setReloadCount((previous) => previous + 1));

  useEffect(() => {
    if (!address) {
      setCancellations(NO_CANCELLATIONS);
      return;
    }

    let isCancelled = false;

    const read = async () => {
      try {
        const response = await fetchMempoolStatusEvents([address]);
        if (isCancelled) return;
        setCancellations(pendingCancellations(response.result ?? [], address));
      } catch {
        if (!isCancelled) setCancellations(NO_CANCELLATIONS);
      }
    };

    read();
    return () => { isCancelled = true; };
  }, [address, reloadCount]);

  return cancellations;
}

/** Each delta reduced to one display word, dropping the ones with nothing to say. */
export function labelsFromDeltas(deltas: Map<string, PendingDelta>): Map<string, string> {
  const labels = new Map<string, string>();
  for (const [key, delta] of deltas) {
    const label = pendingLabel(delta.reasons);
    if (label) labels.set(key, label);
  }
  return labels;
}

/**
 * The same reading, reduced to one word per row for the balance and UTXO lists.
 */
export function usePendingStatus(
  address: string | undefined,
  refreshNonce?: number
): { byAsset: Map<string, string>; byUtxo: Map<string, string> } {
  const { byAsset, byUtxo } = usePendingDeltas(address, refreshNonce);

  return useMemo(
    () => ({ byAsset: labelsFromDeltas(byAsset), byUtxo: labelsFromDeltas(byUtxo) }),
    [byAsset, byUtxo]
  );
}
