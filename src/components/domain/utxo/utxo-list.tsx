import { type ReactElement, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { UtxoCard } from "@/components/domain/utxo/utxo-card";
import { SearchInput } from "@/components/ui/inputs/search-input";
import { Spinner } from "@/components/ui/spinner";
import { useWallet } from "@/contexts/wallet-context";
import type { UtxoBalance } from "@/core/counterparty/api";
import { fetchTokenBalances } from "@/core/counterparty/api";
import { useInView } from "@/hooks/useInView";
import { usePendingStatus } from "@/hooks/usePendingStatus";
import { t } from '@/i18n';
import { useLocaleRevision } from '@/i18n/use-locale';

const PAGE_SIZE = 20;

interface UtxoListProps {
  refreshNonce?: number;
  onRefreshed?: () => void;
}

export const UtxoList = ({ refreshNonce, onRefreshed }: UtxoListProps = {}): ReactElement => {
  useLocaleRevision();
  const { activeWallet, activeAddress } = useWallet();
  const address = activeAddress?.address;
  const walletId = activeWallet?.id;
  const [balances, setBalances] = useState<UtxoBalance[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(Boolean(address && walletId));
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<'initial' | 'more' | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const sessionRef = useRef<{ address: string; offset: number; busy: boolean; loaded: boolean; hasMore: boolean } | null>(null);
  const previousRefreshNonce = useRef(refreshNonce);
  const notifyRefreshed = useEffectEvent((completedNonce: number | undefined) => {
    if (completedNonce === refreshNonce) onRefreshed?.();
  });

  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "300px", threshold: 0 });
  const { byUtxo: pendingByUtxoLabel } = usePendingStatus(address, refreshNonce);

  useEffect(() => {
    const requestedRefresh = previousRefreshNonce.current !== refreshNonce;
    previousRefreshNonce.current = refreshNonce;
    let settled = false;
    const settleRefresh = () => {
      if (!settled && requestedRefresh) {
        settled = true;
        notifyRefreshed(refreshNonce);
      }
    };
    const session = address && walletId
      ? { address, offset: 0, busy: true, loaded: false, hasMore: true } : null;
    sessionRef.current = session;
    let cancelled = false;
    const loadInitial = async () => {
      if (!session) return;
      setIsInitialLoading(true);
      try {
        const fetched = await fetchTokenBalances(session.address, { type: 'utxo', limit: PAGE_SIZE, offset: 0 });
        if (sessionRef.current !== session) return;
        setBalances(fetched as UtxoBalance[]);
        session.offset = PAGE_SIZE;
        session.loaded = true;
        session.hasMore = fetched.length === PAGE_SIZE;
        setHasMore(session.hasMore);
        setInitialLoaded(true);
      } catch {
        if (sessionRef.current === session) setError('initial');
      } finally {
        if (sessionRef.current === session) {
          session.busy = false;
          setIsInitialLoading(false);
        }
        settleRefresh();
      }
    };
    queueMicrotask(() => {
      if (cancelled) return;
      setBalances([]);
      setHasMore(false);
      setInitialLoaded(false);
      setIsFetchingMore(false);
      setError(null);
      if (session) void loadInitial();
      else {
        setIsInitialLoading(false);
        settleRefresh();
      }
    });
    return () => {
      cancelled = true;
      if (sessionRef.current === session) sessionRef.current = null;
      settleRefresh();
    };
  }, [address, walletId, refreshNonce, retryNonce]);

  const loadMore = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || session.busy || !session.loaded || !session.hasMore) return;
    session.busy = true;
    setIsFetchingMore(true);
    setError(null);
    try {
      const fetched = await fetchTokenBalances(session.address, { type: 'utxo', limit: PAGE_SIZE, offset: session.offset });
      if (sessionRef.current !== session) return;
      setBalances(previous => {
        const keys = new Set(previous.map(row => `${row.utxo}:${row.asset}`));
        return [...previous, ...(fetched as UtxoBalance[]).filter(row => !keys.has(`${row.utxo}:${row.asset}`))];
      });
      session.offset += PAGE_SIZE;
      session.hasMore = fetched.length === PAGE_SIZE;
      setHasMore(session.hasMore);
    } catch {
      if (sessionRef.current === session) setError('more');
    } finally {
      if (sessionRef.current === session) {
        session.busy = false;
        setIsFetchingMore(false);
      }
    }
  }, []);

  const isSearching = !!searchQuery.trim();
  useEffect(() => {
    if ((!inView && !isSearching) || !initialLoaded || !hasMore || isFetchingMore || error) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void loadMore(); });
    return () => { cancelled = true; };
  }, [inView, isSearching, initialLoaded, hasMore, isFetchingMore, error, loadMore]);

  const filteredBalances = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return balances.filter(token => !query || token.asset.toLowerCase().includes(query)
      || token.asset_info?.asset_longname?.toLowerCase().includes(query)
      || token.utxo.toLowerCase().includes(query));
  }, [balances, searchQuery]);

  return (
    <div className="space-y-2">
      <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder={t('utxo_utxo_list_search_utxos')}
        name="utxo-search" className="mt-0.5 mb-3" showClearButton />
      {isInitialLoading ? <Spinner message={t('utxo_utxo_list_loading_utxo_balances')} /> : (
        <>
          {filteredBalances.map(token => (
            <UtxoCard token={token} key={`${token.utxo}:${token.asset}`} pendingStatus={pendingByUtxoLabel.get(token.utxo)} />
          ))}
          {error ? (
            <div role="alert" className="py-4 text-center text-sm text-red-600">
              <p>{error === 'initial' ? t('utxo_utxo_list_load_failed') : t('utxo_utxo_list_load_more_failed')}</p>
              <button type="button" onClick={() => initialLoaded ? void loadMore() : setRetryNonce(n => n + 1)}
                className="mt-2 text-blue-600 underline cursor-pointer">{t('common_retry')}</button>
            </div>
          ) : !filteredBalances.length && !hasMore && (
            <div className="text-center py-4 text-gray-500">
              {isSearching ? t('utxo_utxo_list_no_matching_utxos') : t('utxo_utxo_list_no_utxo_attached_balances')}
            </div>
          )}
          <div ref={loadMoreRef} className="flex flex-col justify-center items-center py-1">
            {hasMore && !error && (isFetchingMore || isSearching
              ? <Spinner message={isSearching ? t('utxo_utxo_list_searching_utxo_balances') : undefined} />
              : <div className="text-sm text-gray-500">{t('common_scroll_to_load_more')}</div>)}
          </div>
        </>
      )}
    </div>
  );
};
