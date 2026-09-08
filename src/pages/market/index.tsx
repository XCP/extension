import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { ManageDispenserCard } from "@/components/domain/dispenser/manage-dispenser-card";
import { MarketDispenserCard } from "@/components/domain/dispenser/market-dispenser-card";
import { PriceTicker } from "@/components/domain/price/price-ticker";
import { FaCheck, FaChevronRight, FaClipboard, FaLock, FiGlobe, FiUser } from "@/components/icons";
import { ManageOrderCard } from "@/components/ui/cards/manage-order-card";
import { MarketOrderCard } from "@/components/ui/cards/market-order-card";
import { PoolCard } from "@/components/ui/cards/pool-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/inputs/search-input";
import { Spinner } from "@/components/ui/spinner";
import { TabButton } from "@/components/ui/tab-button";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import {
  type DispenserDetails,
  fetchAddressPools,
  fetchPools,
  type OrderDetails,
  type Pool,
  type PoolPosition,
} from "@/core/counterparty/api";
import { normalizePoolPosition } from "@/core/counterparty/pool";
import { formatAddress, normalizeAssetQuery } from "@/core/format";
import { toNumber } from "@/core/numeric";
import { formatPrice } from "@/core/priceFormat";
import { getTradingPair } from "@/core/tradingPair";
import { useInView } from "@/hooks/useInView";
import { useMarketData } from "@/hooks/useMarketData";
import { useMarketPrices } from "@/hooks/useMarketPrices";
import { usePendingCancellations } from "@/hooks/usePendingStatus";

import { t } from '@/i18n';

// Constants
const COPY_FEEDBACK_MS = 2000;
const POOL_PAGE_SIZE = 20;

interface ListingPage {
  error: Error | null;
  isFetchingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

function ListingStatus({ page, searching = false }: { page: ListingPage; searching?: boolean }) {
  if (page.error) return (
    <div role="alert" className="text-center text-sm text-gray-600">
      <p>{t('market_failed_to_load_listings')}</p>
      <button type="button" onClick={page.refresh}
        className="mt-2 rounded px-3 py-1 text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        {t('common_retry')}
      </button>
    </div>
  );
  if (page.isFetchingMore || searching) return <Spinner message={searching ? t('market_searching') : t('common_loading_more')} />;
  return page.hasMore ? (
    <button type="button" onClick={page.loadMore}
      className="rounded px-3 py-1 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      {t('common_load_more')}
    </button>
  ) : null;
}

/**
 * Market page displays the XCP DEX marketplace with Dispensers, Orders, and Pools tabs.
 */
export default function MarketPage(): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { setHeaderProps } = useHeader();
  const { settings } = useSettings();
  const { activeAddress, lockKeychain } = useWallet();
  const { btc, xcp } = useMarketPrices(settings.fiat);

  // Address copy state
  const [addressCopied, setAddressCopied] = useState(false);

  // Tab and view mode state from URL params
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const viewMode = searchParams.get("mode") === "manage" ? "manage" : "explore";
  const activeTab = tabParam === "dispensers" ? 0 : tabParam === "pools" ? 2 : 1;

  const TAB_NAMES = ["dispensers", "orders", "pools"] as const;
  const setActiveTab = (tab: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", TAB_NAMES[tab]!);
      return next;
    }, { replace: true });
  };

  const setViewMode = (mode: "explore" | "manage") => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("mode", mode);
      return next;
    }, { replace: true });
  };

  // Unified search state synced with URL
  const searchQuery = searchParams.get("search") || "";

  const setSearchQuery = useCallback((query: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (query.trim()) {
        next.set("search", query);
      } else {
        next.delete("search");
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Infinite scroll ref
  const { ref: loadMoreRef, inView } = useInView({ rootMargin: "200px", threshold: 0 });

  // Market data hook - encapsulates all data fetching and filtering
  const {
    dispensers,
    orders,
    userDispensers,
    userOrders,
    filteredUserDispensers,
    filteredUserOrders,
    dispenserResults,
    orderResults,
    dispenserSearchLoading,
    orderSearchLoading,
    dispenserSearch,
    orderSearch,
  } = useMarketData({
    activeAddress: activeAddress?.address,
    activeTab,
    viewMode,
    searchQuery,
    inView,
  });

  // Which of this address's orders and dispensers already have their ending in the mempool, so
  // the Manage lists can stand their Cancel/Close buttons down instead of inviting a duplicate.
  // Gated to the two tabs that render those buttons — the read skips the response cache for
  // freshness, so it should not fire for a pools view that never consults it.
  const wantsCancellations = viewMode === "manage" && (activeTab === 0 || activeTab === 1);
  const { orderHashes: cancellingOrders, dispenserHashes: closingDispensers } =
    usePendingCancellations(wantsCancellations ? activeAddress?.address : undefined);

  // Pool state (explore = all pools, manage = user's LP positions)
  const poolAddress = activeAddress?.address;
  const [pools, setPools] = useState<Pool[]>([]);
  const [userPools, setUserPools] = useState<PoolPosition[]>([]);
  const [poolsLoading, setPoolsLoading] = useState(false);
  const [poolsFetchingMore, setPoolsFetchingMore] = useState(false);
  const [poolsError, setPoolsError] = useState("");
  const [poolsOffset, setPoolsOffset] = useState(0);
  const [poolsHasMore, setPoolsHasMore] = useState(true);
  const [poolsInitialLoaded, setPoolsInitialLoaded] = useState(false);
  const [poolsReload, setPoolsReload] = useState(0);
  const poolsSession = useRef<{ cancelled: boolean; busy: boolean } | null>(null);

  const appendPools = useCallback((newPools: Pool[]) => {
    setPools((current) => {
      const existing = new Set(current.map((pool) => pool.lp_asset));
      const unique = newPools.filter((pool) => !existing.has(pool.lp_asset));
      return [...current, ...unique];
    });
  }, []);

  const appendUserPools = useCallback((newPools: PoolPosition[]) => {
    setUserPools((current) => {
      const existing = new Set(current.map((pool) => pool.lp_asset));
      const unique = newPools.filter((pool) => !existing.has(pool.lp_asset));
      return [...current, ...unique];
    });
  }, []);

  useEffect(() => {
    if (activeTab !== 2) return;

    const session = { cancelled: false, busy: true };
    poolsSession.current = session;
    setPools([]);
    setUserPools([]);
    setPoolsOffset(0);
    setPoolsHasMore(true);
    setPoolsInitialLoaded(false);
    setPoolsLoading(true);
    setPoolsFetchingMore(false);
    setPoolsError("");

    const loadPools = async () => {
      try {
        if (viewMode === "manage") {
          if (!poolAddress) {
            setPoolsHasMore(false);
            setPoolsInitialLoaded(true);
            return;
          }
          const response = await fetchAddressPools(poolAddress, { limit: POOL_PAGE_SIZE, offset: 0 });
          if (session.cancelled) return;
          setUserPools(response.result.map(normalizePoolPosition));
          setPoolsHasMore(response.result.length === POOL_PAGE_SIZE && response.result.length < response.result_count);
        } else {
          const response = await fetchPools({ limit: POOL_PAGE_SIZE, offset: 0 });
          if (session.cancelled) return;
          setPools(response.result);
          setPoolsHasMore(response.result.length === POOL_PAGE_SIZE && response.result.length < response.result_count);
        }
        setPoolsOffset(POOL_PAGE_SIZE);
        setPoolsInitialLoaded(true);
      } catch (err) {
        if (!session.cancelled) {
          setPoolsError(err instanceof Error ? err.message : t('market_failed_to_load_pools'));
          setPoolsInitialLoaded(true);
        }
      } finally {
        if (!session.cancelled) {
          session.busy = false;
          setPoolsLoading(false);
        }
      }
    };

    loadPools();

    return () => {
      session.cancelled = true;
    };
  }, [poolAddress, activeTab, viewMode, poolsReload]);

  const loadMorePools = useCallback(async () => {
    const session = poolsSession.current;
    if (!session || session.cancelled || session.busy || activeTab !== 2
      || !poolsHasMore || poolsLoading || !poolsInitialLoaded) {
      return;
    }
    if (viewMode === "manage" && !poolAddress) return;

    // The request belongs to this address/view session. Changing loading state or
    // scrolling must not cancel its response; leaving the session still does.
    session.busy = true;
    setPoolsFetchingMore(true);
    setPoolsError("");
    try {
      if (viewMode === "manage") {
        const response = await fetchAddressPools(poolAddress!, { limit: POOL_PAGE_SIZE, offset: poolsOffset });
        if (session.cancelled) return;
        appendUserPools(response.result.map(normalizePoolPosition));
        setPoolsHasMore(response.result.length === POOL_PAGE_SIZE && poolsOffset + response.result.length < response.result_count);
      } else {
        const response = await fetchPools({ limit: POOL_PAGE_SIZE, offset: poolsOffset });
        if (session.cancelled) return;
        appendPools(response.result);
        setPoolsHasMore(response.result.length === POOL_PAGE_SIZE && poolsOffset + response.result.length < response.result_count);
      }
      setPoolsOffset((current) => current + POOL_PAGE_SIZE);
    } catch (err) {
      if (!session.cancelled) {
        setPoolsError(err instanceof Error ? err.message : t('market_failed_to_load_more_pools'));
      }
    } finally {
      if (!session.cancelled) {
        session.busy = false;
        setPoolsFetchingMore(false);
      }
    }
  }, [
    poolAddress,
    activeTab,
    appendPools,
    appendUserPools,
    poolsHasMore,
    poolsInitialLoaded,
    poolsLoading,
    poolsOffset,
    viewMode,
  ]);

  useEffect(() => {
    // Core has no pool-search endpoint. Finish the remaining pages during a
    // search, including when the loaded page contains no matching cards.
    if (poolsError || (!inView && !searchQuery.trim())) return;
    // Start after this effect flush, allowing a view reset to settle first.
    // Cleanup cancels only a queued start; running requests belong to the session.
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadMorePools();
    });
    return () => { cancelled = true; };
  }, [inView, searchQuery, poolsError, poolsFetchingMore, loadMorePools]);

  const filterPools = <T extends Pool>(poolList: T[]): T[] => {
    const q = searchQuery.trim().toUpperCase();
    if (!q) return poolList;
    return poolList.filter((pool) =>
      pool.asset_a.toUpperCase().includes(q) ||
      pool.asset_b.toUpperCase().includes(q) ||
      pool.lp_asset.toUpperCase().includes(q)
    );
  };
  const filteredPools = filterPools(pools);
  const filteredUserPools = filterPools(userPools);
  const visiblePools = viewMode === "explore" ? filteredPools : filteredUserPools;
  const poolsSearchPending = searchQuery.trim().length > 0 && poolsHasMore && !poolsError;

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: t('common_market'),
      onBack: () => navigate("/index"),
      rightButton: {
        icon: <FaLock aria-hidden="true" />,
        onClick: async () => {
          await lockKeychain();
          navigate("/keychain/unlock");
        },
        ariaLabel: t('common_lock_keychain'),
      },
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, lockKeychain]);

  // Address copy feedback timer
  useEffect(() => {
    if (addressCopied) {
      const timer = setTimeout(() => setAddressCopied(false), COPY_FEEDBACK_MS);
      return () => clearTimeout(timer);
    }
  }, [addressCopied]);

  // Handlers
  const handleCopyAddress = () => {
    if (!activeAddress) return;
    navigator.clipboard.writeText(activeAddress.address).then(() => {
      setAddressCopied(true);
    });
  };

  const handleAddressSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate("/addresses", { state: { returnTo: location.pathname + location.search } });
  };

  const handleDispenserClick = (dispenser: DispenserDetails) => {
    navigate(`/market/dispensers/${dispenser.asset}`);
  };

  const handleOrderClick = (order: OrderDetails) => {
    const [baseAsset, quoteAsset] = getTradingPair(order.give_asset, order.get_asset);
    navigate(`/market/orders/${baseAsset}/${quoteAsset}`);
  };

  const isSearching = searchQuery.trim().length > 0;
  const dispenserPage = viewMode === "manage" ? userDispensers : isSearching ? dispenserSearch : dispensers;
  const orderPage = viewMode === "manage" ? userOrders : isSearching ? orderSearch : orders;
  const shownDispensers = viewMode === "manage" ? filteredUserDispensers : isSearching ? dispenserResults : dispensers.data;
  const shownOrderCount = viewMode === "manage" ? filteredUserOrders.length : isSearching ? orderResults.length : orders.data.length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col flex-grow min-h-0">
        {/* Fixed Header */}
        <div className="p-4 pb-0 flex-shrink-0">
          {/* Address Selector */}
          {activeAddress && (
            // Not a RadioGroup: one option, an onChange that did nothing, and `checked` always
            // true — it existed so the ternary would pick the selected styling. Copying the
            // address is a button, and saying so is what lets the keyboard reach it. The classes
            // are the branch that always won, so this renders identically.
            // Copying and choosing another address are two buttons side by side, not
            // one inside the other. Neither needs to guard the other's keypresses.
            <div className="relative w-full rounded bg-blue-600 text-white shadow-md mb-4">
              <button
                type="button"
                className="block w-full rounded p-4 cursor-pointer text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                onClick={handleCopyAddress}
                aria-label={t('common_current_address')}
              >
                <div className="text-sm mb-1 font-medium">{activeAddress.name}</div>
                <div className="flex justify-center items-center">
                  <span className="font-mono text-sm">{formatAddress(activeAddress.address)}</span>
                  {addressCopied ? (
                    <FaCheck className="ml-2 text-green-500" aria-hidden="true" />
                  ) : (
                    <FaClipboard className="ml-2" aria-hidden="true" />
                  )}
                </div>
              </button>
              <div className="absolute top-1/2 right-4 -translate-y-1/2">
                <button
                  type="button"
                  className="block py-6 px-3 -m-2 cursor-pointer hover:bg-white/5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  onClick={handleAddressSelection}
                  aria-label={t('common_select_another_address')}
                >
                  <FaChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          <PriceTicker
            btc={btc}
            xcp={xcp}
            currency={settings.fiat}
            onBtcClick={() => navigate("/market/btc")}
            onXcpClick={() => navigate("/market/xcp")}
            className="mb-4"
          />

          {/* Tab Header */}
          <div className="mb-2">
            <div className="flex items-center justify-between">
              <div className="flex space-x-4" role="tablist" aria-label={t('market_sections')}>
                {(["Dispensers", "Orders", "Pools"] as const).map((label, idx) => (
                  <button type="button"
                    key={label}
                    role="tab"
                    aria-selected={activeTab === idx}
                    className={`text-lg font-semibold bg-transparent p-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded ${
                      activeTab === idx ? "underline" : ""
                    }`}
                    onClick={() => setActiveTab(idx)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* View Mode Toggle */}
              <div className="flex gap-1" role="tablist" aria-label={t('market_view_mode')}>
                <TabButton isActive={viewMode === "explore"} onClick={() => setViewMode("explore")}>
                  <FiGlobe className="size-3.5" aria-hidden="true" />
                </TabButton>
                <TabButton isActive={viewMode === "manage"} onClick={() => setViewMode("manage")}>
                  <FiUser className="size-3.5" aria-hidden="true" />
                </TabButton>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-grow overflow-y-auto no-scrollbar px-4 pb-4">
          {activeTab === 0 && (
            <div className="space-y-3">
              <SearchInput value={searchQuery} onChange={setSearchQuery}
                placeholder={viewMode === "explore" ? t('market_search_asset_dispensers') : t('market_filter_your_dispensers')}
                name={viewMode === "explore" ? "dispenser-search" : "dispenser-filter"}
                isLoading={viewMode === "explore" && isSearching && dispenserSearchLoading}
                showClearButton className="mt-0.5" />
              {(dispenserPage.isLoading || (viewMode === "explore" && isSearching && dispenserSearchLoading)) ? (
                <Spinner message={isSearching ? t('market_searching') : t('common_loading_dispensers')} />
              ) : (
                <>
                  <div className="space-y-2">
                    {shownDispensers.map(d => viewMode === "manage" ? (
                      <ManageDispenserCard key={d.tx_hash} dispenser={d} isClosing={closingDispensers.has(d.tx_hash)} />
                    ) : (
                      <MarketDispenserCard key={d.tx_hash} dispenser={d}
                        formattedPrice={formatPrice(toNumber(d.satoshirate), settings.priceUnit, btc, settings.fiat)}
                        onClick={() => handleDispenserClick(d)} />
                    ))}
                  </div>
                  {!shownDispensers.length && !dispenserPage.hasMore && !dispenserPage.error && (
                    <EmptyState message={isSearching
                      ? t('market_no_dispensers_matching', [String(searchQuery)])
                      : viewMode === "manage" ? t('market_you_don_t_have_any') : t('market_no_open_dispensers_found')} />
                  )}
                  <div ref={loadMoreRef} className="flex justify-center py-2">
                    <ListingStatus page={dispenserPage} searching={dispenserPage.hasMore
                      && (shownDispensers.length === 0 || (viewMode === "manage" && isSearching))} />
                  </div>
                </>
              )}
              {viewMode === "manage" && (
                <button type="button"
                  onClick={() => navigate(isSearching ? `/compose/dispenser/${encodeURIComponent(normalizeAssetQuery(searchQuery))}` : "/compose/dispenser")}
                  className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                  {t('common_create_new_dispenser')}
                </button>
              )}
            </div>
          )}

          {activeTab === 1 && (
            <div className="space-y-3">
              <SearchInput value={searchQuery} onChange={setSearchQuery}
                placeholder={viewMode === "explore" ? t('market_search_asset_orders') : t('market_filter_your_orders')}
                name={viewMode === "explore" ? "order-search" : "order-filter"}
                isLoading={viewMode === "explore" && isSearching && orderSearchLoading}
                showClearButton className="mt-0.5" />
              {(orderPage.isLoading || (viewMode === "explore" && isSearching && orderSearchLoading)) ? (
                <Spinner message={isSearching ? t('market_searching') : t('market_loading_orders')} />
              ) : (
                <>
                  <div className="space-y-2">
                    {viewMode === "manage"
                      ? filteredUserOrders.map(o => <ManageOrderCard key={o.tx_hash} order={o} isCancelling={cancellingOrders.has(o.tx_hash)} />)
                      : (isSearching ? orderResults : orders.data).map(o => <MarketOrderCard key={o.tx_hash} order={o} onClick={() => handleOrderClick(o)} />)}
                  </div>
                  {!shownOrderCount && !orderPage.hasMore && !orderPage.error && (
                    <EmptyState message={isSearching
                      ? t('market_no_orders_matching', [String(searchQuery)])
                      : viewMode === "manage" ? t('market_you_don_t_have_any_2') : t('market_no_open_orders_found')} />
                  )}
                  <div ref={loadMoreRef} className="flex justify-center py-2">
                    <ListingStatus page={orderPage} searching={viewMode === "manage" && isSearching && orderPage.hasMore} />
                  </div>
                </>
              )}
              {viewMode === "manage" && (
                <button type="button"
                  onClick={() => navigate(isSearching ? `/compose/order/${encodeURIComponent(normalizeAssetQuery(searchQuery))}` : "/compose/order")}
                  className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                  {t('common_create_new_order')}
                </button>
              )}
            </div>
          )}

          {activeTab === 2 && (
            <div className="space-y-3">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder={viewMode === "explore" ? t('market_search_pools') : t('market_search_your_pools')}
                name={viewMode === "explore" ? "pool-filter" : "pool-manage-filter"}
                showClearButton
                className="mt-0.5"
              />
              {poolsLoading ? (
                <Spinner message={viewMode === "explore" ? t('market_loading_pools') : t('market_loading_your_pools')} />
              ) : (
                <>
                  {visiblePools.length > 0 && (
                    <div className="space-y-2">
                      {visiblePools.map((pool) => (
                        <PoolCard
                          key={pool.lp_asset}
                          pool={pool}
                          onClick={() => navigate(viewMode === "manage"
                            ? `/pools/${encodeURIComponent(pool.lp_asset)}`
                            : `/pools/${encodeURIComponent(pool.asset_a)}/${encodeURIComponent(pool.asset_b)}`)}
                        />
                      ))}
                    </div>
                  )}
                  {poolsError ? (
                    <div role="alert" className="text-center text-sm text-gray-600">
                      <p>{poolsError}</p>
                      <button type="button"
                        onClick={() => poolsOffset === 0 ? setPoolsReload((current) => current + 1) : void loadMorePools()}
                        className="mt-2 rounded px-3 py-1 text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        {t('common_retry')}
                      </button>
                    </div>
                  ) : visiblePools.length === 0 && !poolsSearchPending && (
                    <EmptyState message={isSearching
                      ? viewMode === "manage" ? t('market_no_pool_positions_matching', [String(searchQuery)]) : t('market_no_pools_matching', [String(searchQuery)])
                      : viewMode === "manage" ? t('market_you_don_t_have_any_3') : t('market_no_pools_found')} />
                  )}
                  <div ref={loadMoreRef} className="flex justify-center py-2">
                    {(poolsFetchingMore || poolsSearchPending) && !poolsError && (
                      <Spinner message={isSearching ? t('market_searching_pools') : undefined} />
                    )}
                  </div>
                </>
              )}
              <button type="button"
                onClick={() => navigate(searchQuery.trim() ? `/compose/pool/deposit/${encodeURIComponent(normalizeAssetQuery(searchQuery))}/XCP` : "/compose/pool/deposit")}
                className="w-full py-2 text-sm text-blue-600 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              >
                {t('market_enter_pool')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
