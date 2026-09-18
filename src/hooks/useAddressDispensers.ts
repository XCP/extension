import { useCallback, useEffect, useMemo } from 'react';
import { type DispenserDetails, fetchAddressDispensers } from '@/core/counterparty/api';
import { isFixedRateDispenser } from '@/core/counterparty/oraclePolicy';
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch';

const getKey = (dispenser: DispenserDetails) => dispenser.tx_hash;

/** Browse address dispensers like the market lists: 20 at a time, without a total cap. */
export function useAddressDispensers(address?: string, requestedAsset?: string, requestedIndex?: number | null) {
  const fetchFn = useCallback((offset: number, limit: number) => address
    ? fetchAddressDispensers(address, { offset, limit, status: 'open', verbose: true })
    : Promise.resolve({ result: [], result_count: 0 }), [address]);
  const page = usePaginatedFetch({ fetchFn, getKey, pageSize: 20, maxItems: Infinity, enabled: !!address });
  const data = useMemo(() => page.data.filter(isFixedRateDispenser), [page.data]);
  const findingSelection = !!address && page.hasMore && (
    (!!requestedAsset && !data.some(d => d.asset === requestedAsset))
    || (requestedIndex != null && requestedIndex >= data.length)
  );

  useEffect(() => {
    if (!address || page.error || page.isLoading || page.isFetchingMore || !page.hasMore) return;
    // A filtered-out page cannot hide later fixed-rate listings. A link to a specific asset
    // also needs to find that asset even when it is not on the first page.
    if (!findingSelection && !(page.data.length > 0 && data.length === 0)) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) page.loadMore(); });
    return () => { cancelled = true; };
  }, [address, findingSelection, data.length, page]);

  return { ...page, data, isLoading: page.isLoading || (findingSelection && !page.error) };
}
