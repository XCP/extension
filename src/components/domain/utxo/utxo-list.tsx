import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { UtxoCard } from "@/components/domain/utxo/utxo-card";
import { SearchInput } from "@/components/ui/inputs/search-input";
import { Spinner } from "@/components/ui/spinner";
import { useWallet } from "@/contexts/wallet-context";
import type { UtxoBalance } from "@/core/counterparty/api";
import { fetchTokenBalances } from "@/core/counterparty/api";
import { useInView } from "@/hooks/useInView";
import { usePendingStatus } from "@/hooks/usePendingStatus";
import { useRefreshSignal } from "@/hooks/useRefreshSignal";

const PAGE_SIZE = 20;

interface UtxoListProps {
  /** Changes to ask for a fresh load; see `useRefreshSignal`. */
  refreshNonce?: number;
  /** Called when a requested refresh finishes, successfully or not. */
  onRefreshed?: () => void;
}

export const UtxoList = ({ refreshNonce, onRefreshed }: UtxoListProps = {}): ReactElement => {
  const { activeWallet, activeAddress } = useWallet();
  const [balances, setBalances] = useState<UtxoBalance[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "300px", threshold: 0 });

  // No `initialLoaded` flag here: this list reloads when the address changes, so a refresh is
  // expressed as another reason to re-run that same effect.
  const [reloadCount, setReloadCount] = useState(0);
  useRefreshSignal(refreshNonce, () => setReloadCount((previous) => previous + 1));

  // Keyed on the UTXO, not the asset: moving one attached output should mark one row.
  const { byUtxo: pendingByUtxoLabel } = usePendingStatus(activeAddress?.address, refreshNonce);

  // Ref, not a dependency: callers pass an inline arrow that changes every parent render.
  const latestOnRefreshed = useRef(onRefreshed);
  latestOnRefreshed.current = onRefreshed;

  // Initial load (and reset) when address changes
  useEffect(() => {
    if (!activeAddress || !activeWallet) {
      setBalances([]);
      setIsInitialLoading(false);
      return;
    }

    let isCancelled = false;

    setBalances([]);
    setOffset(0);
    setHasMore(true);
    setIsInitialLoading(true);
    setSearchQuery("");

    const loadInitial = async () => {
      try {
        const fetched = await fetchTokenBalances(activeAddress.address, {
          type: 'utxo',
          limit: PAGE_SIZE,
          offset: 0,
        });

        if (isCancelled) return;

        if (fetched.length < PAGE_SIZE) {
          setHasMore(false);
        }

        if (fetched.length > 0) {
          setBalances(fetched as UtxoBalance[]);
          setOffset(PAGE_SIZE);
        } else {
          setHasMore(false);
        }
      } catch (error) {
        console.error("Error fetching UTXO balances:", error);
        if (!isCancelled) setHasMore(false);
      } finally {
        if (!isCancelled) setIsInitialLoading(false);
        // Outside the cancelled guard: a cancelled load still ends the refresh the caller is
        // showing a spinner for.
        latestOnRefreshed.current?.();
      }
    };

    loadInitial();

    return () => { isCancelled = true; };
  }, [activeAddress, activeWallet, reloadCount]);

  // Load more on scroll
  useEffect(() => {
    if (!activeAddress || !activeWallet || !hasMore || isFetchingMore || !inView || isInitialLoading) {
      return;
    }

    let isCancelled = false;

    const loadMore = async () => {
      setIsFetchingMore(true);
      try {
        const fetched = await fetchTokenBalances(activeAddress.address, {
          type: 'utxo',
          limit: PAGE_SIZE,
          offset,
        });

        if (isCancelled) return;

        if (fetched.length < PAGE_SIZE) {
          setHasMore(false);
        }

        if (fetched.length > 0) {
          setBalances((prev) => [...prev, ...fetched as UtxoBalance[]]);
          setOffset((prev) => prev + PAGE_SIZE);
        } else {
          setHasMore(false);
        }
      } catch (error) {
        console.error("Error fetching UTXO balances:", error);
        if (!isCancelled) setHasMore(false);
      } finally {
        if (!isCancelled) setIsFetchingMore(false);
      }
    };

    loadMore();

    return () => { isCancelled = true; };
  }, [activeAddress, activeWallet, hasMore, offset, isFetchingMore, inView, isInitialLoading]);

  // Client-side filter on loaded balances
  const filteredBalances = useMemo(() => {
    if (!searchQuery) return balances;
    const query = searchQuery.toLowerCase();
    return balances.filter((token) =>
      token.asset.toLowerCase().includes(query) ||
      (token.asset_info?.asset_longname?.toLowerCase().includes(query)) ||
      token.utxo.toLowerCase().includes(query)
    );
  }, [balances, searchQuery]);

  if (isInitialLoading) return <Spinner message="Loading UTXO balances…" />;

  if (balances.length === 0) {
    return <div className="text-center py-4 text-gray-500">No UTXO-attached balances</div>;
  }

  return (
    <div className="space-y-2">
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search utxos…"
        name="utxo-search"
        className="mt-0.5 mb-3"
        showClearButton={true}
      />
      {filteredBalances.length === 0 ? (
        <div className="text-center py-4 text-gray-500">No matching UTXOs</div>
      ) : (
        filteredBalances.map((token) => (
          <UtxoCard token={token} key={token.utxo} pendingStatus={pendingByUtxoLabel.get(token.utxo)} />
        ))
      )}
      {!searchQuery && (
        <div ref={loadMoreRef} className="flex flex-col justify-center items-center py-1">
          {hasMore ? (
            isFetchingMore ? (
              <Spinner className="py-4" />
            ) : (
              <div className="text-sm text-gray-500">Scroll to load more…</div>
            )
          ) : null}
        </div>
      )}
    </div>
  );
};
