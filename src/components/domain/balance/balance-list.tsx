import { type ReactElement, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { SearchResultCard } from "@/components/domain/asset/search-result-card";
import { BalanceCard } from "@/components/domain/balance/balance-card";
import { SearchInput } from "@/components/ui/inputs/search-input";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { t } from '@/i18n';
import { useLocaleRevision } from '@/i18n/use-locale';

import { spendableBalance, tracksPendingLedgerDebits } from "@/core/balances/spendable";
import { fetchBTCBalance } from "@/core/bitcoin/balance";
import type { TokenBalance } from "@/core/counterparty/api";
import { fetchTokenBalance, fetchTokenBalances } from "@/core/counterparty/api";
import { normalizeAssetQuery } from "@/core/format";
import { asDisplayUnits, fromSatoshis, isGreaterThan } from '@/core/numeric';
import { useInView } from "@/hooks/useInView";
import { labelsFromDeltas, usePendingDeltas } from "@/hooks/usePendingStatus";
import { useSearchQuery } from "@/hooks/useSearchQuery";



interface BalanceListProps {
  /**
   * Changes to ask for a fresh load. A counter rather than a boolean so two presses are two
   * refreshes; the caller clears the relevant caches first, or this reads them straight back.
   */
  refreshNonce?: number;
  /** Called when a requested refresh has finished, successfully or not, so the caller can stop
   * showing it as in flight. Fires on completion rather than on success: a refresh that failed is
   * still over, and a spinner that never stops is a worse lie than a stale number. */
  onRefreshed?: () => void;
}

export const BalanceList = ({ refreshNonce, onRefreshed }: BalanceListProps = {}): ReactElement => {
  useLocaleRevision();
  const { activeWallet, activeAddress } = useWallet();
  const { settings } = useSettings();
  const { cacheBalances } = useHeader();
  const address = activeAddress?.address;
  const walletId = activeWallet?.id;
  const pinnedAssetKey = (settings?.pinnedAssets ?? []).map(normalizeAssetQuery).join("\n");
  const [allBalances, setAllBalances] = useState<TokenBalance[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(Boolean(address && walletId));
  const [error, setError] = useState<'initial' | 'more' | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const sessionRef = useRef<{ address: string; offset: number; busy: boolean; loaded: boolean; hasMore: boolean } | null>(null);
  const previousRefreshNonce = useRef(refreshNonce);
  const notifyRefreshed = useEffectEvent((completedNonce: number | undefined) => {
    if (completedNonce === refreshNonce) onRefreshed?.();
  });
  const { searchQuery, setSearchQuery, searchResults, isSearching, error: searchError, retry: retrySearch } = useSearchQuery();
  const isSearchActive = searchQuery.trim().length > 0;

  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "300px", threshold: 0 });

  // Read alongside the balances and on the same refresh, so the amount and what is happening to it
  // never come from two different moments.
  const { byAsset: pendingDeltas } = usePendingDeltas(activeAddress?.address, refreshNonce);

  /**
   * The figure on the card is what is spendable, not what the ledger has confirmed.
   *
   * The alternative was showing the confirmed balance here and the spendable one in the forms, but
   * two screens disagreeing about the same asset is worse than one number that differs from an
   * explorer — and the italic status beside it is what explains the difference. Everywhere in this
   * wallet, the number means the same thing: what you can spend right now.
   */
  const displayBalance = useCallback((balance: TokenBalance): TokenBalance => {
    const pending = pendingDeltas.get(balance.asset);
    if (!pending || !tracksPendingLedgerDebits(balance.asset)) return balance;

    const { spendable } = spendableBalance(balance.quantity_normalized, pending.debitedNormalized);
    if (spendable === balance.quantity_normalized) return balance;
    return { ...balance, quantity_normalized: asDisplayUnits(spendable) };
  }, [pendingDeltas]);

  const pendingByAssetLabel = useMemo(() => labelsFromDeltas(pendingDeltas), [pendingDeltas]);

  const upsertBalance = useCallback((balance: TokenBalance) => {
    if (!balance?.asset || balance?.quantity_normalized === undefined) {
      return;
    }

    // Cache balance for instant display on detail pages
    cacheBalances([balance]);

    setAllBalances((prev) => {
      const idx = prev.findIndex((b) => b.asset.toUpperCase() === balance.asset.toUpperCase());
      if (idx > -1) {
        const newBalances = [...prev];
        newBalances[idx] = balance;
        return newBalances;
      }
      return [...prev, balance];
    });
  }, [cacheBalances]);

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
    // A new object owns this address/refresh's initial load and all subsequent pages.
    const session = address && walletId ? { address, offset: 0, busy: true, loaded: false, hasMore: true } : null;
    sessionRef.current = session;
    let cancelled = false;

    const loadInitialBalances = async () => {
      if (!session) return;
      setIsInitialLoading(true);
      try {
        const btcPromise = fetchBTCBalance(session.address).then((balanceSats): TokenBalance => ({
          asset: "BTC",
          quantity_normalized: asDisplayUnits(fromSatoshis(balanceSats)),
          asset_info: {
            asset_longname: null,
            description: t('balance_balance_list_bitcoin'),
            issuer: "",
            divisible: true,
            locked: true,
            supply: "21000000"
          },
        }));
        const nonBTCAssets = [...new Set(pinnedAssetKey.split("\n").filter((asset) => asset && asset !== "BTC"))];
        const results = await Promise.allSettled([
          btcPromise,
          ...nonBTCAssets.map((asset) => fetchTokenBalance(session.address, asset, { type: "address" })),
        ]);
        if (sessionRef.current !== session) return;
        const balances = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
        setAllBalances(balances);
        cacheBalances(balances);
        const failure = results.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
        session.loaded = true;
        setInitialLoaded(true);
        setHasMore(true);
      } catch (error) {
        if (sessionRef.current === session) {
          console.error("Error in loadInitialBalances:", error);
          setError('initial');
        }
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
      setAllBalances([]);
      setHasMore(false);
      setInitialLoaded(false);
      setIsFetchingMore(false);
      setError(null);
      if (session) void loadInitialBalances();
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
  }, [address, walletId, cacheBalances, pinnedAssetKey, refreshNonce, retryNonce]);

  // Load more on scroll
  const loadMore = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || session.busy || !session.loaded || !session.hasMore) return;
    session.busy = true;
    setIsFetchingMore(true);
    setError(null);
    try {
      const limit = 20;
      const fetchedBalances = await fetchTokenBalances(session.address, { type: 'address', limit, offset: session.offset });
      if (sessionRef.current !== session) return;
      fetchedBalances.forEach(upsertBalance);
      session.offset += limit;
      session.hasMore = fetchedBalances.length === limit;
      setHasMore(session.hasMore);
    } catch (error) {
      if (sessionRef.current === session) {
        console.error("Error fetching more balances:", error);
        setError('more');
      }
    } finally {
      if (sessionRef.current === session) {
        session.busy = false;
        setIsFetchingMore(false);
      }
    }
  }, [upsertBalance]);

  useEffect(() => {
    if (!inView || !initialLoaded || !hasMore || isFetchingMore || error || isSearchActive) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void loadMore(); });
    return () => { cancelled = true; };
  }, [inView, initialLoaded, hasMore, isFetchingMore, error, isSearchActive, loadMore]);

  // BTC is always pinned, plus user's pinned assets
  const pinnedAssets = ["BTC"].concat((settings?.pinnedAssets || []).map((a) => a.toUpperCase()));

  const pinnedBalances = allBalances.filter((balance) =>
    pinnedAssets.includes(balance.asset.toUpperCase())
  );

  const otherBalances = allBalances.filter((balance) =>
    !pinnedAssets.includes(balance.asset.toUpperCase())
  );

  // A spendable balance of zero is not worth a row: once the debit confirms, the ledger drops the
  // row itself, so skipping it now just gets there early. The zero test runs on the figure the
  // card would show — an asset fully escrowed on an in-mempool order reads 0 and is skipped even
  // though the ledger still lists it. BTC always shows, and XCP shows at zero while pinned, so an
  // empty wallet still has somewhere to say "0".
  const visibleBalances = (balances: TokenBalance[]) =>
    balances
      .map((balance) => ({ balance, shown: displayBalance(balance) }))
      .filter(({ balance, shown }) => {
        const assetUpper = balance.asset.toUpperCase();
        if (assetUpper === "BTC") return true;
        if (assetUpper === "XCP" && pinnedAssets.includes("XCP")) return true;
        return shown.quantity_normalized !== undefined
          && isGreaterThan(shown.quantity_normalized, 0);
      });

  return (
    <div className="space-y-2">
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={t('balance_balance_list_search_balances')}
        name="balance-search"
        className="mt-0.5 mb-3"
        showClearButton={true}
        isLoading={isSearching}
      />
      {isSearchActive ? (
        isSearching ? (
          <Spinner message={t('balance_balance_list_searching_balances')} />
        ) : searchError ? (
          <div role="alert" className="py-4 text-center text-sm text-red-600">
            <p>{searchError}</p>
            <button type="button" onClick={retrySearch} className="mt-2 text-blue-600 underline cursor-pointer">{t('common_retry')}</button>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="text-center py-4 text-gray-500">{t('common_no_results_found')}</div>
        ) : (
          searchResults.map((asset) => <SearchResultCard key={asset.symbol} symbol={asset.symbol} navigationType="balance" />)
        )
      ) : isInitialLoading ? (
        <Spinner message={t('balance_balance_list_loading_balances')} />
      ) : (
        <>
          {error && (
            <div role="alert" className="py-4 text-center text-sm text-red-600">
              <p>{error === 'initial' ? t('balance_balance_list_load_failed') : t('balance_balance_list_load_more_failed')}</p>
              <button type="button" onClick={() => initialLoaded ? void loadMore() : setRetryNonce((n) => n + 1)} className="mt-2 text-blue-600 underline cursor-pointer">{t('common_retry')}</button>
            </div>
          )}
          {visibleBalances(pinnedBalances).map(({ balance, shown }) => (
            <BalanceCard token={shown} key={balance.asset} pendingStatus={pendingByAssetLabel.get(balance.asset)} />
          ))}
          {visibleBalances(otherBalances).map(({ balance, shown }) => (
            <BalanceCard token={shown} key={balance.asset} pendingStatus={pendingByAssetLabel.get(balance.asset)} />
          ))}
          <div ref={loadMoreRef} className="flex flex-col justify-center items-center py-1">
            {hasMore && !error ? (
              isFetchingMore ? (
                <Spinner className="py-4" />
              ) : (
                <div className="text-sm text-gray-500">{t('common_scroll_to_load_more')}</div>
              )
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};
