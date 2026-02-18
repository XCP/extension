import { useState, useMemo, useEffect, type ReactElement } from "react";
import { useInView } from "@/hooks/useInView";
import { Spinner } from "@/components/ui/spinner";
import { SearchInput } from "@/components/ui/inputs/search-input";
import { UtxoCard } from "@/components/ui/cards/utxo-card";
import { useWallet } from "@/contexts/wallet-context";
import { fetchTokenBalances } from "@/utils/blockchain/counterparty/api";
import type { UtxoBalance } from "@/utils/blockchain/counterparty/api";

const PAGE_SIZE = 20;

export const UtxoList = (): ReactElement => {
  const { activeWallet, activeAddress } = useWallet();
  const [balances, setBalances] = useState<UtxoBalance[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "300px", threshold: 0 });

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
      }
    };

    loadInitial();

    return () => { isCancelled = true; };
  }, [activeAddress, activeWallet]);

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
          <UtxoCard token={token} key={token.utxo} />
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
