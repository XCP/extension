import { type ReactElement, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { SearchResultCard } from "@/components/domain/asset/search-result-card";
import { BalanceCard } from "@/components/domain/balance/balance-card";
import { SearchInput } from "@/components/ui/inputs/search-input";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { spendableBalance, tracksPendingLedgerDebits } from "@/core/balances/spendable";
import { fetchBTCBalance } from "@/core/bitcoin/balance";
import type { TokenBalance } from "@/core/counterparty/api";
import { emptyTokenBalance, fetchTokenBalance, fetchTokenBalancesPage } from "@/core/counterparty/api";
import { normalizeAssetQuery } from "@/core/format";
import { asDisplayUnits, fromSatoshis, isGreaterThan } from '@/core/numeric';
import { fetchZeldBalance, ZELD_WALLET_ASSET, zeldBaseUnitsToDisplay } from '@/core/zeld/api';
import { useInView } from "@/hooks/useInView";
import { labelsFromDeltas, usePendingDeltas } from "@/hooks/usePendingStatus";
import { useSearchQuery } from "@/hooks/useSearchQuery";
import { BTC_ASSET_INFO } from "@/hooks/utils/fetchAssetData";
import { t } from '@/i18n';

/**
 * Balance rows per request. The node answers a page of 100 as fast as a page of 20, and most
 * wallets fit in one, so the first page is usually the whole list and also answers every pinned
 * asset without a request of its own.
 */
const PAGE_SIZE = 100;

/** Whether the list continues past what has been read, by the node's count when it gave one. */
function pageHasMore(page: { result: TokenBalance[]; result_count: number | null }, nextOffset: number): boolean {
  if (page.result.length === 0) return false;
  return page.result_count !== null ? nextOffset < page.result_count : page.result.length === PAGE_SIZE;
}

/**
 * How a pin names an asset: a subasset by its case-kept long name (normalizeAssetQuery), anything
 * else upper-cased.
 */
const pinKey = (name: string): string => normalizeAssetQuery(name);

/**
 * The names a balance row answers to. The node lists a subasset under its numeric `A…` name with
 * the long name in `asset_info`, while a pin, and the per-asset read made for it, use the long name.
 */
function balanceNames(balance: TokenBalance): string[] {
  const longname = balance.asset_info?.asset_longname;
  return longname ? [pinKey(balance.asset), longname] : [pinKey(balance.asset)];
}

/** Whether two rows are the same asset, whichever of its names each carries. */
function sameAsset(a: TokenBalance, b: TokenBalance): boolean {
  const names = balanceNames(b);
  return balanceNames(a).some((name) => names.includes(name));
}

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
  const { activeWallet, activeAddress } = useWallet();
  const { settings } = useSettings();
  const { cacheBalances } = useHeader();
  const address = activeAddress?.address;
  const walletId = activeWallet?.id;
  const pinnedAssetKey = (settings?.pinnedAssets ?? []).map(normalizeAssetQuery).join("\n");
  const zeldEnabled = (settings?.zeldHuntSeconds ?? 0) > 0;
  const [allBalances, setAllBalances] = useState<TokenBalance[]>([]);
  const [zeldBalance, setZeldBalance] = useState<TokenBalance | null>(null);
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

  const upsertBalance = useCallback((holder: string, balance: TokenBalance) => {
    if (!balance?.asset || balance?.quantity_normalized === undefined) {
      return;
    }

    // Cache balance for instant display on detail pages
    cacheBalances(holder, [balance]);

    setAllBalances((prev) => {
      const idx = prev.findIndex((b) => sameAsset(b, balance));
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
            supply: BTC_ASSET_INFO.supply,
          },
        }));
        const nonBTCAssets = [...new Set(pinnedAssetKey.split("\n").filter((asset) => asset && asset !== "BTC"))];
        // Always discover earned ZELD, even with hunting off, but never make ordinary balances,
        // pagination or refresh completion wait for this independent indexer.
        void fetchZeldBalance(session.address).then((zeld) => {
          if (sessionRef.current !== session) return;
          const balance: TokenBalance = {
            asset: ZELD_WALLET_ASSET,
            quantity_normalized: zeldBaseUnitsToDisplay(zeld.baseUnits),
            asset_info: {
              asset_longname: null,
              description: "ZeldHash ZELD",
              issuer: "",
              divisible: true,
              locked: false,
            },
          };
          setZeldBalance(balance);
          cacheBalances(session.address, [balance]);
        }).catch(() => {
          // Leave the optional row absent; the ZELD page explains an unavailable balance.
        });
        const firstPage = fetchTokenBalancesPage(session.address, { type: "address", limit: PAGE_SIZE, offset: 0 });
        const [btcResult, pageResult] = await Promise.allSettled([btcPromise, firstPage]);
        if (sessionRef.current !== session) return;
        const balances: TokenBalance[] = btcResult.status === "fulfilled" ? [btcResult.value] : [];
        let failure: unknown = btcResult.status === "rejected" ? btcResult.reason : undefined;
        if (pageResult.status === "fulfilled") {
          const page = pageResult.value;
          balances.push(...page.result);
          session.offset = page.result.length;
          session.hasMore = pageHasMore(page, session.offset);
          // Pinned assets are read from the page. When the node's count says the page is the whole
          // list, an asset missing from it is held at zero — the same row the per-asset read answers
          // with. Otherwise it may simply be further down, and only then is it asked for by name.
          // A subasset is pinned by its long name and listed under its numeric name, so the page
          // is matched on both.
          const listed = new Set(page.result.flatMap(balanceNames));
          const complete = page.result_count !== null && page.result_count <= page.result.length;
          const missing = nonBTCAssets.filter((asset) => !listed.has(pinKey(asset)));
          const lookups = await Promise.allSettled(missing.map((asset) =>
            complete
              ? Promise.resolve(emptyTokenBalance(asset))
              : fetchTokenBalance(session.address, asset, { type: "address" })));
          if (sessionRef.current !== session) return;
          for (const lookup of lookups) {
            if (lookup.status === "rejected") failure ??= lookup.reason;
            else if (lookup.value) balances.push(lookup.value);
          }
        } else {
          failure ??= pageResult.reason;
        }
        setAllBalances(balances);
        cacheBalances(session.address, balances);
        if (failure !== undefined) throw failure;
        session.loaded = true;
        setInitialLoaded(true);
        setHasMore(session.hasMore);
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
      setZeldBalance(null);
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
      const page = await fetchTokenBalancesPage(session.address, { type: 'address', limit: PAGE_SIZE, offset: session.offset });
      if (sessionRef.current !== session) return;
      for (const balance of page.result) upsertBalance(session.address, balance);
      session.offset += page.result.length;
      session.hasMore = pageHasMore(page, session.offset);
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

  // BTC is always pinned, then ZELD, then the user's pinned assets
  const pinnedAssets = ["BTC", ZELD_WALLET_ASSET, ...(settings?.pinnedAssets || [])].map(pinKey);
  /** Where a row sits among the pins, by any of its names; -1 when it is not pinned. */
  const pinIndex = (balance: TokenBalance) => {
    const found = balanceNames(balance).map((name) => pinnedAssets.indexOf(name)).filter((index) => index >= 0);
    return found.length ? Math.min(...found) : -1;
  };

  const balancesWithZeld = [...allBalances];
  if (zeldBalance) balancesWithZeld.splice(allBalances.findIndex(balance => balance.asset === "BTC") + 1, 0, zeldBalance);

  // In the order the user pinned them, not the order the node listed them.
  const pinnedBalances = balancesWithZeld
    .filter((balance) => pinIndex(balance) >= 0)
    .sort((a, b) => pinIndex(a) - pinIndex(b));

  const otherBalances = balancesWithZeld.filter((balance) => pinIndex(balance) < 0);

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
        // ZELD shows at zero while hunting is on, since the row is where the hunt explains itself,
        // and whenever there is a balance, so turning hunting off never hides ZELD already earned.
        if (assetUpper === ZELD_WALLET_ASSET.toUpperCase() && zeldEnabled) return true;
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
