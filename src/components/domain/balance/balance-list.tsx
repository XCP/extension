import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchResultCard } from "@/components/domain/asset/search-result-card";
import { BalanceCard } from "@/components/domain/balance/balance-card";
import { SearchInput } from "@/components/ui/inputs/search-input";
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { pendingLabel } from "@/core/balances/pendingLabel";
import { spendableBalance, tracksPendingLedgerDebits } from "@/core/balances/spendable";
import { fetchBTCBalance } from "@/core/bitcoin/balance";
import type { TokenBalance } from "@/core/counterparty/api";
import { fetchTokenBalance, fetchTokenBalances } from "@/core/counterparty/api";
import { asDisplayUnits, fromSatoshis, isGreaterThan } from '@/core/numeric';
import { useInView } from "@/hooks/useInView";
import { usePendingDeltas } from "@/hooks/usePendingStatus";
import { useRefreshSignal } from "@/hooks/useRefreshSignal";
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
  const { activeWallet, activeAddress } = useWallet();
  const { settings } = useSettings();
  const { cacheBalances } = useHeader();
  const [allBalances, setAllBalances] = useState<TokenBalance[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const { searchQuery, setSearchQuery, searchResults, isSearching } = useSearchQuery();

  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "300px", threshold: 0 });

  useEffect(() => {
    setInitialLoaded(false);
  }, [settings?.pinnedAssets]);

  // A refresh reuses the same lever the pinned-asset list already pulls, rather than adding a
  // second path through the loading code.
  useRefreshSignal(refreshNonce, () => setInitialLoaded(false));

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

  // Held in a ref for the same reason as in useRefreshSignal: callers pass an inline arrow, and
  // depending on it would restart the load on every render of the parent.
  const latestOnRefreshed = useRef(onRefreshed);
  latestOnRefreshed.current = onRefreshed;

  const pendingByAssetLabel = useMemo(() => {
    const labels = new Map<string, string>();
    for (const [asset, delta] of pendingDeltas) {
      const label = pendingLabel(delta.reasons);
      if (label) labels.set(asset, label);
    }
    return labels;
  }, [pendingDeltas]);

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
    if (!activeAddress || !activeWallet || initialLoaded) {
      if (!activeAddress || !activeWallet) {
        setAllBalances([]);
        setOffset(0);
        setHasMore(true);
      }
      return;
    }

    let isCancelled = false;

    const loadInitialBalances = async () => {
      console.log('[BalanceList] Loading initial balances...');
      setIsInitialLoading(true);
      try {
        const balanceSats = await fetchBTCBalance(activeAddress.address);
        const btcBalance: TokenBalance = {
          asset: "BTC",
          quantity_normalized: asDisplayUnits(fromSatoshis(balanceSats)),
          asset_info: {
            asset_longname: null,
            description: "Bitcoin",
            issuer: "",
            divisible: true,
            locked: true,
            supply: "21000000"
          },
        };
        if (!isCancelled) upsertBalance(btcBalance);

        const pinnedAssets = settings?.pinnedAssets || [];
        const nonBTCAssets = pinnedAssets.filter((asset) => asset.toUpperCase() !== "BTC");
        const balancePromises = nonBTCAssets.map(async (asset) => {
          try {
            const balance = await fetchTokenBalance(activeAddress.address, asset, { type: 'address' });
            return { asset, balance };
          } catch (error) {
            console.error(`Error fetching ${asset} balance:`, error);
            return null;
          }
        });
        const results = await Promise.all(balancePromises);
        results.forEach((result) => {
          if (result && result.balance && !isCancelled) {
            upsertBalance(result.balance);
          }
        });
      } catch (error) {
        console.error("Error in loadInitialBalances:", error);
      } finally {
        if (!isCancelled) {
          console.log('[BalanceList] Initial load complete');
          setIsInitialLoading(false);
          setInitialLoaded(true);
          setOffset(0);
          setHasMore(true);
        }
        // Outside the isCancelled guard on purpose. A cancelled load still ends the refresh the
        // caller is showing a spinner for; leaving it spinning because the address changed
        // mid-flight would strand it there.
        latestOnRefreshed.current?.();
      }
    };

    loadInitialBalances();

    return () => { isCancelled = true; };
  }, [activeAddress, activeWallet, upsertBalance, initialLoaded, settings?.pinnedAssets]);

  // Load more on scroll
  useEffect(() => {
    if (!activeAddress || !activeWallet || !hasMore || isFetchingMore || !inView) {
      return;
    }

    console.log('[BalanceList] Loading more from offset:', offset);

    const loadMoreBalances = async () => {
      setIsFetchingMore(true);
      try {
        const limit = 20; // Increased from 10 to 20
        const fetchedBalances = await fetchTokenBalances(activeAddress.address, { type: 'address', limit, offset });
        console.log('[BalanceList] Fetched', fetchedBalances.length, 'balances');

        // If we get less than requested, or no balances at all, no more to load
        if (fetchedBalances.length < limit) {
          console.log('[BalanceList] No more balances to load (got', fetchedBalances.length, 'of', limit, ')');
          setHasMore(false);
        }

        // Only process if we have balances
        if (fetchedBalances.length > 0) {
          console.log('[BalanceList] Processing fetched balances...');
          fetchedBalances.forEach((balance) => {
            upsertBalance(balance);
          });

          // Only increment offset if we processed some balances
          setOffset((prev) => {
            console.log('[BalanceList] Updating offset from', prev, 'to', prev + limit);
            return prev + limit;
          });
        } else {
          console.log('[BalanceList] No balances returned, stopping pagination');
          setHasMore(false);
        }
      } catch (error) {
        console.error("Error fetching more balances:", error);
        setHasMore(false);
      } finally {
        setIsFetchingMore(false);
      }
    };

    loadMoreBalances();
  }, [inView, activeAddress, activeWallet, hasMore, offset, upsertBalance, isFetchingMore]);

  // BTC is always pinned, plus user's pinned assets
  const pinnedAssets = ["BTC"].concat((settings?.pinnedAssets || []).map((a) => a.toUpperCase()));

  const pinnedBalances = allBalances.filter((balance) => {
    const assetUpper = balance.asset.toUpperCase();
    const isPinned = pinnedAssets.includes(assetUpper);
    if (!isPinned) return false;

    // BTC always shows even if 0
    if (assetUpper === "BTC") return true;

    // XCP shows even if 0 only when pinned
    if (assetUpper === "XCP" && isPinned) return true;

    // Other pinned assets only show if non-zero
    return balance.quantity_normalized !== undefined
      && isGreaterThan(balance.quantity_normalized, 0);
  });

  const otherBalances = allBalances.filter((balance) =>
    !pinnedAssets.includes(balance.asset.toUpperCase())
  );

  if (isInitialLoading) return <Spinner message="Loading balances…" />;

  return (
    <div className="space-y-2">
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search balances…"
        name="balance-search"
        className="mt-0.5 mb-3"
        showClearButton={true}
        isLoading={isSearching}
      />
      {searchQuery ? (
        isSearching ? (
          <Spinner message="Searching balances…" />
        ) : searchResults.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No results found</div>
        ) : (
          searchResults.map((asset) => <SearchResultCard key={asset.symbol} symbol={asset.symbol} navigationType="balance" />)
        )
      ) : (
        <>
          {pinnedBalances.map((balance) => (
            <BalanceCard token={displayBalance(balance)} key={balance.asset} pendingStatus={pendingByAssetLabel.get(balance.asset)} />
          ))}
          {otherBalances.map((balance) => (
            <BalanceCard token={displayBalance(balance)} key={balance.asset} pendingStatus={pendingByAssetLabel.get(balance.asset)} />
          ))}
          <div ref={loadMoreRef} className="flex flex-col justify-center items-center py-1">
            {hasMore ? (
              isFetchingMore ? (
                <Spinner className="py-4" />
              ) : (
                <div className="text-sm text-gray-500">Scroll to load more…</div>
              )
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};